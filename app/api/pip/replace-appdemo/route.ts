import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { execFileSync } from 'child_process';
import { getFfmpeg } from '@/lib/ffmpegBinaries';
import { getVideoDuration } from '@/lib/serverUtils';
import { createTempWorkspace, cleanupTempWorkspace } from '@/lib/tempWorkspace';
import { downloadToPath, uploadFile } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const f = (n: number) => Math.max(0, Math.min(1, Number(n) || 0)).toFixed(4);

/** Crop the creator inset rectangle out of the PiP clip (keeps audio). */
function cropInset(inLocal: string, box: CropBox, outLocal: string): void {
  execFileSync(
    getFfmpeg(),
    [
      '-y', '-i', inLocal,
      '-vf', `crop=iw*${f(box.w)}:ih*${f(box.h)}:iw*${f(box.x)}:ih*${f(box.y)}`,
      '-c:v', 'libx264', '-c:a', 'aac', outLocal,
    ],
    { timeout: 300000, maxBuffer: 50 * 1024 * 1024 },
  );
}

/** Time-stretch a clip to an exact target duration (speed up / slow down). Drops audio. */
function retimeToDuration(inLocal: string, targetSec: number, outLocal: string): void {
  const src = getVideoDuration(inLocal) || targetSec;
  const factor = Math.max(0.05, Math.min(20, targetSec / src));
  execFileSync(
    getFfmpeg(),
    [
      '-y', '-i', inLocal,
      '-filter:v', `setpts=${factor.toFixed(6)}*PTS`,
      '-an',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast',
      outLocal,
    ],
    { timeout: 300000, maxBuffer: 50 * 1024 * 1024 },
  );
}

/** Composite the creator inset rectangle over the new app demo at the same corner. */
function composeInset(bgLocal: string, insetLocal: string, box: CropBox, outLocal: string): void {
  const CANVAS_W = 1080;
  const CANVAS_H = 1920;
  const pipW = Math.max(2, Math.round(box.w * CANVAS_W));
  const pipH = Math.max(2, Math.round(box.h * CANVAS_H));
  const pipX = Math.round(box.x * CANVAS_W);
  const pipY = Math.round(box.y * CANVAS_H);
  execFileSync(
    getFfmpeg(),
    [
      '-y',
      '-i', bgLocal,
      '-i', insetLocal,
      '-filter_complex',
      `[0:v]scale=${CANVAS_W}:${CANVAS_H}:force_original_aspect_ratio=increase,crop=${CANVAS_W}:${CANVAS_H},setsar=1[bg];` +
        `[1:v]scale=${pipW}:${pipH}:force_original_aspect_ratio=increase,crop=${pipW}:${pipH}[fg];` +
        `[bg][fg]overlay=${pipX}:${pipY}:shortest=1[v]`,
      '-map', '[v]',
      '-map', '1:a?', // creator VO from the inset
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast',
      '-c:a', 'aac', '-shortest',
      outLocal,
    ],
    { timeout: 300000, maxBuffer: 50 * 1024 * 1024 },
  );
}

/**
 * POST /api/pip/replace-appdemo  { source, appDemo, crop }
 * Replaces the app-demo background inside a PiP clip with the connected app demo:
 * keeps the creator inset rectangle (crop), retimes the new app demo to match, and
 * composites the inset over it at the same corner. Returns { clip }.
 */
export async function POST(req: NextRequest) {
  try {
    const { source, appDemo, crop } = await req.json();
    if (!source || !appDemo || !crop) {
      return NextResponse.json({ error: 'source, appDemo and crop are required' }, { status: 400 });
    }
    const box: CropBox = { x: crop.x, y: crop.y, w: crop.w, h: crop.h };

    const ws = createTempWorkspace('adstudio-replace-appdemo');
    try {
      const srcLocal = path.join(ws, 'source.mp4');
      const bgLocal = path.join(ws, 'appdemo.mp4');
      await Promise.all([downloadToPath(source, srcLocal), downloadToPath(appDemo, bgLocal)]);

      // 1. keep the creator inset rectangle
      const insetLocal = path.join(ws, 'inset.mp4');
      cropInset(srcLocal, box, insetLocal);

      // 2. match the app demo's length to the PiP clip's length
      const targetSec = getVideoDuration(srcLocal) || getVideoDuration(insetLocal) || 0;
      let bgForComposite = bgLocal;
      if (targetSec > 0 && Math.abs((getVideoDuration(bgLocal) || targetSec) - targetSec) > 0.15) {
        const retimed = path.join(ws, 'appdemo-retimed.mp4');
        retimeToDuration(bgLocal, targetSec, retimed);
        bgForComposite = retimed;
      }

      // 3. composite the inset over the new app demo
      const outLocal = path.join(ws, 'pip-replaced.mp4');
      composeInset(bgForComposite, insetLocal, box, outLocal);
      const clip = await uploadFile(outLocal, { folder: 'gen/pip', contentType: 'video/mp4' });

      return NextResponse.json({ clip });
    } finally {
      cleanupTempWorkspace(ws);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'App-demo replacement failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
