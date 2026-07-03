/**
 * Asset-overlay burning — the single source of truth for the Asset node.
 * Overlays images (png/jpg/webp/svg), GIFs and videos onto a base clip at a custom position,
 * shown only during each item's [startSec, endSec]. Used by POST /api/asset and runPipeline.
 *
 * Sizes/positions use a 720px design-width reference (matches the editor preview): each item's
 * w/h are design px, scaled to the real video width; x/y are 0..1 of the frame (item CENTER).
 */
import path from 'path';
import { promises as fs } from 'fs';
import { execFileSync } from 'child_process';
import sharp from 'sharp';
import { getFfmpeg, getFfprobe } from './ffmpegBinaries';
import { getVideoDuration } from './serverUtils';
import { createTempWorkspace, cleanupTempWorkspace } from './tempWorkspace';
import { downloadToPath, uploadFile } from './storage';

export type AssetKind = 'image' | 'gif' | 'video';

export interface AssetItem {
  path: string; // Supabase Storage path of the uploaded asset
  kind: AssetKind;
  x: number; // 0..1, center
  y: number; // 0..1, center
  w: number; // design px (720 ref)
  h: number; // design px (720 ref)
  startSec: number;
  endSec: number;
  // crop a rectangular region of the asset (fractions 0..1 of the asset frame). Default full.
  cropX?: number;
  cropY?: number;
  cropW?: number;
  cropH?: number;
  // video assets only:
  trimStart?: number; // seconds into the source video to start from
  trimEnd?: number; // seconds into the source video to stop
  muted?: boolean; // default true — drop the asset's audio
}

const DESIGN_W = 720;

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

const ext = (p: string) => (p.split('.').pop() || '').toLowerCase();

/**
 * Burn timed asset overlays onto `video` (a Storage path). Returns the new Storage path.
 */
export async function applyAssetOverlays(video: string, items: AssetItem[]): Promise<string> {
  const list = (items ?? []).filter((it) => it.path && it.endSec > it.startSec);
  if (!list.length) return video;

  const ws = createTempWorkspace('adstudio-asset');
  try {
    const base = path.join(ws, 'in.mp4');
    await downloadToPath(video, base);
    const { w: vw, h: vh } = probeDims(base);
    const scale = vw / DESIGN_W;
    const baseDur = getVideoDuration(base) || 0; // bound output to the base clip (looped assets are infinite)

    // download each asset; rasterize SVG → PNG so ffmpeg can read it
    const inputs: { file: string; it: AssetItem; loop: boolean }[] = [];
    for (const it of list) {
      let file = path.join(ws, `a-${inputs.length}.${ext(it.path) || 'bin'}`);
      await downloadToPath(it.path, file);
      if (it.kind === 'image' && ext(it.path) === 'svg') {
        const png = path.join(ws, `a-${inputs.length}.png`);
        const targetW = Math.max(2, Math.round(it.w * scale));
        await sharp(file).resize({ width: targetW }).png().toFile(png);
        file = png;
      }
      inputs.push({ file, it, loop: it.kind !== 'video' }); // images + gifs loop; video plays once
    }

    // build ffmpeg inputs. Video assets are trimmed at the input (fast) with -ss/-t.
    const args: string[] = ['-y', '-i', base];
    inputs.forEach(({ file, it, loop }) => {
      if (it.kind === 'video') {
        const ts = Math.max(0, Number(it.trimStart) || 0);
        const te = Number(it.trimEnd);
        if (ts > 0) args.push('-ss', ts.toFixed(3));
        if (Number.isFinite(te) && te > ts) args.push('-t', (te - ts).toFixed(3)); // trim length
      } else if (it.kind === 'gif') {
        args.push('-ignore_loop', '0'); // loop the gif
      } else if (loop) {
        args.push('-loop', '1'); // loop a still image
      }
      args.push('-i', file);
    });

    const clamp = (n: number, d: number) => (Number.isFinite(n) && n >= 0 && n <= 1 ? n : d);
    const filters: string[] = [];
    const audioParts: string[] = []; // unmuted video assets → mixed into the output audio
    let label = '0:v';
    inputs.forEach(({ it }, idx) => {
      const ow = Math.max(2, Math.round(it.w * scale));
      const oh = Math.max(2, Math.round(it.h * scale));
      const ox = Math.round(it.x * vw - ow / 2);
      const oy = Math.round(it.y * vh - oh / 2);
      const s = Math.max(0, Number(it.startSec) || 0);
      const e = Math.max(s + 0.1, Number(it.endSec) || s + 2);
      const inIdx = idx + 1;
      const out = idx === inputs.length - 1 ? 'vout' : `v${idx}`;

      // optional crop of the asset frame (fractions of the asset), then scale to size
      const cw = clamp(Number(it.cropW), 1), ch = clamp(Number(it.cropH), 1);
      const cx = clamp(Number(it.cropX), 0), cy = clamp(Number(it.cropY), 0);
      const cropChain = cw < 1 || ch < 1 || cx > 0 || cy > 0
        ? `crop=iw*${cw.toFixed(4)}:ih*${ch.toFixed(4)}:iw*${cx.toFixed(4)}:ih*${cy.toFixed(4)},`
        : '';
      // video: sync the trimmed clip to start at s; images/gifs are frozen/looped
      const timeChain = it.kind === 'video' ? `setpts=PTS-STARTPTS+${s.toFixed(3)}/TB,` : '';
      filters.push(`[${inIdx}:v]${cropChain}scale=${ow}:${oh}:flags=lanczos,${timeChain}format=rgba[a${idx}]`);
      filters.push(`[${label}][a${idx}]overlay=${ox}:${oy}:enable='between(t,${s.toFixed(2)},${e.toFixed(2)})':shortest=0[${out}]`);
      label = out;

      // audio: keep the asset's audio only if it's an un-muted video, delayed to its window start
      if (it.kind === 'video' && it.muted === false) {
        const ms = Math.round(s * 1000);
        filters.push(`[${inIdx}:a]asetpts=PTS-STARTPTS,adelay=${ms}|${ms},apad[au${idx}]`);
        audioParts.push(`[au${idx}]`);
      }
    });

    // audio out: base + any un-muted asset audio, mixed (base first so its length wins)
    let audioMap: string[];
    if (audioParts.length) {
      filters.push(`[0:a]${audioParts.join('')}amix=inputs=${audioParts.length + 1}:duration=first:dropout_transition=0[aout]`);
      audioMap = ['-map', '[aout]'];
    } else {
      audioMap = ['-map', '0:a?'];
    }

    const out = path.join(ws, 'with-assets.mp4');
    execFileSync(
      getFfmpeg(),
      [
        ...args,
        '-filter_complex', filters.join(';'),
        '-map', '[vout]', ...audioMap,
        ...(baseDur > 0 ? ['-t', baseDur.toFixed(3)] : []), // bound to base length (looped assets are infinite)
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', '-c:a', 'aac',
        out,
      ],
      { timeout: 300000, maxBuffer: 50 * 1024 * 1024 },
    );
    await fs.access(out);
    return await uploadFile(out, { folder: 'gen/asset', contentType: 'video/mp4' });
  } finally {
    cleanupTempWorkspace(ws);
  }
}
