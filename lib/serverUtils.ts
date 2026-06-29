import { execFileSync } from 'child_process'
import fs from 'fs'
import https from 'https'
import http from 'http'
import os from 'os'
import path from 'path'
import { getFfmpeg, getFfprobe } from './ffmpegBinaries'
import { isRetryableError, retry } from './retry'

/** Get MIME content type from a URL by inspecting its extension */
export function getContentType(url: string): string {
  return getContentTypeFromExtension(getExtensionFromUrl(url))
}

/** Map a file extension (e.g. ".png") to a MIME type */
export function getContentTypeFromExtension(ext: string): string {
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  }
  return map[ext.toLowerCase()] || 'application/octet-stream'
}

/** Extract a file extension from a URL (defaults to ".mp4") */
export function getExtensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = path.extname(pathname).toLowerCase()
    return ext || '.mp4'
  } catch {
    return '.mp4'
  }
}

/** Get video duration in seconds using ffprobe */
export function getVideoDuration(filePath: string): number {
  const output = execFileSync(getFfprobe(), [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ], { encoding: 'utf-8' })
  return parseFloat(output.trim()) || 0
}

/** Trim a video to maxSeconds using ffmpeg */
export function trimVideo(inputPath: string, outputPath: string, maxSeconds: number): void {
  execFileSync(getFfmpeg(), [
    '-y',
    '-i', inputPath,
    '-t', String(maxSeconds),
    '-c', 'copy',
    outputPath,
  ])
}

/** Extract random frames from a video file */
export function extractRandomFrames(videoPath: string, count = 10): Array<{ timestamp: number; buffer: Buffer }> {
  const duration = getVideoDuration(videoPath)
  if (duration <= 0) throw new Error('Could not determine video duration')

  const margin = 0.5
  const minTs = Math.min(margin, duration * 0.1)
  const maxTs = Math.max(duration - margin, duration * 0.9)

  // Always include the very first frame (timestamp 0), then pick (count-1) random ones
  const timestamps: number[] = [0]
  for (let i = 1; i < count; i++) {
    timestamps.push(minTs + Math.random() * (maxTs - minTs))
  }
  timestamps.sort((a, b) => a - b)

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-'))
  const frames: Array<{ timestamp: number; buffer: Buffer }> = []

  try {
    for (const ts of timestamps) {
      const outPath = path.join(tmpDir, `frame-${ts.toFixed(3)}.jpg`)
      execFileSync(getFfmpeg(), [
        '-ss', String(ts),
        '-i', videoPath,
        '-vframes', '1',
        '-q:v', '2',
        '-y',
        outPath,
      ])
      if (fs.existsSync(outPath)) {
        frames.push({ timestamp: ts, buffer: fs.readFileSync(outPath) })
        fs.unlinkSync(outPath)
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }

  return frames
}

/** Extract evenly-spaced frames from a video (lightweight, no AI scoring) */
export function extractEvenlySpacedFrames(
  videoPath: string,
  count = 15,
  thumbnailWidth = 120,
): Array<{ timestamp: number; buffer: Buffer }> {
  const duration = getVideoDuration(videoPath)
  if (duration <= 0) throw new Error('Could not determine video duration')

  const timestamps: number[] = []
  for (let i = 0; i < count; i++) {
    timestamps.push((i / (count - 1)) * duration)
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timeline-'))
  const frames: Array<{ timestamp: number; buffer: Buffer }> = []

  try {
    for (const ts of timestamps) {
      const outPath = path.join(tmpDir, `frame-${ts.toFixed(3)}.jpg`)
      execFileSync(getFfmpeg(), [
        '-ss', String(ts),
        '-i', videoPath,
        '-vframes', '1',
        '-vf', `scale=${thumbnailWidth}:-1`,
        '-q:v', '4',
        '-y',
        outPath,
      ])
      if (fs.existsSync(outPath)) {
        frames.push({ timestamp: ts, buffer: fs.readFileSync(outPath) })
        fs.unlinkSync(outPath)
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }

  return frames
}

/** Trim a video to a specific time range using ffmpeg (stream copy) */
export function trimVideoRange(
  inputPath: string,
  outputPath: string,
  startSec: number,
  endSec: number,
): void {
  const duration = endSec - startSec
  execFileSync(getFfmpeg(), [
    '-y',
    '-ss', String(startSec),
    '-i', inputPath,
    '-t', String(duration),
    '-c', 'copy',
    outputPath,
  ])
}

/** Download a file from a URL to a local path */
export function downloadFile(url: string, destPath: string): Promise<void> {
  return retry(() => new Promise<void>((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    const client = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(destPath)
    client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        try { fs.unlinkSync(destPath) } catch {}
        return downloadFile(res.headers.location, destPath).then(resolve, reject)
      }
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        file.close()
        reject(new Error(`Download failed with status ${res.statusCode}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
      file.on('error', (err) => { try { fs.unlinkSync(destPath) } catch {}; reject(err) })
    }).on('error', (err) => {
      try { fs.unlinkSync(destPath) } catch {}
      reject(err)
    })
  }), {
    retries: 3,
    delaysMs: [1000, 3000, 7000],
    shouldRetry: (error) =>
      isRetryableError(error) ||
      (error instanceof Error && /status (408|429|5\d\d)\b/.test(error.message)),
    onRetry: (error, attempt, delayMs) => {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[Download] ${url} failed (attempt ${attempt}), retrying in ${delayMs}ms: ${message}`)
    },
  })
}
