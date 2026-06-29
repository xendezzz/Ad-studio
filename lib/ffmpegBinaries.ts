import { chmodSync, copyFileSync, existsSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

const FFMPEG_SRC = (ffmpegStatic as unknown as string) || '';
const FFPROBE_SRC =
  typeof ffprobeInstaller === 'string'
    ? ffprobeInstaller
    : (ffprobeInstaller as { path: string }).path || '';

let cachedFfmpeg: string | null = null;
let cachedFfprobe: string | null = null;

function ensureExecutable(src: string, tmpName: string, fallback: string): string {
  if (!src) return fallback;
  try {
    const st = statSync(src);
    if ((st.mode & 0o111) === 0) chmodSync(src, 0o755);
    return src;
  } catch {
    try {
      const dst = join(tmpdir(), tmpName);
      if (!existsSync(dst)) copyFileSync(src, dst);
      chmodSync(dst, 0o755);
      return dst;
    } catch {
      return fallback;
    }
  }
}

export function getFfmpeg(): string {
  if (cachedFfmpeg) return cachedFfmpeg;
  cachedFfmpeg = ensureExecutable(FFMPEG_SRC, 'ffmpeg', 'ffmpeg');
  return cachedFfmpeg;
}

export function getFfprobe(): string {
  if (cachedFfprobe) return cachedFfprobe;
  cachedFfprobe = ensureExecutable(FFPROBE_SRC, 'ffprobe', 'ffprobe');
  return cachedFfprobe;
}
