/**
 * Text-overlay burning — the single source of truth for the Text node.
 * Used by both POST /api/text (live editor apply) and runPipeline (re-burn downstream,
 * e.g. when Scale recomputes the same overlays onto each model's swapped clip).
 */
import path from 'path';
import { promises as fs } from 'fs';
import { execFileSync } from 'child_process';
import { addTextOverlay } from './ffmpegTextOverlay';
import { getFfmpeg, getFfprobe } from './ffmpegBinaries';
import { createTempWorkspace, cleanupTempWorkspace } from './tempWorkspace';
import { downloadToPath, uploadFile } from './storage';

const FONT_MAP: Record<string, string> = {
  Inter: 'sans-serif', Montserrat: 'Montserrat, sans-serif', Poppins: 'Poppins, sans-serif',
  Oswald: 'Oswald, sans-serif', 'Bebas Neue': 'Bebas Neue, sans-serif', Anton: 'Impact, sans-serif',
  'Archivo Black': 'Arial Black, sans-serif', Roboto: 'Roboto, sans-serif',
  Playfair: 'Playfair Display, serif', Lora: 'Georgia, serif',
};

export interface TextItem {
  type: 'text' | 'emoji';
  text?: string;
  emoji?: string;
  font?: string;
  size?: number;
  x?: number; // 0..1, center
  y?: number; // 0..1, center
  startSec?: number;
  endSec?: number;
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

/** emoji char → twemoji asset codepoint (strip standalone variation selector fe0f). */
function twemojiCode(emoji: string): string {
  const cps = [...emoji].map((c) => c.codePointAt(0)!.toString(16));
  const stripped = cps.filter((cp) => cp !== 'fe0f');
  return (stripped.length ? stripped : cps).join('-');
}

async function fetchTwemoji(emoji: string, outPath: string): Promise<boolean> {
  const code = twemojiCode(emoji);
  const urls = [
    `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/${code}.png`,
    `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${code}.png`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        await fs.writeFile(outPath, Buffer.from(await r.arrayBuffer()));
        return true;
      }
    } catch {
      /* try next */
    }
  }
  return false;
}

/**
 * Burn timed text overlays (drag-anywhere via custom x/y) and composite emoji PNGs (Twemoji)
 * onto `video` (a Storage path). Each item is shown only during its [startSec,endSec].
 * Returns the new Storage path. Sizes use a 720px design reference (matches the editor preview).
 */
export async function applyTextOverlays(video: string, items: TextItem[]): Promise<string> {
  const ws = createTempWorkspace('adstudio-text');
  try {
    let cur = path.join(ws, 'in.mp4');
    await downloadToPath(video, cur);
    const { w, h } = probeDims(cur);

    // 1. burn each text overlay (timed)
    const texts = items.filter((it) => it.type === 'text' && (it.text ?? '').trim());
    let i = 0;
    for (const t of texts) {
      const next = path.join(ws, `t-${i++}.mp4`);
      const start = Math.max(0, Number(t.startSec) || 0);
      const end = Math.max(start + 0.1, Number(t.endSec) || start + 2);
      await addTextOverlay(
        cur,
        next,
        {
          text: t.text!,
          position: 'custom',
          customX: Math.max(0, Math.min(100, (Number(t.x) || 0.5) * 100)),
          customY: Math.max(0, Math.min(100, (Number(t.y) || 0.5) * 100)),
          textAlign: 'center',
          fontFamily: FONT_MAP[String(t.font ?? 'Montserrat')] ?? 'Montserrat, sans-serif',
          fontSize: Math.max(12, Number(t.size) || 64),
          fontColor: '#ffffff',
          outlineColor: '#000000',
          outlineWidth: 6,
          entireVideo: false,
          startTime: start,
          duration: end - start,
        },
        ws,
      );
      cur = next;
    }

    // 2. composite emoji PNGs (Twemoji), timed
    const emojis = items.filter((it) => it.type === 'emoji' && (it.emoji ?? '').trim());
    const pngs: { file: string; e: TextItem }[] = [];
    for (const e of emojis) {
      const file = path.join(ws, `e-${pngs.length}.png`);
      if (await fetchTwemoji(e.emoji!, file)) pngs.push({ file, e });
    }
    if (pngs.length) {
      const inputs: string[] = ['-y', '-i', cur];
      pngs.forEach((p) => inputs.push('-i', p.file));
      const filters: string[] = [];
      let label = '0:v';
      pngs.forEach((p, idx) => {
        // emoji size is design px (720 ref), same as text — scale to the real video width
        const size = Math.max(16, Math.round(((Number(p.e.size) || 80) * w) / 720));
        const ox = Math.round((Number(p.e.x) || 0.5) * w - size / 2);
        const oy = Math.round((Number(p.e.y) || 0.5) * h - size / 2);
        const start = Math.max(0, Number(p.e.startSec) || 0);
        const end = Math.max(start + 0.1, Number(p.e.endSec) || start + 2);
        const inIdx = idx + 1;
        const out = idx === pngs.length - 1 ? 'vout' : `v${idx}`;
        filters.push(`[${inIdx}:v]scale=${size}:${size}[e${idx}]`);
        filters.push(`[${label}][e${idx}]overlay=${ox}:${oy}:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'[${out}]`);
        label = out;
      });
      const out = path.join(ws, 'with-emoji.mp4');
      execFileSync(
        getFfmpeg(),
        [...inputs, '-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '0:a?', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', '-c:a', 'aac', out],
        { timeout: 300000, maxBuffer: 50 * 1024 * 1024 },
      );
      cur = out;
    }

    return await uploadFile(cur, { folder: 'gen/text', contentType: 'video/mp4' });
  } finally {
    cleanupTempWorkspace(ws);
  }
}
