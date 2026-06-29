/**
 * Cost model — the single source of truth for what each generation step costs, in US dollars.
 *
 * CALIBRATE these to your real FAL / Higgsfield / ElevenLabs rates; everything that shows a cost
 * reads from this table, so changing a number here updates every estimate across the app.
 */
export const COST_USD = {
  firstFrame: 0.04, // nano-banana image edit (one swapped first frame)
  motionSwap: 0.5, // Kling motion-control on a full-frame clip
  pipSwap: 0.7, // Kling motion-control + bg-removal + composite for a PiP clip
  bgRemove: 0.1, // ben/v2 background removal
  subtitles: 0.03, // Whisper transcription + caption burn for one clip
  tts: 0.1, // ElevenLabs voice for one clip
} as const;

export type CostKind = keyof typeof COST_USD;

export interface CostLine {
  label: string;
  count: number;
  each: number; // USD per unit
  amount: number; // USD total for this line
}

/** Build one line of a cost estimate. */
export function costLine(label: string, count: number, kind: CostKind): CostLine {
  const each = COST_USD[kind];
  return { label, count, each, amount: count * each };
}

export function totalUSD(lines: CostLine[]): number {
  return lines.reduce((s, l) => s + l.amount, 0);
}

/** "$12.40" (or "$0.04") */
export function formatUSD(n: number): string {
  return `$${n.toFixed(2)}`;
}
