/**
 * Motion-control engine adapter.
 *
 * One interface, two implementations:
 *   - falKlingEngine   (PRIMARY) — FAL Kling 2.6 motion-control
 *   - higgsfieldEngine (switchable) — placeholder until wired to Higgsfield
 *
 * Engine is chosen by config.motionEngine (env MOTION_ENGINE), so callers never
 * hardcode a provider:
 *
 *   const engine = getMotionEngine();
 *   const { outputPath } = await engine.motionControl({ imagePath, driverVideoPath });
 *
 * Inputs/outputs are Supabase Storage object PATHS. The adapter signs URLs for the
 * engine to fetch, runs the job, downloads the result, and re-uploads to Storage.
 */
import path from 'path';
import { promises as fs } from 'fs';
import { execFileSync } from 'child_process';
import { fal } from '@fal-ai/client';
import { config } from './config';
import { getSignedUrl, uploadBuffer, uploadFile, downloadToPath } from './storage';
import { getFfmpeg, getFfprobe } from './ffmpegBinaries';
import { getVideoDuration } from './serverUtils';
import { createTempWorkspace, cleanupTempWorkspace } from './tempWorkspace';

export interface MotionControlInput {
  /** Persona still — Supabase Storage object path. */
  imagePath: string;
  /** Driver clip — Supabase Storage object path. Should be >=3s and >=360px wide. */
  driverVideoPath: string;
  /** Keep the driver's original audio (the new face lip-syncs to it). Default true. */
  keepOriginalSound?: boolean;
  /** Optional motion/style prompt. */
  prompt?: string;
  /**
   * Which subject the output is framed on. 'video' needs a full upper body in the DRIVER clip
   * (good for full-frame swaps); 'image' frames on the persona still and tolerates close-up
   * drivers (needed for tight PiP crops). Default 'video'; the engine auto-retries the other
   * mode if the upper-body check rejects the input.
   */
  characterOrientation?: 'video' | 'image';
}

export interface MotionControlResult {
  /** Swapped clip — Supabase Storage object path. */
  outputPath: string;
  /** Engine-side request id (for logging/recovery). */
  externalRequestId?: string;
}

export interface MotionEngine {
  readonly name: 'fal' | 'higgsfield';
  motionControl(input: MotionControlInput): Promise<MotionControlResult>;
}

// --- FAL Kling 2.6 (primary) ---

const FAL_MOTION_CONTROL_ENDPOINT = 'fal-ai/kling-video/v2.6/standard/motion-control';

/** Kling won't accept very short drivers — clips under this are slowed to exactly this length. */
const MIN_DRIVER_SEC = 5;

/** ffmpeg atempo only accepts 0.5–2.0 per stage; chain stages for factors outside that. */
function atempoChain(factor: number): string {
  const parts: string[] = [];
  let r = factor;
  while (r < 0.5) { parts.push('atempo=0.5'); r /= 0.5; }
  while (r > 2) { parts.push('atempo=2.0'); r /= 2; }
  parts.push(`atempo=${r.toFixed(6)}`);
  return parts.join(',');
}

function hasAudioStream(local: string): boolean {
  try {
    const out = execFileSync(
      getFfprobe(),
      ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', local],
      { encoding: 'utf-8' },
    ).trim();
    return out.includes('audio');
  } catch {
    return false;
  }
}

/** Re-time a clip: speed > 1 = faster/shorter, speed < 1 = slower/longer (audio pitch preserved). */
function retimeClip(inLocal: string, outLocal: string, speed: number): void {
  const withAudio = hasAudioStream(inLocal);
  const args = withAudio
    ? ['-filter_complex', `[0:v]setpts=PTS/${speed}[v];[0:a]${atempoChain(speed)}[a]`, '-map', '[v]', '-map', '[a]', '-c:a', 'aac']
    : ['-vf', `setpts=PTS/${speed}`, '-an'];
  execFileSync(
    getFfmpeg(),
    ['-y', '-i', inLocal, ...args, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', outLocal],
    { timeout: 300000, maxBuffer: 50 * 1024 * 1024 },
  );
}

let _falConfigured = false;
function ensureFalConfigured() {
  if (!_falConfigured) {
    fal.config({ credentials: config.falKey });
    _falConfigured = true;
  }
}

export const falKlingEngine: MotionEngine = {
  name: 'fal',
  async motionControl(input: MotionControlInput): Promise<MotionControlResult> {
    ensureFalConfigured();

    // Kling rejects very short drivers — slow a <5s clip to exactly 5s first, and
    // remember the factor so the swapped output is sped back to the true duration.
    const ws = createTempWorkspace('mc-retime');
    try {
    let driverVideoPath = input.driverVideoPath;
    let slowFactor = 1; // <1 means the driver was slowed down
    try {
      const driverLocal = path.join(ws, 'driver.mp4');
      await downloadToPath(input.driverVideoPath, driverLocal);
      const dur = getVideoDuration(driverLocal) || 0;
      if (dur > 0 && dur < MIN_DRIVER_SEC) {
        slowFactor = dur / MIN_DRIVER_SEC;
        console.warn(`[motion-control] driver is ${dur.toFixed(2)}s (<${MIN_DRIVER_SEC}s) — slowing to ${MIN_DRIVER_SEC}s for Kling`);
        const slowedLocal = path.join(ws, 'driver-slow.mp4');
        retimeClip(driverLocal, slowedLocal, slowFactor);
        driverVideoPath = await uploadFile(slowedLocal, { folder: 'gen/motion-control', contentType: 'video/mp4' });
      }
    } catch (e) {
      // pre-timing is best-effort — fall back to the original driver
      console.warn('[motion-control] duration pre-check failed, using original driver:', e instanceof Error ? e.message : e);
      driverVideoPath = input.driverVideoPath;
      slowFactor = 1;
    }

    // Sign the inputs so FAL can fetch them.
    const [imageUrl, videoUrl] = await Promise.all([
      getSignedUrl(input.imagePath, 3600),
      getSignedUrl(driverVideoPath, 3600),
    ]);

    // One submit+poll at a given orientation.
    const runAt = async (orientation: 'video' | 'image') => {
      const { request_id } = await fal.queue.submit(FAL_MOTION_CONTROL_ENDPOINT, {
        input: {
          image_url: imageUrl,
          video_url: videoUrl,
          character_orientation: orientation,
          keep_original_sound: input.keepOriginalSound ?? true,
          ...(input.prompt ? { prompt: input.prompt } : {}),
        },
      });
      await fal.queue.subscribeToStatus(FAL_MOTION_CONTROL_ENDPOINT, { requestId: request_id, logs: false });
      const result = await fal.queue.result(FAL_MOTION_CONTROL_ENDPOINT, { requestId: request_id });
      return { result, request_id };
    };

    // 'video' orientation requires a full upper body in the driver; if that check rejects a
    // tight (PiP) crop, retry framing on the persona image instead ('image').
    const isUpperBodyReject = (e: unknown) => {
      const msg = (e instanceof Error ? e.message : String(e)) + ' ' + JSON.stringify((e as { body?: unknown })?.body ?? '');
      return /upper body|character_orientation|no complete/i.test(msg);
    };
    const describeFalError = (e: unknown) => {
      const body = (e as { body?: unknown })?.body;
      return `${e instanceof Error ? e.message : String(e)}${body ? ` — body: ${JSON.stringify(body)}` : ''}`;
    };
    const primary = input.characterOrientation ?? 'video';
    const fallback = primary === 'video' ? 'image' : 'video';
    let request_id: string;
    let result: Awaited<ReturnType<typeof runAt>>['result'];
    try {
      ({ result, request_id } = await runAt(primary));
    } catch (e) {
      if (!isUpperBodyReject(e)) {
        console.error(`[motion-control] FAL "${primary}" failed: ${describeFalError(e)}`);
        throw e;
      }
      console.warn(`[motion-control] "${primary}" orientation rejected (upper-body check) — retrying with "${fallback}"`);
      try {
        ({ result, request_id } = await runAt(fallback));
      } catch (e2) {
        console.error(`[motion-control] FAL retry "${fallback}" also failed: ${describeFalError(e2)}`);
        throw new Error(
          `Kling rejected both orientations — the part clip (and its first frame) likely doesn't show a complete upper body. ` +
          `FAL said: ${describeFalError(e2)}`,
        );
      }
    }

    const videoData =
      (result.data as { video?: { url?: string } })?.video ??
      (result as unknown as { video?: { url?: string } }).video;
    if (!videoData?.url) throw new Error('No video URL returned from FAL motion-control');

    // Download FAL output and store it in our bucket.
    const res = await fetch(videoData.url);
    if (!res.ok) throw new Error(`Failed to download motion-control output (${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());

    let outputPath: string;
    if (slowFactor < 1) {
      // driver was slowed to meet the 5s minimum — speed the swap back to the true duration
      const swapLocal = path.join(ws, 'swap.mp4');
      await fs.writeFile(swapLocal, buffer);
      const restoredLocal = path.join(ws, 'swap-restored.mp4');
      retimeClip(swapLocal, restoredLocal, 1 / slowFactor);
      outputPath = await uploadFile(restoredLocal, { folder: 'gen/motion-control', contentType: 'video/mp4' });
    } else {
      outputPath = await uploadBuffer(buffer, `motion-${request_id}.mp4`, {
        folder: 'gen/motion-control',
        contentType: 'video/mp4',
      });
    }

    return { outputPath, externalRequestId: request_id };
    } finally {
      cleanupTempWorkspace(ws);
    }
  },
};

// --- Higgsfield (switchable placeholder) ---

export const higgsfieldEngine: MotionEngine = {
  name: 'higgsfield',
  async motionControl(): Promise<MotionControlResult> {
    throw new Error(
      'Higgsfield motion-control engine is not wired up yet. ' +
        'Set MOTION_ENGINE=fal to use the primary FAL Kling engine.',
    );
  },
};

// --- Selector ---

/** Returns the active engine per config.motionEngine (MOTION_ENGINE env). FAL is the default. */
export function getMotionEngine(): MotionEngine {
  return config.motionEngine === 'higgsfield' ? higgsfieldEngine : falKlingEngine;
}
