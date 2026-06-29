/**
 * Reference-ad clip-by-clip analysis.
 *
 * Robust for ANY reference ad: samples frames + scene cuts (ffmpeg) and a
 * word-level transcript (FAL Whisper), then asks a vision LLM to divide the
 * timeline into labelled parts — hook / pip / a-roll / b-roll / cta.
 *
 * Two engines (see lib/analysisModels.ts):
 *  - FAL (any-llm/vision): frames tiled into one montage, runs on FAL_KEY.
 *  - Claude (direct): frames sent as separate images, needs ANTHROPIC_API_KEY.
 *
 * The result is persisted on the reference_ads row so it can be reused later to
 * split a connected combined clip the same way.
 */
import path from 'path';
import { promises as fs } from 'fs';
import { execFileSync } from 'child_process';
import { fal } from '@fal-ai/client';
import Anthropic from '@anthropic-ai/sdk';
import { getFfmpeg } from './ffmpegBinaries';
import { getVideoDuration } from './serverUtils';
import { transcribeWords } from './transcribe';
import { createTempWorkspace, cleanupTempWorkspace } from './tempWorkspace';
import { downloadToPath, uploadFile, getSignedUrl } from './storage';
import { config } from './config';
import { getAnalysisModel } from './analysisModels';

export type PartKind = 'hook' | 'pip' | 'a_roll' | 'b_roll' | 'cta' | 'other';
// re-export the cost helper so existing imports keep working
export { estimateAnalysisCost, type AnalysisCost } from './analysisModels';

export interface AnalyzedSegment {
  part: PartKind;
  startSec: number;
  endSec: number;
  description: string;
}

export interface ReferenceAnalysis {
  durationSec: number;
  segments: AnalyzedSegment[];
  summary: string;
  transcript: string;
  model: string;
  analyzedAt: string;
}

let _falReady = false;
function ensureFal() {
  if (!_falReady) {
    fal.config({ credentials: config.falKey });
    _falReady = true;
  }
}

// ---------- shared ffmpeg helpers ----------

function extractFrames(localVideo: string, ws: string, durationSec: number, count: number): { file: string; t: number }[] {
  const interval = durationSec / count;
  const frames: { file: string; t: number }[] = [];
  for (let i = 0; i < count; i++) {
    const t = Math.min(durationSec - 0.05, i * interval + interval / 2);
    const out = path.join(ws, `frame-${String(i).padStart(3, '0')}.jpg`);
    try {
      execFileSync(
        getFfmpeg(),
        ['-ss', t.toFixed(2), '-i', localVideo, '-frames:v', '1', '-vf', 'scale=512:-2', '-q:v', '4', '-y', out],
        { stdio: 'ignore' },
      );
      frames.push({ file: out, t });
    } catch {
      /* skip a bad frame */
    }
  }
  return frames;
}

function tileMontage(ws: string, frameCount: number): { file: string; cols: number; rows: number } {
  const cols = Math.ceil(Math.sqrt(frameCount));
  const rows = Math.ceil(frameCount / cols);
  const montage = path.join(ws, 'montage.jpg');
  execFileSync(
    getFfmpeg(),
    ['-i', path.join(ws, 'frame-%03d.jpg'), '-frames:v', '1', '-vf', `tile=${cols}x${rows}:padding=6:color=white`, '-q:v', '4', '-y', montage],
    { stdio: 'ignore' },
  );
  return { file: montage, cols, rows };
}

function detectSceneCuts(localVideo: string): number[] {
  try {
    const out = execFileSync(
      getFfmpeg(),
      ['-i', localVideo, '-filter:v', "select='gt(scene,0.3)',showinfo", '-f', 'null', '-'],
      { encoding: 'utf-8', stdio: ['ignore', 'ignore', 'pipe'] },
    );
    return [...out.matchAll(/pts_time:([0-9.]+)/g)].map((m) => parseFloat(m[1])).filter((n) => !isNaN(n));
  } catch (e) {
    const stderr = (e as { stderr?: string | Buffer })?.stderr?.toString() ?? '';
    return [...stderr.matchAll(/pts_time:([0-9.]+)/g)].map((m) => parseFloat(m[1])).filter((n) => !isNaN(n));
  }
}

const PARTS_DOC = `Label each segment with one of:
- hook: opening talking-head that grabs attention (usually first few seconds)
- pip: creator talking as a small picture-in-picture over an app/screen demo
- a_roll: full-frame creator talking to camera
- b_roll: supporting footage / product / screen with no talking-head, or voiceover-only
- cta: closing call-to-action / end card / logo
- other: fits none of the above`;

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    segments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          part: { type: 'string', enum: ['hook', 'pip', 'a_roll', 'b_roll', 'cta', 'other'] },
          start_sec: { type: 'number' },
          end_sec: { type: 'number' },
          description: { type: 'string' },
        },
        required: ['part', 'start_sec', 'end_sec', 'description'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'segments'],
  additionalProperties: false,
} as const;

interface RawParsed {
  summary: string;
  segments: { part: PartKind; start_sec: number; end_sec: number; description: string }[];
}

function extractJson(text: string): RawParsed {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) return { summary: '', segments: [] };
  return JSON.parse(body.slice(start, end + 1));
}

// ---------- FAL engine (montage → any-llm/vision) ----------

async function analyzeWithFal(
  videoPath: string, local: string, ws: string, durationSec: number,
  cuts: number[], transcript: string, falModel: string, maxFrames: number,
): Promise<RawParsed> {
  ensureFal();
  const count = Math.max(1, Math.min(maxFrames, Math.ceil(durationSec / 2)));
  const frames = extractFrames(local, ws, durationSec, count);
  const { file: montagePath, cols, rows } = tileMontage(ws, frames.length);
  const montageStoragePath = await uploadFile(montagePath, { folder: 'analysis', contentType: 'image/jpeg' });
  const imageUrl = await getSignedUrl(montageStoragePath, 3600);
  const labels = frames.map((f) => f.t.toFixed(1)).join(', ');

  const prompt = `This image is a ${cols}×${rows} montage of ${frames.length} frames sampled evenly from ONE short vertical ad, in reading order (left-to-right, top-to-bottom). Frame timestamps in seconds, in order: ${labels}.
Video duration: ${durationSec.toFixed(1)}s. Scene cuts at: ${cuts.length ? cuts.map((c) => c.toFixed(1) + 's').join(', ') : 'none'}.
Transcript: ${transcript || '(no speech)'}

Divide the ad into contiguous, non-overlapping segments covering the whole duration. ${PARTS_DOC}
Segments must be ordered, start at 0, and the last end must equal ${durationSec.toFixed(1)}. Prefer boundaries near scene cuts.
Respond with ONLY valid JSON: {"summary":"...","segments":[{"part":"hook","start_sec":0,"end_sec":2.5,"description":"..."}]}`;

  const result = await fal.subscribe('fal-ai/any-llm/vision', {
    input: { model: falModel, prompt, image_url: imageUrl },
    logs: false,
  });
  return extractJson((result.data as { output?: string })?.output ?? '');
}

// ---------- Claude engine (separate frames → messages.create) ----------

async function analyzeWithClaude(
  local: string, ws: string, durationSec: number,
  cuts: number[], transcript: string, anthropicModel: string, maxFrames: number,
): Promise<RawParsed> {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set — add it to .env or pick a FAL model.');
  }
  const count = Math.max(1, Math.min(maxFrames, Math.ceil(durationSec / 2)));
  const frames = extractFrames(local, ws, durationSec, count);
  const imageBlocks = await Promise.all(
    frames.map(async (f) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: (await fs.readFile(f.file)).toString('base64') },
    })),
  );
  const labels = frames.map((f) => `frame@${f.t.toFixed(1)}s`).join(', ');
  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  const resp = await anthropic.messages.create({
    model: anthropicModel,
    max_tokens: 4000,
    system: `You are a UGC ad editor. Divide the ad into contiguous, non-overlapping segments covering the whole duration. ${PARTS_DOC}\nSegments must be ordered, start at 0, and the last end_sec must equal the video duration. Prefer boundaries near scene cuts.`,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: `Duration: ${durationSec.toFixed(1)}s. Frames in order: ${labels}. Scene cuts: ${cuts.length ? cuts.map((c) => c.toFixed(1) + 's').join(', ') : 'none'}. Transcript: ${transcript || '(no speech)'}` },
        ],
      },
    ],
  } as Parameters<typeof anthropic.messages.create>[0]);
  const blocks = (resp as { content: Array<{ type: string; text?: string }> }).content;
  const textBlock = blocks.find((b) => b.type === 'text');
  return extractJson(textBlock?.text ?? '{"summary":"","segments":[]}');
}

// ---------- dispatch ----------

export async function analyzeReferenceAd(videoPath: string, modelId?: string): Promise<ReferenceAnalysis> {
  const model = getAnalysisModel(modelId);
  const ws = createTempWorkspace('adstudio-analyze');
  try {
    const local = path.join(ws, 'ref.mp4');
    await downloadToPath(videoPath, local);
    const durationSec = getVideoDuration(local) || 0;
    const cuts = detectSceneCuts(local);

    let transcript = '';
    try {
      const words = await transcribeWords(videoPath);
      transcript = words.map((w) => `[${w.start.toFixed(1)}s] ${w.text}`).join(' ');
    } catch {
      /* transcript optional */
    }

    const parsed =
      model.provider === 'anthropic'
        ? await analyzeWithClaude(local, ws, durationSec, cuts, transcript, model.anthropicModel!, model.maxFrames)
        : await analyzeWithFal(videoPath, local, ws, durationSec, cuts, transcript, model.falModel!, model.maxFrames);

    const segments: AnalyzedSegment[] = (parsed.segments ?? [])
      .map((s) => ({
        part: s.part,
        startSec: Math.max(0, s.start_sec),
        endSec: Math.min(durationSec, s.end_sec),
        description: s.description ?? '',
      }))
      .filter((s) => s.endSec > s.startSec)
      .sort((a, b) => a.startSec - b.startSec);

    return {
      durationSec,
      segments,
      summary: parsed.summary ?? '',
      transcript,
      model: model.provider === 'fal' ? `fal:${model.falModel}` : model.anthropicModel!,
      analyzedAt: new Date().toISOString(),
    };
  } finally {
    cleanupTempWorkspace(ws);
  }
}
