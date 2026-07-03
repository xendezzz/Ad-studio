/**
 * Pipeline node registry — the single source of truth for the node-graph editor.
 *
 * Each entry is one node TYPE in the canvas. Categories group them in the palette.
 * `accent` drives the neon styling of the node + its edges. `hasInput`/`hasOutput`
 * control which connection handles render.
 *
 * Maps 1:1 to the ad pipeline flowchart (ad_pipeline_flow.html).
 */

export type NodeCategory = 'source' | 'segment' | 'generate' | 'compose' | 'post' | 'output';

export type PipelineNodeKind =
  // sources
  | 'reference-ad'
  | 'combined-clip'
  // combined-clip segments (auto-attached, hidden from palette)
  | 'cc-hook'
  | 'cc-pip'
  | 'cc-aroll'
  | 'cc-broll'
  | 'cc-cta'
  | 'model'
  | 'hook'
  | 'app-demo'
  | 'music'
  // generate
  | 'motion-control'
  | 'swap-output'
  | 'bg-remove'
  | 'voice'
  // compose
  | 'combine'
  | 'sequence'
  | 'transition'
  // post
  | 'text'
  | 'asset'
  | 'subtitles'
  | 'end-card'
  | 'music-mix'
  // output
  | 'export';

export interface PipelineNodeDef {
  kind: PipelineNodeKind;
  label: string;
  category: NodeCategory;
  /** Neon accent (hex) for node border/handles/edges. */
  accent: string;
  /** lucide-react icon name (resolved in the node component). */
  icon: string;
  /** Short helper line shown under the title. */
  hint: string;
  hasInput: boolean;
  hasOutput: boolean;
  /** Hidden from the "Add node" palette — only spawned programmatically (e.g. combined-clip segments). */
  hidden?: boolean;
}

export const NODE_DEFS: Record<PipelineNodeKind, PipelineNodeDef> = {
  'reference-ad': {
    kind: 'reference-ad',
    label: 'Reference Ad',
    category: 'source',
    accent: '#f5a524',
    icon: 'Film',
    hint: 'Ingest + detect clips',
    hasInput: false,
    hasOutput: true,
  },
  'combined-clip': {
    kind: 'combined-clip',
    label: 'Combined Clip',
    category: 'source',
    accent: '#2dd4bf',
    icon: 'Clapperboard',
    hint: 'Creator speaking — split later',
    hasInput: true,
    hasOutput: true,
  },
  'cc-hook': {
    kind: 'cc-hook',
    label: 'Hook',
    category: 'segment',
    accent: '#22d3ee',
    icon: 'Sparkles',
    hint: 'Opening segment',
    hasInput: true,
    hasOutput: true,
  },
  'cc-pip': {
    kind: 'cc-pip',
    label: 'PiP',
    category: 'segment',
    accent: '#fb923c',
    icon: 'PictureInPicture2',
    hint: 'Creator over app demo',
    hasInput: true,
    hasOutput: true,
  },
  'cc-aroll': {
    kind: 'cc-aroll',
    label: 'A-roll',
    category: 'segment',
    accent: '#60a5fa',
    icon: 'Video',
    hint: 'Main creator footage',
    hasInput: true,
    hasOutput: true,
  },
  'cc-broll': {
    kind: 'cc-broll',
    label: 'B-roll',
    category: 'segment',
    accent: '#c084fc',
    icon: 'Film',
    hint: 'Supporting footage',
    hasInput: true,
    hasOutput: true,
  },
  'cc-cta': {
    kind: 'cc-cta',
    label: 'End Card',
    category: 'segment',
    accent: '#fca5a5',
    icon: 'CreditCard',
    hint: 'Runable branded outro',
    hasInput: true,
    hasOutput: true,
  },
  model: {
    kind: 'model',
    label: 'Model',
    category: 'source',
    accent: '#a78bfa',
    icon: 'UserRound',
    hint: 'Persona + tied voice',
    hasInput: false,
    hasOutput: true,
  },
  hook: {
    kind: 'hook',
    label: 'Hook',
    category: 'source',
    accent: '#22d3ee',
    icon: 'Sparkles',
    hint: 'Talking-head opener',
    hasInput: false,
    hasOutput: true,
    // removed from the Add-node palette — use Segments → Hook. Kept for the Hooks library.
    hidden: true,
  },
  'app-demo': {
    kind: 'app-demo',
    label: 'App Demo',
    category: 'source',
    accent: '#38bdf8',
    icon: 'MonitorSmartphone',
    hint: 'Screen-rec background',
    hasInput: false,
    hasOutput: true,
  },
  music: {
    kind: 'music',
    label: 'Music',
    category: 'source',
    accent: '#f472b6',
    icon: 'Music',
    hint: 'Track library',
    hasInput: false,
    hasOutput: true,
  },
  'motion-control': {
    kind: 'motion-control',
    label: 'Motion Control',
    category: 'generate',
    accent: '#34d399',
    icon: 'Wand2',
    hint: 'FAL Kling — swap persona',
    hasInput: true,
    hasOutput: true,
    // no longer a node — swapping is per-part via the top-bar model + each part's Apply
    hidden: true,
  },
  'swap-output': {
    kind: 'swap-output',
    label: 'Swapped',
    category: 'generate',
    accent: '#34d399',
    icon: 'Wand2',
    hint: 'Motion-control output',
    hasInput: true,
    hasOutput: true,
    // spawned automatically as a part's swap output; not added from the palette
    hidden: true,
  },
  'bg-remove': {
    kind: 'bg-remove',
    label: 'Remove BG + PiP',
    category: 'generate',
    accent: '#2dd4bf',
    icon: 'Scissors',
    hint: 'Alpha cutout, position PiP',
    hasInput: true,
    hasOutput: true,
  },
  voice: {
    kind: 'voice',
    label: 'Voice',
    category: 'generate',
    accent: '#c084fc',
    icon: 'Mic',
    hint: 'ElevenLabs TTS / changer',
    hasInput: true,
    hasOutput: true,
  },
  combine: {
    kind: 'combine',
    label: 'Combine',
    category: 'compose',
    accent: '#4ade80',
    icon: 'Layers',
    hint: 'ffmpeg composite clips',
    hasInput: true,
    hasOutput: true,
  },
  sequence: {
    kind: 'sequence',
    label: 'Sequence',
    category: 'compose',
    accent: '#4ade80',
    icon: 'Rows3',
    hint: 'Join clips top→bottom',
    hasInput: true,
    hasOutput: true,
  },
  transition: {
    kind: 'transition',
    label: 'Transition',
    category: 'compose',
    accent: '#fb923c',
    icon: 'Shuffle',
    hint: 'xfade / GL transition',
    hasInput: true,
    hasOutput: true,
  },
  text: {
    kind: 'text',
    label: 'Text',
    category: 'post',
    accent: '#facc15',
    icon: 'Type',
    hint: 'On-screen text overlay',
    hasInput: true,
    hasOutput: true,
  },
  asset: {
    kind: 'asset',
    label: 'Asset',
    category: 'post',
    accent: '#38bdf8',
    icon: 'Image',
    hint: 'Overlay image / gif / video, timed',
    hasInput: true,
    hasOutput: true,
  },
  subtitles: {
    kind: 'subtitles',
    label: 'Subtitles',
    category: 'post',
    accent: '#fde047',
    icon: 'Captions',
    hint: 'Auto captions, style',
    hasInput: true,
    hasOutput: true,
  },
  'end-card': {
    kind: 'end-card',
    label: 'End Card',
    category: 'post',
    accent: '#fca5a5',
    icon: 'CreditCard',
    hint: 'Branded outro',
    hasInput: true,
    hasOutput: true,
    hidden: true, // use the segment "End Card" (cc-cta); keep this kind for back-compat only
  },
  'music-mix': {
    kind: 'music-mix',
    label: 'Music Mix',
    category: 'post',
    accent: '#f9a8d4',
    icon: 'AudioLines',
    hint: 'Bed under VO',
    hasInput: true,
    hasOutput: true,
  },
  export: {
    kind: 'export',
    label: 'Export',
    category: 'output',
    accent: '#e4e4e7',
    icon: 'Download',
    hint: 'Render final 9:16 ad',
    hasInput: true,
    hasOutput: false,
  },
};

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  source: 'Sources',
  segment: 'Segments',
  generate: 'Generate',
  compose: 'Compose',
  post: 'Post',
  output: 'Output',
};

export const CATEGORY_ORDER: NodeCategory[] = [
  'source',
  'segment',
  'generate',
  'compose',
  'post',
  'output',
];

export function defsByCategory(cat: NodeCategory): PipelineNodeDef[] {
  return Object.values(NODE_DEFS).filter((d) => d.category === cat && !d.hidden);
}
