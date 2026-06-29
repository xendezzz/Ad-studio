import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { execFileSync } from 'child_process';
import { getFfmpeg, getFfprobe } from '@/lib/ffmpegBinaries';
import { createTempWorkspace, cleanupTempWorkspace } from '@/lib/tempWorkspace';
import { downloadToPath, uploadFile } from '@/lib/storage';
import { getMotionEngine } from '@/lib/motionEngine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 800;

interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const f = (n: number) => Math.max(0, Math.min(1, Number(n) || 0)).toFixed(4);

/** Crop the creator inset out of the PiP frame, then upscale to ≥720px so FAL accepts it. */
function cropCreator(inLocal: string, box: CropBox, outLocal: string): void {
  execFileSync(
    getFfmpeg(),
    [
      '-y', '-i', inLocal,
      '-vf', `crop=iw*${f(box.w)}:ih*${f(box.h)}:iw*${f(box.x)}:ih*${f(box.y)},scale='max(720,iw)':-2:flags=lanczos`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', outLocal,
    ],
    { timeout: 300000, maxBuffer: 50 * 1024 * 1024 },
  );
}

function probeDims(local: string): { w: number; h: number } {
  try {
    const out = execFileSync(
      getFfprobe(),
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', local],
      { encoding: 'utf-8' },
    ).trim();
    const [w, h] = out.split('x').map(Number);
    return { w: w || 1080, h: h || 1920 };
  } catch {
    return { w: 1080, h: 1920 };
  }
}

/** Overlay the swapped creator inset back into the original frame at the same box. Audio = original VO. */
function composeBack(srcLocal: string, insetLocal: string, box: CropBox, outLocal: string): void {
  const { w, h } = probeDims(srcLocal);
  const pipW = Math.max(2, Math.round(box.w * w));
  const pipH = Math.max(2, Math.round(box.h * h));
  const pipX = Math.round(box.x * w);
  const pipY = Math.round(box.y * h);
  execFileSync(
    getFfmpeg(),
    [
      '-y',
      '-i', srcLocal,
      '-i', insetLocal,
      '-filter_complex',
      `[1:v]scale=${pipW}:${pipH}:force_original_aspect_ratio=increase,crop=${pipW}:${pipH}[fg];` +
        `[0:v][fg]overlay=${pipX}:${pipY}:shortest=1[v]`,
      '-map', '[v]',
      '-map', '0:a?', // creator VO from the original PiP clip
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast',
      '-c:a', 'aac', '-shortest',
      outLocal,
    ],
    { timeout: 300000, maxBuffer: 50 * 1024 * 1024 },
  );
}

/**
 * POST /api/motion-control/pip-face  { image, source, crop, keepOriginalSound?, prompt? }
 * Face-swap a PiP clip: crop just the creator inset, motion-control it (using the approved
 * first frame as the character), then composite the swapped creator back into the frame.
 * The app-demo background is untouched here (replace it separately). Returns { clip }.
 */
export async function POST(req: NextRequest) {
  try {
    const { image, source, crop, keepOriginalSound, prompt } = await req.json();
    if (!image || !source || !crop) {
      return NextResponse.json({ error: 'image, source and crop are required' }, { status: 400 });
    }
    const box: CropBox = { x: crop.x, y: crop.y, w: crop.w, h: crop.h };

    const ws = createTempWorkspace('adstudio-pipface');
    try {
      const srcLocal = path.join(ws, 'source.mp4');
      await downloadToPath(source, srcLocal);

      // 1. crop the creator inset (upscaled for FAL)
      const cropLocal = path.join(ws, 'creator.mp4');
      cropCreator(srcLocal, box, cropLocal);
      const cropPath = await uploadFile(cropLocal, { folder: 'gen/pip-crop', contentType: 'video/mp4' });

      // 2. motion-control the cropped creator
      const engine = getMotionEngine();
      let swappedPath: string;
      try {
        const r = await engine.motionControl({
          imagePath: image,
          driverVideoPath: cropPath,
          keepOriginalSound: keepOriginalSound !== false,
          prompt: typeof prompt === 'string' && prompt ? prompt : undefined,
        });
        swappedPath = r.outputPath;
      } catch (mcErr) {
        let msg = mcErr instanceof Error ? mcErr.message : String(mcErr);
        const body = (mcErr as { body?: unknown })?.body;
        if (Array.isArray(body) && body.length) {
          const fst = body[0] as { msg?: string; message?: string; detail?: string };
          msg = fst?.msg || fst?.message || fst?.detail || msg;
        }
        console.error('[pip-face] motion-control failed:', msg, body ?? '');
        throw new Error(`motion-control on the cropped creator failed — ${msg}`);
      }

      // 3. composite the swapped creator back into the frame
      const insetLocal = path.join(ws, 'inset.mp4');
      await downloadToPath(swappedPath, insetLocal);
      const outLocal = path.join(ws, 'pip-face.mp4');
      composeBack(srcLocal, insetLocal, box, outLocal);
      const clip = await uploadFile(outLocal, { folder: 'gen/pip', contentType: 'video/mp4' });

      return NextResponse.json({ clip });
    } finally {
      cleanupTempWorkspace(ws);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PiP face swap failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
