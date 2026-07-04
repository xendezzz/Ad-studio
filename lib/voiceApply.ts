/**
 * Voice-over apply — the single source of truth for the Voice node.
 *
 *   1. extract the clip's audio
 *   2. Demucs (FAL) splits it into vocals vs background stems — a REAL separation,
 *      so the background contains zero original voice (no ghost/echo)
 *   3. ElevenLabs speech-to-speech converts ONLY the vocals stem (same timing)
 *   4. converted voice is mixed back over the untouched background (music/SFX kept)
 *   5. remux into the video
 *
 * If separation fails, falls back to converting the full mix (voice only, no bg bed).
 * Used by POST /api/voice and runPipeline.
 */
import path from 'path';
import { promises as fs } from 'fs';
import { execFileSync } from 'child_process';
import { fal } from '@fal-ai/client';
import { config } from './config';
import { getFfmpeg } from './ffmpegBinaries';
import { speechToSpeech } from './elevenlabs';
import { createTempWorkspace, cleanupTempWorkspace } from './tempWorkspace';
import { downloadToPath, uploadFile, getSignedUrl } from './storage';

let _falReady = false;
function ensureFal() {
  if (!_falReady) {
    fal.config({ credentials: config.falKey });
    _falReady = true;
  }
}

const FFMPEG_OPTS = { timeout: 300000, maxBuffer: 50 * 1024 * 1024 } as const;

async function downloadUrl(url: string, dest: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`stem download failed (${res.status})`);
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

/**
 * Demucs 4-stem split → { vocals, bg } local files, where bg = drums+bass+other
 * mixed at original levels. The vocals stem is fully REMOVED from bg (true source
 * separation, not subtraction). Returns null if separation isn't usable.
 */
async function separateStems(audioLocal: string, workspace: string): Promise<{ vocals: string; bg: string } | null> {
  try {
    ensureFal();
    const audioPath = await uploadFile(audioLocal, { folder: 'gen/voice', contentType: 'audio/mpeg' });
    const audioUrl = await getSignedUrl(audioPath, 3600);
    // stems MUST be explicit: FAL's default requests guitar/piano, which 'htdemucs'
    // doesn't have — the job then errors and we'd silently lose the separation.
    const result = await fal.subscribe('fal-ai/demucs', {
      input: {
        audio_url: audioUrl,
        model: 'htdemucs',
        stems: ['vocals', 'drums', 'bass', 'other'],
        output_format: 'mp3',
      },
      logs: false,
    });
    const stems = result.data as Record<string, { url?: string } | undefined>;
    if (!stems?.vocals?.url) return null;

    const vocals = await downloadUrl(stems.vocals.url, path.join(workspace, 'vocals.mp3'));
    const bgParts: string[] = [];
    for (const name of ['drums', 'bass', 'other'] as const) {
      const url = stems[name]?.url;
      if (url) bgParts.push(await downloadUrl(url, path.join(workspace, `${name}.mp3`)));
    }
    if (!bgParts.length) return null;

    // recombine the non-vocal stems into one background track (levels preserved)
    const bg = path.join(workspace, 'bg.mp3');
    if (bgParts.length === 1) {
      await fs.copyFile(bgParts[0], bg);
    } else {
      const inputs = bgParts.flatMap((p) => ['-i', p]);
      const labels = bgParts.map((_, i) => `[${i}:a]`).join('');
      execFileSync(
        getFfmpeg(),
        ['-y', ...inputs, '-filter_complex', `${labels}amix=inputs=${bgParts.length}:duration=longest:normalize=0[a]`, '-map', '[a]', '-c:a', 'libmp3lame', '-q:a', '2', bg],
        FFMPEG_OPTS,
      );
    }
    return { vocals, bg };
  } catch (e) {
    console.warn('[voice] stem separation failed — converting the full mix instead:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function applyVoice(
  videoStoragePath: string,
  opts: { voiceId?: string },
): Promise<string> {
  const workspace = createTempWorkspace('voice');
  try {
    const local = path.join(workspace, 'in.mp4');
    await downloadToPath(videoStoragePath, local);

    // extract the original audio as MP3
    const srcAudio = path.join(workspace, 'src.mp3');
    try {
      execFileSync(
        getFfmpeg(),
        ['-y', '-i', local, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', srcAudio],
        FFMPEG_OPTS,
      );
    } catch {
      throw new Error('This clip has no audio track to re-voice.');
    }

    // split speaker vs background so music/SFX survive the voice change
    const stems = await separateStems(srcAudio, workspace);

    const converted = await speechToSpeech({
      audio: await fs.readFile(stems?.vocals ?? srcAudio),
      voiceId: opts.voiceId || undefined,
    });
    const voFile = path.join(workspace, 'vo.mp3');
    await fs.writeFile(voFile, converted);

    // lay the converted voice back over the clean background (no original voice in it)
    let finalAudio = voFile;
    if (stems) {
      finalAudio = path.join(workspace, 'final.mp3');
      execFileSync(
        getFfmpeg(),
        ['-y', '-i', voFile, '-i', stems.bg, '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=longest:normalize=0[a]', '-map', '[a]', '-c:a', 'libmp3lame', '-q:a', '2', finalAudio],
        FFMPEG_OPTS,
      );
    }

    // original audio is dropped entirely (-map 0:v only), replaced by the rebuilt track
    const out = path.join(workspace, 'voiced.mp4');
    execFileSync(
      getFfmpeg(),
      ['-y', '-i', local, '-i', finalAudio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-shortest', out],
      FFMPEG_OPTS,
    );
    return await uploadFile(out, { folder: 'gen/voice' });
  } finally {
    cleanupTempWorkspace(workspace);
  }
}
