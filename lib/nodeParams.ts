/**
 * Per-node-kind editable parameter schemas.
 *
 * Shared by the node (renders the primary param as a value pill) and the inspector
 * (renders editable controls). Values live in node.data.params; defaults here.
 */
import type { PipelineNodeKind } from './pipeline';

export type ParamControl = 'select' | 'text' | 'upload';

export interface ParamField {
  key: string;
  label: string;
  control: ParamControl;
  options?: string[];
  default?: string;
  placeholder?: string;
}

export const PARAM_SCHEMAS: Record<PipelineNodeKind, ParamField[]> = {
  'reference-ad': [{ key: 'clip', label: 'Reference', control: 'upload' }],
  'combined-clip': [{ key: 'clip', label: 'Clip', control: 'upload' }],
  'cc-hook': [{ key: 'clip', label: 'Segment', control: 'upload' }],
  'cc-pip': [{ key: 'clip', label: 'Segment', control: 'upload' }],
  'cc-aroll': [{ key: 'clip', label: 'Segment', control: 'upload' }],
  'cc-broll': [{ key: 'clip', label: 'Segment', control: 'upload' }],
  'cc-cta': [{ key: 'clip', label: 'End card', control: 'upload' }],
  model: [
    { key: 'persona', label: 'Persona still', control: 'upload' },
    {
      key: 'voice',
      label: 'Voice',
      control: 'select',
      options: ['Aria', 'Maya', 'Leo', 'Olivia'],
      default: 'Aria',
    },
  ],
  hook: [{ key: 'clip', label: 'Clip', control: 'upload' }],
  'app-demo': [{ key: 'clip', label: 'Screen rec', control: 'upload' }],
  music: [
    {
      key: 'track',
      label: 'Track',
      control: 'select',
      options: ['Upbeat 01', 'Lo-fi bed', 'Cinematic'],
      default: 'Upbeat 01',
    },
  ],
  'motion-control': [
    {
      key: 'engine',
      label: 'Model',
      control: 'select',
      options: ['FAL Kling 2.6', 'Higgsfield Kling 3.0'],
      default: 'FAL Kling 2.6',
    },
    {
      key: 'audio',
      label: 'Audio',
      control: 'select',
      options: ['Keep original', 'Generate'],
      default: 'Keep original',
    },
    { key: 'prompt', label: 'Prompt', control: 'text', placeholder: 'optional motion prompt' },
  ],
  'swap-output': [],
  'bg-remove': [
    {
      key: 'mode',
      label: 'Mode',
      control: 'select',
      options: ['Alpha · ben/v2', 'remove-background'],
      default: 'Alpha · ben/v2',
    },
    {
      key: 'position',
      label: 'PiP corner',
      control: 'select',
      options: ['Bottom-right', 'Bottom-left', 'Top-right', 'Top-left'],
      default: 'Bottom-right',
    },
  ],
  voice: [
    {
      key: 'engine',
      label: 'Engine',
      control: 'select',
      options: ['ElevenLabs'],
      default: 'ElevenLabs',
    },
    {
      key: 'voiceId',
      label: 'Voice',
      control: 'select',
      options: ['Aria', 'Maya', 'Leo'],
      default: 'Aria',
    },
  ],
  combine: [
    {
      key: 'canvas',
      label: 'Canvas',
      control: 'select',
      options: ['1080×1920', '1080×1350', '1080×1080'],
      default: '1080×1920',
    },
  ],
  sequence: [],
  transition: [
    {
      key: 'style',
      label: 'Style',
      control: 'select',
      options: ['Dissolve', 'Wipe left', 'Slide up', 'Circle open', 'Pixelize'],
      default: 'Dissolve',
    },
    {
      key: 'duration',
      label: 'Duration',
      control: 'select',
      options: ['0.3s', '0.5s', '1s'],
      default: '0.5s',
    },
  ],
  text: [
    {
      key: 'length',
      label: 'Length',
      control: 'select',
      options: ['Short', 'Medium', 'Long'],
      default: 'Short',
    },
    { key: 'content', label: 'Text', control: 'text', placeholder: 'on-screen text' },
  ],
  subtitles: [
    {
      key: 'style',
      label: 'Style',
      control: 'select',
      options: ['Bold', 'Boxed', 'Highlight', 'Bubble', 'Pop', 'Neon', 'Classic', 'Creator', 'Plain'],
      default: 'Bold',
    },
    {
      key: 'font',
      label: 'Font',
      control: 'select',
      options: ['Inter', 'Montserrat', 'Poppins', 'Oswald', 'Bebas Neue', 'Anton', 'Archivo Black', 'Roboto', 'Playfair', 'Lora'],
      default: 'Montserrat',
    },
    {
      key: 'size',
      label: 'Size',
      control: 'select',
      options: ['Small', 'Medium', 'Large', 'X-Large'],
      default: 'Large',
    },
    {
      key: 'position',
      label: 'Position',
      control: 'select',
      options: ['Bottom', 'Center', 'Top'],
      default: 'Bottom',
    },
  ],
  'end-card': [{ key: 'brand', label: 'Brand', control: 'text', default: 'Runable' }],
  'music-mix': [
    {
      key: 'bed',
      label: 'Bed',
      control: 'select',
      options: ['−12 dB', '−18 dB', '−24 dB'],
      default: '−18 dB',
    },
  ],
  export: [
    {
      key: 'format',
      label: 'Format',
      control: 'select',
      options: ['9:16 · MP4', '1:1 · MP4', '16:9 · MP4'],
      default: '9:16 · MP4',
    },
  ],
};

/** The param shown on the node face (first select-ish field), or null. */
export function primaryParam(kind: PipelineNodeKind): ParamField | null {
  const fields = PARAM_SCHEMAS[kind] ?? [];
  return fields.find((f) => f.control === 'select') ?? null;
}

export function paramValue(
  kind: PipelineNodeKind,
  key: string,
  params?: Record<string, string>,
): string {
  const field = (PARAM_SCHEMAS[kind] ?? []).find((f) => f.key === key);
  return params?.[key] ?? field?.default ?? '';
}
