/**
 * Align a creator's combined clip to a reference ad's section structure.
 *
 * The creator records ONE talking-head clip, speaking a *similar* script to the
 * reference (same order, different wording/pacing). Because it's all talking-head,
 * sections (hook / pip / a-roll / b-roll) can't be told apart visually — only by
 * which part of the script is being spoken. So we transcribe the creator's clip and
 * ask an LLM to map each reference section onto the creator clip's timeline.
 *
 * Pure text task — no frames. Uses the same FAL/Claude engines as referenceAnalysis.
 */
import { fal } from '@fal-ai/client';
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config';
import { getAnalysisModel } from './analysisModels';
import type { AnalyzedSegment, PartKind } from './referenceAnalysis';
import type { WordChunk } from './transcribe';

/** Reference parts the creator actually speaks (cta = end card, handled separately). */
export type AlignablePart = 'hook' | 'pip' | 'a_roll' | 'b_roll';

export interface AlignedSection {
  part: AlignablePart;
  startSec: number;
  endSec: number;
  matched: boolean;
}

let _falReady = false;
function ensureFal() {
  if (!_falReady) {
    fal.config({ credentials: config.falKey });
    _falReady = true;
  }
}

function extractJson<T>(text: string, fallback: T): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) return fallback;
  try {
    return JSON.parse(body.slice(start, end + 1)) as T;
  } catch {
    return fallback;
  }
}

/** Parse the persisted reference transcript (`[1.2s] word …`) back into timed words. */
function parseRefTranscript(transcript: string): { start: number; text: string }[] {
  const out: { start: number; text: string }[] = [];
  for (const m of transcript.matchAll(/\[(\d+(?:\.\d+)?)s\]\s*([^[]*)/g)) {
    const start = parseFloat(m[1]);
    const text = m[2].trim();
    if (!isNaN(start) && text) out.push({ start, text });
  }
  return out;
}

/** The words the reference creator spoke inside a segment's [start,end] range. */
function scriptForSegment(seg: AnalyzedSegment, words: { start: number; text: string }[]): string {
  const inRange = words.filter((w) => w.start >= seg.startSec - 0.25 && w.start < seg.endSec + 0.25);
  return inRange.map((w) => w.text).join(' ').trim();
}

const SCHEMA = {
  type: 'object',
  properties: {
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          part: { type: 'string', enum: ['hook', 'pip', 'a_roll', 'b_roll'] },
          start_sec: { type: 'number' },
          end_sec: { type: 'number' },
          matched: { type: 'boolean' },
        },
        required: ['part', 'start_sec', 'end_sec', 'matched'],
        additionalProperties: false,
      },
    },
  },
  required: ['sections'],
  additionalProperties: false,
} as const;

interface RawAlign {
  sections: { part: AlignablePart; start_sec: number; end_sec: number; matched: boolean }[];
}

function buildPrompt(
  refSections: { part: AlignablePart; script: string; description: string }[],
  creatorWords: WordChunk[],
  durationSec: number,
): string {
  const refList = refSections
    .map((s, i) => `${i + 1}. ${s.part.toUpperCase()} — script: "${s.script || s.description || '(no words)'}"`)
    .join('\n');
  // word-level creator transcript: [startSec]word
  const creatorTx = creatorWords.map((w) => `[${w.start.toFixed(1)}]${w.text}`).join(' ');

  return `You are aligning a creator's talking-head recording to a reference ad's section structure.
The creator speaks a SIMILAR script to the reference, in the SAME order, but with different wording and pacing.

REFERENCE SECTIONS (in order, each with the script the reference creator spoke):
${refList}

CREATOR TRANSCRIPT (word-level; the number in [brackets] is that word's start time in seconds within the creator clip):
${creatorTx || '(no speech detected)'}

Creator clip duration: ${durationSec.toFixed(1)}s.

For EACH reference section above, output the creator clip [start_sec, end_sec] covering where the creator speaks the matching content. Rules:
- Match by MEANING, not exact words — the creator paraphrases.
- Sections are contiguous and in order: each section's start_sec = the previous section's end_sec. The first starts at 0.0.
- Use the creator's word start times to choose boundaries (a section ends right before the first word of the next section).
- If the creator clearly does NOT speak a section's content at all, set "matched": false and make it zero-length (start_sec == end_sec at the current position); the next section continues from there.
- The last matched section's end_sec must equal the creator clip duration (${durationSec.toFixed(1)}).
- Output one entry per reference section, in the same order and with the same "part" values.
Respond with ONLY valid JSON: {"sections":[{"part":"hook","start_sec":0.0,"end_sec":3.1,"matched":true}]}`;
}

async function runFal(prompt: string, falModel: string): Promise<RawAlign> {
  ensureFal();
  const result = await fal.subscribe('fal-ai/any-llm', { input: { model: falModel, prompt }, logs: false });
  return extractJson<RawAlign>((result.data as { output?: string })?.output ?? '', { sections: [] });
}

async function runClaude(prompt: string, anthropicModel: string): Promise<RawAlign> {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set — add it to .env or pick a FAL model.');
  }
  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  const resp = await anthropic.messages.create({
    model: anthropicModel,
    max_tokens: 2000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  } as Parameters<typeof anthropic.messages.create>[0]);
  const blocks = (resp as { content: Array<{ type: string; text?: string }> }).content;
  const text = blocks.find((b) => b.type === 'text')?.text ?? '';
  return extractJson<RawAlign>(text, { sections: [] });
}

/**
 * Map the reference sections onto the creator clip's timeline.
 * `refSegments` = the reference ad's analyzed segments (cta/other are ignored here).
 * Returns aligned, ordered sections clamped to [0, durationSec].
 */
export async function alignCombinedClip(opts: {
  refSegments: AnalyzedSegment[];
  refTranscript: string;
  creatorWords: WordChunk[];
  durationSec: number;
  modelId?: string;
}): Promise<AlignedSection[]> {
  const { refSegments, refTranscript, creatorWords, durationSec, modelId } = opts;

  const alignableParts: PartKind[] = ['hook', 'pip', 'a_roll', 'b_roll'];
  const refWords = parseRefTranscript(refTranscript || '');
  const refSections = refSegments
    .filter((s) => alignableParts.includes(s.part))
    .map((s) => ({
      part: s.part as AlignablePart,
      script: scriptForSegment(s, refWords),
      description: s.description,
    }));
  if (!refSections.length) return [];

  const model = getAnalysisModel(modelId);
  const prompt = buildPrompt(refSections, creatorWords, durationSec);
  const raw =
    model.provider === 'anthropic'
      ? await runClaude(prompt, model.anthropicModel!)
      : await runFal(prompt, model.falModel!);

  // clamp + sanity-fix the ranges
  return (raw.sections ?? [])
    .filter((s) => alignableParts.includes(s.part))
    .map((s) => {
      const startSec = Math.max(0, Math.min(durationSec, s.start_sec ?? 0));
      const endSec = Math.max(startSec, Math.min(durationSec, s.end_sec ?? startSec));
      return { part: s.part, startSec, endSec, matched: Boolean(s.matched) && endSec - startSec > 0.2 };
    });
}
