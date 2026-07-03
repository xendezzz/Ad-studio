/**
 * Subtitle burning — the single source of truth for the Subtitles node.
 * Used by both POST /api/subtitles (live apply) and runPipeline (re-burn downstream, e.g.
 * when Scale recomputes captions onto each model's swapped clip with the same style).
 */
import path from 'path';
import { addTextOverlay } from './ffmpegTextOverlay';
import { transcribeWords, groupWords } from './transcribe';
import { createTempWorkspace, cleanupTempWorkspace } from './tempWorkspace';
import { downloadToPath, uploadFile } from './storage';

// UI label → text-overlay engine values
const STYLE_MAP: Record<string, string> = {
  Bold: 'bold-shadow', Boxed: 'caption', Highlight: 'tag', Bubble: 'bubble',
  Pop: 'rounded', Neon: 'neon', Classic: 'classic', Creator: 'creator', Plain: 'plain',
};
const FONT_MAP: Record<string, string> = {
  Inter: 'sans-serif', Montserrat: 'Montserrat, sans-serif', Poppins: 'Poppins, sans-serif',
  Oswald: 'Oswald, sans-serif', 'Bebas Neue': 'Bebas Neue, sans-serif', Anton: 'Impact, sans-serif',
  'Archivo Black': 'Arial Black, sans-serif', Roboto: 'Roboto, sans-serif',
  Playfair: 'Playfair Display, serif', Lora: 'Georgia, serif',
};
const SIZE_MAP: Record<string, number> = { Small: 42, Medium: 58, Large: 76, 'X-Large': 100 };
// box-style presets supply their own contrast, so they don't need an outline
const BOX_STYLES = new Set(['caption', 'tag', 'bubble', 'rounded', 'text-box']);

export interface SubtitleOpts {
  style?: string;
  font?: string;
  size?: string; // preset (Small/Medium/Large/X-Large) — overridden by fontSizePx if set
  position?: string; // top | center | bottom (overridden by customX/customY if set)
  fontSizePx?: number; // exact typed font size (design px)
  stroke?: boolean; // draw an outline/stroke (default true)
  strokeWidth?: number;
  strokeColor?: string;
  customX?: number; // 0..100 percent — custom position (caption center X)
  customY?: number; // 0..100 percent — custom position (caption center Y)
}

/**
 * Transcribe `video` (a Storage path) and burn styled, timed captions onto it.
 * Returns the new Storage path (or the input unchanged if there's no speech).
 */
export async function applySubtitles(video: string, opts: SubtitleOpts = {}): Promise<string> {
  const posRaw = String(opts.position ?? 'bottom').toLowerCase();
  const pos = (['top', 'center', 'bottom'].includes(posRaw) ? posRaw : 'bottom') as 'top' | 'center' | 'bottom';
  const textStyle = STYLE_MAP[String(opts.style ?? 'Bold')] ?? 'bold-shadow';
  const fontFamily = FONT_MAP[String(opts.font ?? 'Montserrat')] ?? 'Montserrat, sans-serif';
  const fontSize = Number(opts.fontSizePx) > 0 ? Number(opts.fontSizePx) : (SIZE_MAP[String(opts.size ?? 'Large')] ?? 76);
  // stroke: explicit toggle wins; else box styles have none, others default to a 6px black outline
  const strokeOn = opts.stroke ?? !BOX_STYLES.has(textStyle);
  const outlineWidth = strokeOn ? Math.max(0, Number(opts.strokeWidth ?? 6)) : 0;
  const outlineColor = opts.strokeColor || '#000000';
  // custom position (caption center) overrides the top/center/bottom preset
  const hasCustom = Number.isFinite(opts.customX) && Number.isFinite(opts.customY);

  const ws = createTempWorkspace('adstudio-subs');
  try {
    const groups = groupWords(await transcribeWords(video), 3);
    let cur = path.join(ws, 'in.mp4');
    await downloadToPath(video, cur);

    if (!groups.length) {
      return await uploadFile(cur, { folder: 'gen/subtitles', contentType: 'video/mp4' });
    }

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const next = path.join(ws, `sub-${i}.mp4`);
      await addTextOverlay(
        cur,
        next,
        {
          text: g.text,
          ...(hasCustom
            ? { position: 'custom' as const, customX: Math.max(0, Math.min(100, Number(opts.customX))), customY: Math.max(0, Math.min(100, Number(opts.customY))), textAlign: 'center' as const }
            : { position: pos }),
          textStyle,
          fontFamily,
          fontSize,
          fontColor: '#ffffff',
          outlineColor,
          outlineWidth,
          entireVideo: false,
          startTime: g.start,
          duration: Math.max(0.4, g.end - g.start),
        },
        ws,
      );
      cur = next;
    }

    return await uploadFile(cur, { folder: 'gen/subtitles', contentType: 'video/mp4' });
  } finally {
    cleanupTempWorkspace(ws);
  }
}
