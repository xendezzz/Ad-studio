/**
 * Shared media types for Ad-Studio.
 *
 * Extracted from ai-ugc's types so the copied ffmpeg libs (ffmpegCompose, ffmpegMediaOps,
 * ffmpegTextOverlay) compile unchanged. Only the compositing/overlay/music types are kept.
 */

// --- Compose (ffmpegCompose.ts) ---
export type ComposeAspectRatio = '9:16' | '16:9' | '1:1' | '4:5';
export type ComposeLayerFit = 'cover' | 'contain' | 'stretch';
export type LayerSourceType =
  | 'step-output'
  | 'gallery-video'
  | 'gallery-image'
  | 'model-image'
  | 'upload'
  | 'url';

export type LayerSource = {
  type: LayerSourceType;
  url: string;
  gcsUrl?: string;
  stepId?: string;
  modelId?: string;
  label?: string;
};

export type ComposeLayer = {
  id: string;
  type: 'video' | 'image';
  source: LayerSource;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  fit: ComposeLayerFit;
  borderRadius?: number;
  opacity?: number;
  trim?: { startSec: number; endSec: number };
  audioDetached?: boolean;
};

export type ComposePresetId =
  | '2up-vertical'
  | 'side-by-side'
  | 'pip'
  | 'grid-2x2'
  | '3-panel'
  | 'free-canvas';

export type ComposeConfig = {
  canvasWidth: number;
  canvasHeight: number;
  aspectRatio: ComposeAspectRatio;
  preset: ComposePresetId | null;
  backgroundColor: string;
  layers: ComposeLayer[];
};

// --- Text overlay (ffmpegTextOverlay.ts) ---
export type TextOverlayConfig = {
  text: string;
  position: 'top' | 'center' | 'bottom' | 'custom';
  textAlign?: 'left' | 'center' | 'right';
  customX?: number; // 0-100 percentage
  customY?: number; // 0-100 percentage
  fontSize: number;
  fontColor: string;
  fontFamily?: string;
  textStyle?: string;
  bgColor?: string;
  paddingLeft?: number;
  paddingRight?: number;
  wordsPerLine?: number;
  outlineColor?: string;
  outlineWidth?: number;
  textOpacity?: number;
  bgOpacity?: number;
  entireVideo?: boolean;
  startTime?: number;
  duration?: number;
};

// --- Background music (ffmpegMediaOps.ts) ---
export type BgMusicConfig = {
  trackId?: string;
  trendingTrackId?: string;
  customTrackUrl?: string;
  volume: number;
  fadeIn?: number;
  fadeOut?: number;
  applyToSteps?: string[];
  audioModePerStep?: Record<string, 'replace' | 'mix'>;
  audioMode?: 'replace' | 'mix';
};
