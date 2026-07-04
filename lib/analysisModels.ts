/**
 * Registry of reference-ad analysis engines — FAL vision models (run on FAL_KEY)
 * or Claude direct (needs ANTHROPIC_API_KEY). Shared by the UI (model picker +
 * cost label) and the server (dispatch). Keep this free of node-only imports.
 */
export type AnalysisProvider = 'fal' | 'anthropic';

export interface AnalysisModel {
  id: string;
  label: string;
  provider: AnalysisProvider;
  /** FAL any-llm/vision model id (provider==='fal') */
  falModel?: string;
  /** Anthropic model id (provider==='anthropic') */
  anthropicModel?: string;
  needs: 'fal' | 'anthropic';
  /** frames sampled (montage for fal, separate images for claude) */
  maxFrames: number;
  note: string;
}

export const ANALYSIS_MODELS: AnalysisModel[] = [
  // ordered best → cheapest; the default (analysis + clip split) is set explicitly below
  {
    id: 'claude:fable-5',
    label: 'Claude Fable 5 · direct',
    provider: 'anthropic',
    anthropicModel: 'claude-fable-5',
    needs: 'anthropic',
    maxFrames: 24,
    note: 'Most capable — highest accuracy, ~2× Opus price. Needs ANTHROPIC_API_KEY.',
  },
  {
    id: 'claude:opus-4-8',
    label: 'Claude Opus 4.8 · direct',
    provider: 'anthropic',
    anthropicModel: 'claude-opus-4-8',
    needs: 'anthropic',
    maxFrames: 24,
    note: 'Best reasoning — drives segment/script accuracy. Needs ANTHROPIC_API_KEY.',
  },
  {
    id: 'claude:sonnet-4-6',
    label: 'Claude Sonnet 4.6 · direct',
    provider: 'anthropic',
    anthropicModel: 'claude-sonnet-4-6',
    needs: 'anthropic',
    maxFrames: 24,
    note: 'Faster & cheaper than Opus, still strong. Needs ANTHROPIC_API_KEY.',
  },
  {
    id: 'fal:gemini-flash',
    label: 'Gemini Flash · FAL',
    provider: 'fal',
    falModel: 'google/gemini-flash-1.5',
    needs: 'fal',
    maxFrames: 16,
    note: 'Cheapest, fast — no Anthropic key needed. Lower accuracy.',
  },
];

export const DEFAULT_ANALYSIS_MODEL = 'claude:opus-4-8';

export function getAnalysisModel(id?: string): AnalysisModel {
  return ANALYSIS_MODELS.find((m) => m.id === id) ?? ANALYSIS_MODELS[0];
}

const WHISPER_PER_MIN = 0.006;

export interface AnalysisCost {
  frames: number;
  visionCost: number;
  transcriptCost: number;
  totalCost: number;
}

/** Pure cost estimate per model — drives the "~$0.0X" label in the UI. */
export function estimateAnalysisCost(durationSec: number, modelId?: string): AnalysisCost {
  const m = getAnalysisModel(modelId);
  const frames = Math.max(1, Math.min(m.maxFrames, Math.ceil((durationSec || 0) / 2)));
  let visionCost: number;
  if (m.provider === 'fal') {
    // one montage image + prompt — flat, per underlying model
    visionCost = m.falModel?.includes('claude') ? 0.05 : 0.012;
  } else {
    // Claude direct: frames as separate images. Opus 4.8 $5/$25 per 1M in/out; Fable 5 $10/$50.
    const [inRate, outRate] = m.anthropicModel === 'claude-fable-5' ? [10, 50] : [5, 25];
    const inputTokens = frames * 700 + 1500;
    visionCost = inputTokens * (inRate / 1_000_000) + 1200 * (outRate / 1_000_000);
  }
  const transcriptCost = ((durationSec || 0) / 60) * WHISPER_PER_MIN;
  return { frames, visionCost, transcriptCost, totalCost: visionCost + transcriptCost };
}
