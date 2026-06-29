import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { execFileSync } from 'child_process';
import { getFfmpeg, getFfprobe } from '@/lib/ffmpegBinaries';
import { getVideoDuration } from '@/lib/serverUtils';
import { createTempWorkspace, cleanupTempWorkspace } from '@/lib/tempWorkspace';
import { downloadToPath, uploadFile } from '@/lib/storage';
import { getMotionEngine } from '@/lib/motionEngine';
import { removeVideoBackground } from '@/lib/bgRemoval';

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

/**
 * Crop the creator inset out of the PiP frame, then upscale to a safe minimum size.
 * FAL Kling motion-control needs the driver ≥360px wide and nano-banana needs enough
 * pixels to swap a face — a tight PiP crop falls below both, so we scale the cropped
 * region up to ≥720px wide (only upscales; large crops are left as-is). Even dims for x264.
 */
function cropCreator(inLocal: string, box: CropBox, outLocal: string): void {
  const crop = `crop=iw*${f(box.w)}:ih*${f(box.h)}:iw*${f(box.x)}:ih*${f(box.y)}`;
  // scale width up to at least 720 (max(720,iw)), keep aspect, force even height
  const scale = `scale='max(720,iw)':-2:flags=lanczos`;
  execFileSync(
    getFfmpeg(),
    [
      '-y', '-i', inLocal,
      '-vf', `${crop},${scale}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', outLocal,
    ],
    { timeout: 300000, maxBuffer: 50 * 1024 * 1024 },
  );
}

/**
 * Time-stretch a clip to an exact target duration (speed up or slow down its video),
 * so the user's app demo fills the same span the app demo occupied in the original ad.
 * Audio is dropped (the app demo's audio isn't used — the creator VO is).
 */
function retimeToDuration(inLocal: string, targetSec: number, outLocal: string): void {
  const src = getVideoDuration(inLocal) || targetSec;
  // setpts factor > 1 slows the clip down; < 1 speeds it up
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

/** Probe a clip's pixel dimensions (defaults to a 9:16 1080×1920 if it can't be read). */
function probeDims(local: string): { w: number; h: number } {
  try {
    const out = execFileSync(
      getFfprobe(),
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', local],
      { encoding: 'utf-8' },
    ).trim();
    const [w, h] = out.split('x').map(Number);
    // keep dims even (x264 needs it)
    return { w: w ? w - (w % 2) : 1080, h: h ? h - (h % 2) : 1920 };
  } catch {
    return { w: 1080, h: 1920 };
  }
}

/**
 * Composite the alpha creator cutout over the app-demo background, placed at the same
 * box (corner + size) the creator originally occupied. The canvas matches the source
 * clip's own dimensions so the output keeps the original ad's aspect ratio. Audio = VO.
 */
function composeAtBox(bgLocal: string, alphaLocal: string, audioLocal: string, box: CropBox, canvas: { w: number; h: number }, outLocal: string): void {
  const CANVAS_W = canvas.w;
  const CANVAS_H = canvas.h;
  const pipW = Math.max(2, Math.round(box.w * CANVAS_W));
  const pipH = Math.max(2, Math.round(box.h * CANVAS_H));
  const pipX = Math.round(box.x * CANVAS_W);
  const pipY = Math.round(box.y * CANVAS_H);

  execFileSync(
    getFfmpeg(),
    [
      '-y',
      '-i', bgLocal,
      '-c:v', 'libvpx-vp9', '-i', alphaLocal, // alpha-capable decoder for the cutout
      '-i', audioLocal,
      '-filter_complex',
      `[0:v]scale=${CANVAS_W}:${CANVAS_H}:force_original_aspect_ratio=increase,crop=${CANVAS_W}:${CANVAS_H},setsar=1[bg];` +
        `[1:v]scale=${pipW}:${pipH}:force_original_aspect_ratio=increase,crop=${pipW}:${pipH}[fg];` +
        `[bg][fg]overlay=${pipX}:${pipY}:shortest=1[v]`,
      '-map', '[v]',
      '-map', '2:a?',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast',
      '-c:a', 'aac', '-shortest',
      outLocal,
    ],
    { timeout: 300000, maxBuffer: 50 * 1024 * 1024 },
  );
}

/**
 * POST /api/motion-control/pip  { image, pipVideo, appDemo, crop, keepOriginalSound?, prompt? }
 *
 * Full PiP reconstruction:
 *   1. crop the creator inset out of the PiP clip
 *   2. motion-control (swap to our persona, using the approved first frame as the character)
 *   3. remove the background → alpha cutout
 *   4. composite the cutout over OUR app-demo at the same corner
 * Returns { clip: <finalPath> }.
 */
export async function POST(req: NextRequest) {
  try {
    const { image, pipVideo, appDemo, crop, keepOriginalSound, prompt } = await req.json();
    if (!image || !pipVideo || !appDemo || !crop) {
      return NextResponse.json(
        { error: 'image, pipVideo, appDemo and crop are required' },
        { status: 400 },
      );
    }
    const box: CropBox = { x: crop.x, y: crop.y, w: crop.w, h: crop.h };

    const ws = createTempWorkspace('adstudio-pip');
    try {
      // 1. crop the creator inset
      const pipLocal = path.join(ws, 'pip.mp4');
      await downloadToPath(pipVideo, pipLocal);
      const cropLocal = path.join(ws, 'creator.mp4');
      cropCreator(pipLocal, box, cropLocal);
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
        } else if (body && typeof body === 'object') {
          const b = body as Record<string, unknown>;
          const d = b.detail || b.message || b.error;
          if (d) msg = typeof d === 'string' ? d : JSON.stringify(d);
        }
        console.error('[pip] motion-control failed:', msg, body ?? '');
        throw new Error(`motion-control on the cropped creator failed — ${msg}`);
      }

      // 3. remove background → alpha cutout
      const { outputPath: alphaPath } = await removeVideoBackground(swappedPath);

      // 4. composite over the app-demo at the original corner
      const bgLocal = path.join(ws, 'appdemo.mp4');
      const alphaLocal = path.join(ws, 'alpha.webm');
      const audioLocal = path.join(ws, 'swapped.mp4');
      await Promise.all([
        downloadToPath(appDemo, bgLocal),
        downloadToPath(alphaPath, alphaLocal),
        downloadToPath(swappedPath, audioLocal),
      ]);

      // Match the app demo's length to the PiP segment's length (the app-demo duration
      // in the original ad) by fast-forwarding / slowing it down.
      const targetSec = getVideoDuration(pipLocal) || getVideoDuration(audioLocal) || 0;
      let bgForComposite = bgLocal;
      if (targetSec > 0 && Math.abs((getVideoDuration(bgLocal) || targetSec) - targetSec) > 0.15) {
        const stretched = path.join(ws, 'appdemo-retimed.mp4');
        retimeToDuration(bgLocal, targetSec, stretched);
        bgForComposite = stretched;
      }

      // canvas = the PiP clip's own dimensions (so the output keeps the source ad's aspect)
      const canvas = probeDims(pipLocal);
      const outLocal = path.join(ws, 'pip-final.mp4');
      composeAtBox(bgForComposite, alphaLocal, audioLocal, box, canvas, outLocal);
      const clip = await uploadFile(outLocal, { folder: 'gen/pip', contentType: 'video/mp4' });

      return NextResponse.json({ clip });
    } finally {
      cleanupTempWorkspace(ws);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PiP motion control failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
