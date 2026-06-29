import { execFileSync } from 'child_process';
import { getFfmpeg, getFfprobe } from './ffmpegBinaries';
import type { ComposeConfig } from '@/types';

function probeDuration(filePath: string): number {
  try {
    const output = execFileSync(getFfprobe(), [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ], { encoding: 'utf-8' });
    return parseFloat(output.trim()) || 10;
  } catch {
    return 10;
  }
}

export function composeMedia(
  layerPaths: Map<string, string>,
  config: ComposeConfig,
  outputPath: string,
): void {
  const { canvasWidth, canvasHeight, backgroundColor, layers } = config;

  if (layers.length === 0) {
    throw new Error('No layers to compose');
  }

  const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

  let maxDuration = 5;
  for (const layer of sortedLayers) {
    const filePath = layerPaths.get(layer.id);
    if (!filePath) continue;
    if (layer.type === 'video') {
      const fullDur = probeDuration(filePath);
      let effectiveDur = fullDur;
      if (layer.trim) {
        const start = layer.trim.startSec || 0;
        const end = layer.trim.endSec || fullDur;
        effectiveDur = Math.max(0, (end > start ? end - start : fullDur - start));
      }
      if (effectiveDur > maxDuration) maxDuration = effectiveDur;
    }
  }

  const inputs: string[] = [];
  const filterParts: string[] = [];

  const bgHex = backgroundColor.replace('#', '');
  filterParts.push(
    `color=c=0x${bgHex}:s=${canvasWidth}x${canvasHeight}:d=${maxDuration}:r=30[bg]`
  );

  let inputIdx = 0;
  const layerInputMap = new Map<string, number>();

  for (const layer of sortedLayers) {
    const filePath = layerPaths.get(layer.id);
    if (!filePath) continue;

    if (layer.type === 'image') {
      // Don't use -loop (not available in all FFmpeg builds).
      // Instead, loop the single frame in the filter_complex below.
      inputs.push('-i', filePath);
    } else {
      if (layer.trim?.startSec) {
        inputs.push('-ss', String(layer.trim.startSec));
      }
      if (layer.trim?.endSec && layer.trim.endSec > (layer.trim?.startSec || 0)) {
        const trimDuration = layer.trim.endSec - (layer.trim.startSec || 0);
        inputs.push('-t', String(trimDuration));
      }
      inputs.push('-i', filePath);
    }

    layerInputMap.set(layer.id, inputIdx);
    inputIdx++;
  }

  let prevLabel = 'bg';

  for (let i = 0; i < sortedLayers.length; i++) {
    const layer = sortedLayers[i];
    const idx = layerInputMap.get(layer.id);
    if (idx === undefined) continue;

    const pixelW = Math.round(layer.width * canvasWidth);
    const pixelH = Math.round(layer.height * canvasHeight);
    const pixelX = Math.round(layer.x * canvasWidth);
    const pixelY = Math.round(layer.y * canvasHeight);
    const outLabel = i === sortedLayers.length - 1 ? 'vout' : `v${i}`;

    // For image layers, loop the single frame to fill the duration via filter
    const imageLoopPrefix = layer.type === 'image'
      ? `loop=-1:size=1:start=0,setpts=N/(30*TB),trim=duration=${maxDuration},`
      : '';

    let scaleFilter: string;
    switch (layer.fit) {
      case 'stretch':
        scaleFilter = `[${idx}:v]${imageLoopPrefix}scale=${pixelW}:${pixelH}`;
        break;
      case 'contain':
        scaleFilter = `[${idx}:v]${imageLoopPrefix}scale=${pixelW}:${pixelH}:force_original_aspect_ratio=decrease,pad=${pixelW}:${pixelH}:(ow-iw)/2:(oh-ih)/2:color=0x${bgHex}`;
        break;
      case 'cover':
      default:
        scaleFilter = `[${idx}:v]${imageLoopPrefix}scale=${pixelW}:${pixelH}:force_original_aspect_ratio=increase,crop=${pixelW}:${pixelH}`;
        break;
    }

    scaleFilter += `,format=yuva420p`;

    if (layer.opacity !== undefined && layer.opacity < 1) {
      scaleFilter += `,colorchannelmixer=aa=${layer.opacity}`;
    }

    scaleFilter += `[s${i}]`;
    filterParts.push(scaleFilter);

    filterParts.push(
      `[${prevLabel}][s${i}]overlay=${pixelX}:${pixelY}:shortest=0[${outLabel}]`
    );
    prevLabel = outLabel;
  }

  let audioMap: string[] = [];
  for (const layer of sortedLayers) {
    if (layer.type === 'video') {
      const idx = layerInputMap.get(layer.id);
      if (idx !== undefined) {
        const filePath = layerPaths.get(layer.id);
        if (filePath) {
          try {
            const probeOut = execFileSync(getFfprobe(), [
              '-v', 'error', '-select_streams', 'a',
              '-show_entries', 'stream=index', '-of', 'csv=p=0',
              filePath,
            ], { encoding: 'utf-8' });
            if (probeOut.trim().length > 0) {
              audioMap = ['-map', `${idx}:a`];
              break;
            }
          } catch {}
        }
      }
    }
  }

  if (audioMap.length === 0) {
    filterParts.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${maxDuration}[aout]`);
    audioMap = ['-map', '[aout]'];
  }

  const filterComplex = filterParts.join(';');

  const args = [
    '-y',
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', '[vout]',
    ...audioMap,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-c:a', 'aac',
    '-shortest',
    outputPath,
  ];

  execFileSync(getFfmpeg(), args, { timeout: 300000, maxBuffer: 50 * 1024 * 1024 });
}
