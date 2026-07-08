import { execFileSync } from 'child_process';
import { getFfmpeg, getFfprobe } from './ffmpegBinaries';
import type { BgMusicConfig } from '@/types';
export function stripAudio(inputPath: string, outputPath: string): void {
  execFileSync(getFfmpeg(), [
    '-y',
    '-i', inputPath,
    '-c:v', 'copy',
    '-an',
    outputPath,
  ]);
}

/**
 * Mix a background music track into a video using ffmpeg amix filter.
 */
export function mixAudio(
  inputPath: string,
  audioPath: string,
  outputPath: string,
  config: BgMusicConfig
): void {
  const { volume = 30, fadeIn, fadeOut } = config;
  const vol = volume / 100;

  // Get video duration for fade-out calculation
  let videoDuration = 0;
  try {
    const output = execFileSync(getFfprobe(), [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ], { encoding: 'utf-8' });
    videoDuration = parseFloat(output.trim()) || 0;
  } catch {
    // If we can't get duration, proceed without fade-out
  }

  // Build audio filter chain for the music track
  let audioFilter = `[1:a]volume=${vol}`;
  if (fadeIn) {
    audioFilter += `,afade=t=in:d=${fadeIn}`;
  }
  if (fadeOut && videoDuration > 0) {
    const fadeOutStart = Math.max(0, videoDuration - fadeOut);
    audioFilter += `,afade=t=out:st=${fadeOutStart}:d=${fadeOut}`;
  }
  audioFilter += '[a1]';

  // Check if input video has audio
  let hasAudio = true;
  try {
    const probeOut = execFileSync(getFfprobe(), [
      '-v', 'error',
      '-select_streams', 'a',
      '-show_entries', 'stream=index',
      '-of', 'csv=p=0',
      inputPath,
    ], { encoding: 'utf-8' });
    hasAudio = probeOut.trim().length > 0;
  } catch {
    hasAudio = false;
  }

  if (hasAudio && config.audioMode !== 'replace') {
    execFileSync(getFfmpeg(), [
      '-y',
      '-i', inputPath,
      '-i', audioPath,
      '-filter_complex', `${audioFilter};[0:a][a1]amix=inputs=2:duration=first`,
      '-c:v', 'copy',
      outputPath,
    ], { maxBuffer: 50 * 1024 * 1024 });
  } else {
    // No existing audio — just use the music track
    execFileSync(getFfmpeg(), [
      '-y',
      '-i', inputPath,
      '-i', audioPath,
      '-filter_complex', `${audioFilter}`,
      '-map', '0:v',
      '-map', '[a1]',
      '-c:v', 'copy',
      '-shortest',
      outputPath,
    ], { maxBuffer: 50 * 1024 * 1024 });
  }
}

/**
 * Concatenate multiple videos using ffmpeg concat filter.
 * Normalizes resolution, framerate, and pixel format so mixed-source videos work.
 */
export function concatVideos(videoPaths: string[], outputPath: string): void {
  // Probe the first video to get target resolution
  let targetW = 720;
  let targetH = 1280;
  try {
    const probe = execFileSync(getFfprobe(), [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0:s=x',
      videoPaths[0],
    ], { encoding: 'utf-8' }).trim();
    const [w, h] = probe.split('x').map(Number);
    if (w > 0 && h > 0) { targetW = w; targetH = h; }
  } catch {}

  const n = videoPaths.length;
  const inputs: string[] = [];
  videoPaths.forEach((p) => { inputs.push('-i', p); });

  // Build filter: scale + pad each input to target size, add silent audio if missing, then concat
  const filters: string[] = [];
  const concatInputs: string[] = [];

  for (let i = 0; i < n; i++) {
    // Check if this input has audio
    let hasAudio = false;
    try {
      const audioProbe = execFileSync(getFfprobe(), [
        '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0',
        videoPaths[i],
      ], { encoding: 'utf-8' });
      hasAudio = audioProbe.trim().length > 0;
    } catch {}

    filters.push(
      `[${i}:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,` +
      `pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,` +
      `setsar=1,fps=30,format=yuv420p[v${i}]`
    );

    if (hasAudio) {
      filters.push(`[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`);
    } else {
      // Probe duration to limit silent audio (anullsrc is infinite by default)
      let dur = 10;
      try {
        const dOut = execFileSync(getFfprobe(), [
          '-v', 'error', '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1', videoPaths[i],
        ], { encoding: 'utf-8' });
        dur = parseFloat(dOut.trim()) || 10;
      } catch {}
      filters.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${dur}[a${i}]`);
    }

    concatInputs.push(`[v${i}][a${i}]`);
  }

  filters.push(`${concatInputs.join('')}concat=n=${n}:v=1:a=1[vout][aout]`);

  execFileSync(getFfmpeg(), [
    '-y',
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '[vout]',
    '-map', '[aout]',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-c:a', 'aac',
    '-shortest',
    outputPath,
  ], { maxBuffer: 50 * 1024 * 1024 });
}

/**
 * Re-encode a video at a chosen x264 quality (CRF + preset). Audio is re-encoded to AAC
 * so odd source codecs don't break MP4 output; faststart for web playback.
 */
export function encodeQuality(inputPath: string, outputPath: string, crf: number, preset: string): void {
  execFileSync(getFfmpeg(), [
    '-y',
    '-i', inputPath,
    '-c:v', 'libx264',
    '-crf', String(crf),
    '-preset', preset,
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    outputPath,
  ], { timeout: 600000, maxBuffer: 50 * 1024 * 1024 });
}

function probeWH(file: string): { w: number; h: number } {
  try {
    const out = execFileSync(getFfprobe(), [
      '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file,
    ], { encoding: 'utf-8' }).trim();
    const [w, h] = out.split('x').map(Number);
    if (w > 0 && h > 0) return { w, h };
  } catch {}
  return { w: 720, h: 1280 };
}
function probeDuration(file: string): number {
  try {
    const out = execFileSync(getFfprobe(), [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file,
    ], { encoding: 'utf-8' });
    return parseFloat(out.trim()) || 0;
  } catch { return 0; }
}

/**
 * Crossfade two clips into one with an ffmpeg xfade (+ matching audio acrossfade). Both clips are
 * normalized to the FIRST clip's resolution & 30fps so xfade can blend them; missing audio is
 * filled with silence. `type` is an xfade transition name (fade, dissolve, wipeleft, slideup, …);
 * `dur` is the overlap in seconds. Total length = durA + durB − dur.
 */
export function xfadeVideos(aPath: string, bPath: string, outputPath: string, type: string, dur: number): void {
  const { w, h } = probeWH(aPath);
  const durA = probeDuration(aPath) || 1;
  const d = Math.max(0.1, Math.min(dur, durA - 0.05)); // can't overlap longer than the first clip
  const offset = Math.max(0, durA - d);

  const filters: string[] = [];
  const norm = (i: number) =>
    `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`;
  [aPath, bPath].forEach((file, i) => {
    filters.push(norm(i));
    let hasAudio = false;
    try {
      hasAudio = execFileSync(getFfprobe(), ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file], { encoding: 'utf-8' }).trim().length > 0;
    } catch {}
    if (hasAudio) filters.push(`[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`);
    else filters.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${(probeDuration(file) || 10).toFixed(2)}[a${i}]`);
  });
  filters.push(`[v0][v1]xfade=transition=${type}:duration=${d.toFixed(3)}:offset=${offset.toFixed(3)}[vout]`);
  filters.push(`[a0][a1]acrossfade=d=${d.toFixed(3)}[aout]`);

  execFileSync(getFfmpeg(), [
    '-y',
    '-i', aPath,
    '-i', bPath,
    '-filter_complex', filters.join(';'),
    '-map', '[vout]',
    '-map', '[aout]',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-c:a', 'aac',
    outputPath,
  ], { timeout: 300000, maxBuffer: 50 * 1024 * 1024 });
}
