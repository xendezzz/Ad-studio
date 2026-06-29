import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { execFileSync } from 'child_process';
import { getMotionEngine } from '@/lib/motionEngine';
import { getFfmpeg, getFfprobe } from '@/lib/ffmpegBinaries';
import { createTempWorkspace, cleanupTempWorkspace } from '@/lib/tempWorkspace';
import { downloadToPath, uploadFile } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 800;

/** Probe a clip's pixel dimensions (even values for x264). */
function probeDims(local: string): { w: number; h: number } {
  try {
    const out = execFileSync(
      getFfprobe(),
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', local],
      { encoding: 'utf-8' },
    ).trim();
    const [w, h] = out.split('x').map(Number);
    return { w: w ? w - (w % 2) : 0, h: h ? h - (h % 2) : 0 };
  } catch {
    return { w: 0, h: 0 };
  }
}

/** Scale + center-crop a clip to exactly w×h (keeps aspect by cover, no distortion). */
function normalizeToDims(inLocal: string, w: number, h: number, outLocal: string): void {
  execFileSync(
    getFfmpeg(),
    [
      '-y', '-i', inLocal,
      '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', '-c:a', 'aac',
      outLocal,
    ],
    { timeout: 300000, maxBuffer: 50 * 1024 * 1024 },
  );
}

/**
 * POST /api/motion-control  { image, video, keepOriginalSound?, prompt? }
 * Applies motion-control (persona swap) — recasts the driver `video` as the persona
 * `image` via the active engine (FAL Kling). The output is normalized to the driver
 * clip's own dimensions so every generated clip keeps the source ad's aspect ratio.
 * Returns { clip: <outputPath> }.
 */
export async function POST(req: NextRequest) {
  try {
    const { image, video, keepOriginalSound, prompt } = await req.json();
    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'image (persona) is required' }, { status: 400 });
    }
    if (!video || typeof video !== 'string') {
      return NextResponse.json({ error: 'video (driver clip) is required' }, { status: 400 });
    }

    const engine = getMotionEngine();
    const { outputPath } = await engine.motionControl({
      imagePath: image,
      driverVideoPath: video,
      keepOriginalSound: keepOriginalSound !== false,
      prompt: typeof prompt === 'string' && prompt ? prompt : undefined,
    });

    // normalize the swap to the driver clip's exact dimensions
    const ws = createTempWorkspace('adstudio-mc');
    try {
      const driverLocal = path.join(ws, 'driver.mp4');
      const swapLocal = path.join(ws, 'swap.mp4');
      await Promise.all([downloadToPath(video, driverLocal), downloadToPath(outputPath, swapLocal)]);
      const target = probeDims(driverLocal);
      const got = probeDims(swapLocal);
      if (!target.w || !target.h || (got.w === target.w && got.h === target.h)) {
        return NextResponse.json({ clip: outputPath }); // already matches (or can't probe) — keep as is
      }
      const normLocal = path.join(ws, 'swap-norm.mp4');
      normalizeToDims(swapLocal, target.w, target.h, normLocal);
      const clip = await uploadFile(normLocal, { folder: 'gen/motion-control', contentType: 'video/mp4' });
      return NextResponse.json({ clip });
    } finally {
      cleanupTempWorkspace(ws);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Motion control failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
