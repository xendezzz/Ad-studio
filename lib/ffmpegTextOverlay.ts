import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import type { OverlayOptions } from 'sharp';
import { getFfmpeg, getFfprobe } from '@/lib/ffmpegBinaries';
import { cleanupTempWorkspace, createTempWorkspace } from '@/lib/tempWorkspace';
import {
  TEXT_OVERLAY_CJK_FONT_FAMILY,
  wrapTextForOverlay,
  containsCjkGlyphs,
} from '@/lib/textOverlayLayout';
import type { TextOverlayConfig } from '@/types';
const FONT_FILE_MAP: Record<string, string> = {
  'sans-serif':                'Inter-Bold.ttf',
  'Impact, sans-serif':        'Anton-Regular.ttf',
  'Georgia, serif':            'Lora-Bold.ttf',
  'Courier New, monospace':    'CourierPrime-Bold.ttf',
  'Arial Black, sans-serif':   'ArchivoBlack-Regular.ttf',
  'Times New Roman, serif':    'Tinos-Bold.ttf',
  'Trebuchet MS, sans-serif':  'FiraSans-Bold.ttf',
  'Verdana, sans-serif':       'OpenSans-Bold.ttf',
  'Montserrat, sans-serif':    'Montserrat-Bold.ttf',
  'Poppins, sans-serif':       'Poppins-Bold.ttf',
  'Bebas Neue, sans-serif':    'BebasNeue-Regular.ttf',
  'Oswald, sans-serif':        'Oswald-Bold.ttf',
  'Playfair Display, serif':   'PlayfairDisplay-Bold.ttf',
  'Roboto, sans-serif':        'Roboto-Bold.ttf',
  'Raleway, sans-serif':       'Raleway-Bold.ttf',
  [TEXT_OVERLAY_CJK_FONT_FAMILY]: 'NotoSansJP-wght.ttf',
};
const FONT_ITALIC_MAP: Record<string, string> = {
  'sans-serif':     'Inter-BoldItalic.ttf',
  'Georgia, serif': 'Lora-BoldItalic.ttf',
};
const FONT_DIRS = [
  path.join(process.cwd(), 'lib', 'fonts'),
  path.join(process.cwd(), '.next', 'server', 'lib', 'fonts'),
  path.join(__dirname, 'fonts'),
  path.join(__dirname, '..', 'lib', 'fonts'),
  path.join(__dirname, '..', '..', 'lib', 'fonts'),
];
const _fontCache = new Map<string, string>();
let _fontDirsLogged = false;

function resolveBundledFontFilename(fontFamily?: string, italic = false): string {
  const family = fontFamily || 'sans-serif';
  if (italic && FONT_ITALIC_MAP[family]) return FONT_ITALIC_MAP[family];
  if (FONT_FILE_MAP[family]) return FONT_FILE_MAP[family];
  if (italic && FONT_ITALIC_MAP['sans-serif']) return FONT_ITALIC_MAP['sans-serif'];
  return FONT_FILE_MAP['sans-serif'];
}
/**
 * Resolve a CSS font-family to a bundled TTF file path.
 * Falls back to Inter-Bold.ttf (the default sans) if the requested family is not found.
 * IMPORTANT: On Vercel Lambda there is no fontconfig — if the font file doesn't exist,
 * Pango will hang indefinitely. We MUST validate the file exists.
 */
function getBundledFont(fontFamily?: string, italic = false): string {
  const cacheKey = `${fontFamily || 'sans-serif'}:${italic ? 'i' : 'n'}`;
  const cached = _fontCache.get(cacheKey);
  if (cached && fs.existsSync(cached)) return cached;
  if (!_fontDirsLogged) {
    _fontDirsLogged = true;
    console.log('[font-debug] cwd:', process.cwd());
    console.log('[font-debug] __dirname:', __dirname);
    for (const dir of FONT_DIRS) {
      const exists = fs.existsSync(dir);
      console.log(`[font-debug] ${dir} → ${exists ? 'EXISTS' : 'NOT FOUND'}`);
      if (exists) {
        try {
          const files = fs.readdirSync(dir);
          console.log(`[font-debug]   files: ${files.join(', ')}`);
        } catch {}
      }
    }
  }
  const filename = resolveBundledFontFilename(fontFamily, italic);
  for (const dir of FONT_DIRS) {
    const fullPath = path.join(dir, filename);
    if (fs.existsSync(fullPath)) {
      _fontCache.set(cacheKey, fullPath);
      return fullPath;
    }
  }
  if (italic) return getBundledFont(fontFamily, false);
  for (const dir of FONT_DIRS) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ttf'));
      if (files.length > 0) {
        const fallback = path.join(dir, files[0]);
        console.warn(`[font-debug] Exact font "${filename}" not found, using fallback: ${fallback}`);
        _fontCache.set(cacheKey, fallback);
        return fallback;
      }
    } catch {}
  }
  throw new Error(
    `Font file "${filename}" not found in any of: ${FONT_DIRS.join(', ')}. ` +
    `Ensure lib/fonts/ is included in outputFileTracingIncludes in next.config.ts.`
  );
}
/**
 * Probe video dimensions.
 */
function probeVideoSize(filePath: string): { width: number; height: number } {
  try {
    const probe = execFileSync(getFfprobe(), [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0:s=x',
      filePath,
    ], { encoding: 'utf-8' }).trim();
    const [w, h] = probe.split('x').map(Number);
    if (w > 0 && h > 0) return { width: w, height: h };
  } catch {}
  return { width: 720, height: 1280 };
}
/**
 * Parse a CSS hex color (3/4/6/8 digit) into { r, g, b, alpha } (0-255).
 */
function parseColor(hex: string): { r: number; g: number; b: number; alpha: number } {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  if (h.length === 4) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]+h[3]+h[3];
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255;
  return { r, g, b, alpha };
}
/**
 * Escape a string for Pango markup.
 */
function escPango(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/**
 * Ensure a raw RGBA buffer + position fits inside a canvas.
 * Handles negative left/top (off-screen to the left/top) by cropping from
 * the corresponding edge of the input — this matches CSS overflow:hidden
 * behaviour when text is centered but wider than the container.
 * Returns null if the layer is entirely off-canvas.
 */
async function safeRawComposite(
  data: Buffer,
  w: number, h: number, channels: number,
  left: number, top: number,
  canvasW: number, canvasH: number,
): Promise<OverlayOptions | null> {
  const srcX = Math.max(0, -left);
  const srcY = Math.max(0, -top);
  const dstX = Math.max(0, left);
  const dstY = Math.max(0, top);
  const visibleW = Math.min(w - srcX, canvasW - dstX);
  const visibleH = Math.min(h - srcY, canvasH - dstY);
  if (visibleW <= 0 || visibleH <= 0) return null;
  if (srcX === 0 && srcY === 0 && visibleW === w && visibleH === h) {
    return { input: data, raw: { width: w, height: h, channels: channels as 1|2|3|4 }, left: dstX, top: dstY };
  }
  const cropped = await sharp(data, { raw: { width: w, height: h, channels: channels as 1|2|3|4 } })
    .extract({ left: srcX, top: srcY, width: visibleW, height: visibleH })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    input: cropped.data,
    raw: { width: cropped.info.width, height: cropped.info.height, channels: cropped.info.channels as 1|2|3|4 },
    left: dstX, top: dstY,
  };
}
/**
 * Ensure a PNG buffer + position fits inside a canvas.
 * Handles negative left/top the same way as safeRawComposite.
 */
async function safePngComposite(
  pngBuf: Buffer,
  left: number, top: number,
  canvasW: number, canvasH: number,
): Promise<OverlayOptions | null> {
  const meta = await sharp(pngBuf).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (w === 0 || h === 0) return null;
  const srcX = Math.max(0, -left);
  const srcY = Math.max(0, -top);
  const dstX = Math.max(0, left);
  const dstY = Math.max(0, top);
  const visibleW = Math.min(w - srcX, canvasW - dstX);
  const visibleH = Math.min(h - srcY, canvasH - dstY);
  if (visibleW <= 0 || visibleH <= 0) return null;
  if (srcX === 0 && srcY === 0 && visibleW === w && visibleH === h) {
    return { input: pngBuf, left: dstX, top: dstY };
  }
  const cropped = await sharp(pngBuf)
    .extract({ left: srcX, top: srcY, width: visibleW, height: visibleH })
    .png()
    .toBuffer();
  return { input: cropped, left: dstX, top: dstY };
}
type ShadowDef = { ox: number; oy: number; blur: number; r: number; g: number; b: number; a: number };
function getShadowsForStyle(style?: string): ShadowDef[] {
  switch (style) {
    case 'bold-shadow': return [{ ox: 2, oy: 2, blur: 0, r: 0, g: 0, b: 0, a: 153 }];
    case 'neon':        return [
      { ox: 0, oy: 0, blur: 14, r: 255, g: 0, b: 255, a: 255 },
      { ox: 0, oy: 0, blur: 7, r: 255, g: 0, b: 255, a: 255 },
    ];
    case 'retro':       return [{ ox: 3, oy: 3, blur: 0, r: 0, g: 78, b: 137, a: 255 }];
    case 'classic':     return [{ ox: 2, oy: 2, blur: 4, r: 0, g: 0, b: 0, a: 128 }];
    default:            return [];
  }
}
/**
 * Resolve effective font family — some styles override the user's font choice.
 * Mirrors the preview logic in TextOverlayPreview.tsx getTextStyle().
 */
function getEffectiveFontFamily(configFamily?: string, textStyle?: string): string {
  if (textStyle === 'retro') return 'Impact, sans-serif';
  if (textStyle === 'classic') return configFamily || 'Georgia, serif';
  return configFamily || 'sans-serif';
}

function getRenderableFontFamily(text: string, configFamily?: string, textStyle?: string): string {
  const effectiveFamily = getEffectiveFontFamily(configFamily, textStyle);
  if (containsCjkGlyphs(text)) {
    return TEXT_OVERLAY_CJK_FONT_FAMILY;
  }
  return effectiveFamily;
}
/**
 * Render Pango text to a raw RGBA buffer via sharp.
 * We pass a very large `width` so Pango never auto-wraps (our wrapping is pre-applied).
 * A large explicit width is safer than omitting it — some libvips builds hang without it.
 */
async function renderPangoText(
  markup: string,
  fontPath: string,
  align: 'left' | 'centre' | 'right',
): Promise<{ data: Buffer; width: number; height: number; channels: number }> {
  const result = await sharp({
    text: { text: markup, fontfile: fontPath, rgba: true, align, dpi: 72, width: 10000 },
  }).toBuffer({ resolveWithObject: true });
  return { data: result.data, width: result.info.width, height: result.info.height, channels: result.info.channels };
}
/**
 * Render styled text as a transparent PNG using sharp's Pango text input.
 * Supports all fonts, styles, shadows, backgrounds, positions from the preview.
 *
 * IMPORTANT: The preview designs at a fixed 720px reference width.
 * All config values (fontSize, padding, etc.) are in that 720px coordinate space.
 * We scale everything proportionally to the actual video resolution so
 * the output matches the preview exactly.
 */
export async function renderTextOverlayPng(
  videoWidth: number,
  videoHeight: number,
  config: TextOverlayConfig,
  tempDir: string,
): Promise<string> {
  const {
    text, position, textAlign = 'center', fontSize = 48, fontColor = '#FFFFFF', bgColor,
    textStyle, fontFamily,
    paddingLeft = 0, paddingRight = 0,
    customX, customY,
    wordsPerLine,
    outlineColor, outlineWidth = 0,
    textOpacity = 100,
    bgOpacity = 70,
  } = config;
  const DESIGN_WIDTH = 720;
  const scale = videoWidth / DESIGN_WIDTH;
  const scaledFontSize = Math.round(fontSize * scale);
  const scaledPadL = Math.round((paddingLeft > 0 ? paddingLeft : 90) * scale);
  const scaledPadR = Math.round((paddingRight > 0 ? paddingRight : 90) * scale);
  let effectiveBgColor = bgColor;
  let effectiveFontColor = fontColor;
  let boxPad = Math.round(10 * scale);
  let useBold = true;
  let useItalic = false;
  let letterSpacingEm = 0;
  if (textStyle) {
    switch (textStyle) {
      case 'plain':        useBold = true; break;
      case 'bold-shadow':  useBold = true; break;
      case 'creator':      useBold = true; letterSpacingEm = 0.12; break;
      case 'text-box':
        effectiveBgColor = effectiveBgColor || '#FFFFFF'; effectiveFontColor = '#000000'; boxPad = Math.round(10 * scale); break;
      case 'bubble':
        effectiveBgColor = effectiveBgColor || '#ff3b30'; effectiveFontColor = '#FFFFFF'; boxPad = Math.round(14 * scale); break;
      case 'neon':
        effectiveFontColor = '#ff00ff'; break;
      case 'tag':
        effectiveBgColor = effectiveBgColor || '#ffcc00'; effectiveFontColor = '#000000'; boxPad = Math.round(10 * scale); break;
      case 'subscribe':
        effectiveBgColor = effectiveBgColor || '#ff0000'; effectiveFontColor = '#FFFFFF'; boxPad = Math.round(14 * scale); letterSpacingEm = 0.05; break;
      case 'retro':
        effectiveFontColor = '#ff6b35'; break;
      case 'classic':
        useItalic = true; break;
      case 'caption':
        effectiveBgColor = effectiveBgColor || 'rgba(0,0,0,0.7)'; effectiveFontColor = '#FFFFFF'; boxPad = Math.round(12 * scale); break;
      case 'rounded':
        effectiveBgColor = effectiveBgColor || '#8b5cf6'; effectiveFontColor = '#FFFFFF'; boxPad = Math.round(16 * scale); break;
    }
  }
  let wrappedText = wrapTextForOverlay(
    text,
    wordsPerLine,
    paddingLeft,
    paddingRight,
    fontSize,
    DESIGN_WIDTH,
  );
  if (textStyle === 'creator' || textStyle === 'subscribe') {
    wrappedText = wrappedText.toUpperCase();
  }
  const effectiveFamily = getRenderableFontFamily(wrappedText, fontFamily, textStyle);
  const fontPath = getBundledFont(effectiveFamily, useItalic);
  const pangoAlign = (textAlign === 'left' ? 'left' : textAlign === 'right' ? 'right' : 'centre') as 'left' | 'centre' | 'right';
  const pangoSize = Math.round(scaledFontSize * 1024);
  const weightAttr = useBold ? ' weight="bold"' : '';
  const styleAttr = useItalic ? ' style="italic"' : '';
  const spacingAttr = letterSpacingEm > 0 ? ` letter_spacing="${Math.round(letterSpacingEm * scaledFontSize * 1024)}"` : '';
  function buildMarkup(hexColor: string, alpha = 255): string {
    const alphaAttr = alpha < 255 ? ` alpha="${Math.round((alpha / 255) * 65535)}"` : '';
    const lines = wrappedText.split('\n');
    const inner = lines.map((line) =>
      `<span foreground="${hexColor}"${alphaAttr} size="${pangoSize}"${weightAttr}${styleAttr}${spacingAttr}>${escPango(line)}</span>`
    ).join('\n');
    return `<span>${inner}</span>`;
  }
  const textAlpha = Math.round((textOpacity / 100) * 255);
  const mainMarkup = buildMarkup(effectiveFontColor, textAlpha);
  const mainBuf = await renderPangoText(mainMarkup, fontPath, pangoAlign);
  const textW = mainBuf.width;
  const textH = mainBuf.height;
  let overlayX: number;
  if (position === 'custom' && customX !== undefined) {
    const anchorX = Math.round(videoWidth * customX / 100);
    switch (textAlign) {
      case 'left':
        overlayX = anchorX;
        break;
      case 'right':
        overlayX = anchorX - textW;
        break;
      default:
        overlayX = Math.round(anchorX - textW / 2);
        break;
    }
  } else {
    switch (textAlign) {
      case 'left':  overlayX = scaledPadL; break;
      case 'right': overlayX = videoWidth - scaledPadR - textW; break;
      default:      overlayX = Math.round((videoWidth - textW) / 2 + (scaledPadL - scaledPadR) / 2); break;
    }
  }
  let overlayY: number;
  if (position === 'custom' && customY !== undefined) {
    overlayY = Math.round(videoHeight * customY / 100 - textH / 2);
  } else {
    switch (position) {
      case 'top':    overlayY = Math.round(videoHeight * 0.12); break;
      case 'center': overlayY = Math.round((videoHeight - textH) / 2); break;
      case 'bottom': overlayY = Math.round(videoHeight * 0.88 - textH); break;
      default:       overlayY = Math.round(videoHeight * 0.88 - textH); break;
    }
  }
  const composites: OverlayOptions[] = [];
  if (effectiveBgColor) {
    let bgR: number, bgG: number, bgB: number, bgA: number;
    const bgAlphaFraction = bgOpacity / 100;
    if (effectiveBgColor.startsWith('rgba(')) {
      const m = effectiveBgColor.match(/rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/);
      if (m) { bgR = +m[1]; bgG = +m[2]; bgB = +m[3]; bgA = Math.round(+m[4] * bgAlphaFraction * 255); }
      else { bgR = 0; bgG = 0; bgB = 0; bgA = Math.round(bgAlphaFraction * 255); }
    } else {
      const c = parseColor(effectiveBgColor);
      bgR = c.r; bgG = c.g; bgB = c.b; bgA = Math.round(c.alpha * bgAlphaFraction);
    }
    const rx = Math.round((textStyle === 'rounded' || textStyle === 'bubble' ? 12 : 4) * scale);
    const bgW = Math.min(textW + boxPad * 2, videoWidth);
    const bgH = Math.min(textH + boxPad * 2, videoHeight);
    const bgSvg = `<svg width="${bgW}" height="${bgH}"><rect x="0" y="0" width="${bgW}" height="${bgH}" rx="${rx}" ry="${rx}" fill="rgba(${bgR},${bgG},${bgB},${bgA / 255})"/></svg>`;
    const bgBuf = await sharp(Buffer.from(bgSvg)).png().toBuffer();
    const bgComp = await safePngComposite(bgBuf, Math.max(0, overlayX - boxPad), Math.max(0, overlayY - boxPad), videoWidth, videoHeight);
    if (bgComp) composites.push(bgComp);
  }
  const shadows = getShadowsForStyle(textStyle);
  if (!effectiveBgColor && shadows.length === 0) {
    shadows.push({ ox: 1, oy: 1, blur: 3, r: 0, g: 0, b: 0, a: 230 });
  }
  for (const shadow of shadows) {
    const shadowHex = `#${shadow.r.toString(16).padStart(2, '0')}${shadow.g.toString(16).padStart(2, '0')}${shadow.b.toString(16).padStart(2, '0')}`;
    const shadowMarkup = buildMarkup(shadowHex, shadow.a);
    const shadowBuf = await renderPangoText(shadowMarkup, fontPath, pangoAlign);
    let shadowInput: Buffer = shadowBuf.data;
    let shadowW = shadowBuf.width;
    let shadowH = shadowBuf.height;
    let shadowChannels = shadowBuf.channels;
    if (shadow.blur > 0) {
      const sigma = Math.max(0.3, shadow.blur * 0.5 * scale);
      const blurred = await sharp(shadowInput, { raw: { width: shadowW, height: shadowH, channels: shadowChannels as 1 | 2 | 3 | 4 } })
        .blur(sigma)
        .toBuffer({ resolveWithObject: true });
      shadowInput = blurred.data;
      shadowW = blurred.info.width;
      shadowH = blurred.info.height;
      shadowChannels = blurred.info.channels;
    }
    const sox = Math.round(shadow.ox * scale);
    const soy = Math.round(shadow.oy * scale);
    const sc = await safeRawComposite(shadowInput, shadowW, shadowH, shadowChannels, overlayX + sox, overlayY + soy, videoWidth, videoHeight);
    if (sc) composites.push(sc);
  }
  // ── Text outline: render at 8 directional offsets ──
  if (outlineColor && outlineWidth > 0) {
    const scaledOutlineWidth = Math.round(outlineWidth * scale);
    const outlineMarkup = buildMarkup(outlineColor, textAlpha);
    const outlineBuf = await renderPangoText(outlineMarkup, fontPath, pangoAlign);
    const directions = [
      [0, -1], [1, -1], [1, 0], [1, 1],
      [0, 1], [-1, 1], [-1, 0], [-1, -1],
    ];
    for (const [dx, dy] of directions) {
      const ox = overlayX + dx * scaledOutlineWidth;
      const oy = overlayY + dy * scaledOutlineWidth;
      const oc = await safeRawComposite(outlineBuf.data, outlineBuf.width, outlineBuf.height, outlineBuf.channels, ox, oy, videoWidth, videoHeight);
      if (oc) composites.push(oc);
    }
  }
  const mainComp = await safeRawComposite(mainBuf.data, textW, textH, mainBuf.channels, overlayX, overlayY, videoWidth, videoHeight);
  if (mainComp) composites.push(mainComp);
  if (composites.length === 0) {
    throw new Error('Text overlay rendered fully off-canvas; adjust custom position, alignment, or text width.');
  }
  fs.mkdirSync(tempDir, { recursive: true });
  const pngPath = path.join(tempDir, `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`);
  await sharp({
    create: { width: videoWidth, height: videoHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .png()
    .toFile(pngPath);
  return pngPath;
}
/**
 * Burn text onto a video using a sharp-rendered PNG overlay.
 * Uses ffmpeg overlay filter (universally available) instead of drawtext.
 */
export async function addTextOverlay(
  inputPath: string,
  outputPath: string,
  config: TextOverlayConfig,
  tempDir?: string,
): Promise<void> {
  const { startTime, duration, entireVideo } = config;
  const { width, height } = probeVideoSize(inputPath);
  const overlayWorkspace = tempDir || createTempWorkspace('text-overlay');
  const overlayPng = await renderTextOverlayPng(width, height, config, overlayWorkspace);
  try {
    let enableExpr = '';
    if (!entireVideo && (startTime !== undefined || duration !== undefined)) {
      const start = startTime || 0;
      if (duration !== undefined) {
        enableExpr = `:enable='between(t,${start},${start + duration})'`;
      } else {
        enableExpr = `:enable='gte(t,${start})'`;
      }
    }
    execFileSync(getFfmpeg(), [
      '-y',
      '-i', inputPath,
      '-i', overlayPng,
      '-filter_complex', `[0:v][1:v]overlay=0:0${enableExpr}[vout]`,
      '-map', '[vout]',
      '-map', '0:a?',
      '-c:a', 'copy',
      outputPath,
    ], { maxBuffer: 50 * 1024 * 1024 });
  } finally {
    try { fs.unlinkSync(overlayPng); } catch {}
    if (!tempDir) {
      cleanupTempWorkspace(overlayWorkspace);
    }
  }
}
