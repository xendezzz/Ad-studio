/**
 * The "Remotion" node engine — auto graphics + sound effects from the script.
 *
 * Flow: source video → Whisper word-level transcript → Claude picks the
 * important words and assigns each a Runable-branded graphic (keyword pop /
 * emoji / star sparkles) + a sound effect → one Remotion render pass burns
 * everything in.
 *
 * If nobody is speaking (no usable transcript), the node does NOT apply and
 * returns a warning instead — the input video passes through untouched.
 */
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { execFileSync } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';
import { fal } from '@fal-ai/client';
import { config } from './config';
import { getFfmpeg, getFfprobe } from './ffmpegBinaries';
import { transcribeWordsFromUrl, type WordChunk } from './transcribe';
import { ensureSfx, SFX_PACK } from './sfx';
import { renderEmphasis } from './remotionRender';
import { downloadToPath, uploadFile } from './storage';
import { RUNABLE_COLORS, type EmphasisEvent } from '@/remotion/types';

export interface EmphasisResult {
  applied: boolean;
  /** set when applied === false — why the node was skipped */
  warning?: string;
  events?: EmphasisEvent[];
  transcript?: string;
}

const FONT_FILE = path.join(process.cwd(), 'lib', 'fonts', 'Anton-Regular.ttf');
const ALLOWED_COLORS: string[] = [
  RUNABLE_COLORS.acidYellow,
  RUNABLE_COLORS.coralRed,
  RUNABLE_COLORS.warmIvory,
  RUNABLE_COLORS.glowTeal,
  RUNABLE_COLORS.warmAmber,
];

interface Probe {
  width: number;
  height: number;
  fps: number;
  duration: number;
}

function probeVideo(local: string): Probe {
  const raw = execFileSync(
    getFfprobe(),
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', local],
    { maxBuffer: 10 * 1024 * 1024 },
  ).toString();
  const json = JSON.parse(raw) as {
    streams?: Array<{ width?: number; height?: number; r_frame_rate?: string }>;
    format?: { duration?: string };
  };
  const s = json.streams?.[0] ?? {};
  const [num, den] = (s.r_frame_rate ?? '30/1').split('/').map(Number);
  const fps = den ? num / den : 30;
  return {
    width: s.width ?? 1080,
    height: s.height ?? 1920,
    fps: Number.isFinite(fps) && fps > 0 ? Math.round(fps) : 30,
    duration: parseFloat(json.format?.duration ?? '0') || 0,
  };
}

/** Extract the audio track as a small MP3; returns null when the video has no audio stream. */
function extractAudio(local: string, outDir: string): string | null {
  const out = path.join(outDir, 'audio.mp3');
  try {
    execFileSync(getFfmpeg(), ['-y', '-i', local, '-vn', '-acodec', 'libmp3lame', '-q:a', '5', out], {
      timeout: 120000,
      maxBuffer: 50 * 1024 * 1024,
    });
    return out;
  } catch {
    return null; // no audio stream at all
  }
}

async function transcribeLocal(localVideo: string, ws: string): Promise<WordChunk[]> {
  const audio = extractAudio(localVideo, ws);
  if (!audio) return [];
  fal.config({ credentials: config.falKey });
  const buf = await fs.readFile(audio);
  const url = await fal.storage.upload(new File([new Uint8Array(buf)], 'audio.mp3', { type: 'audio/mpeg' }));
  return transcribeWordsFromUrl(url);
}

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          wordIndex: { type: 'integer', description: 'index of the important word in the numbered transcript' },
          kind: { type: 'string', enum: ['keyword', 'emoji', 'sparkle'] },
          text: { type: 'string', description: 'keyword only: the word/short phrase to pop on screen (1-3 words)' },
          emoji: { type: 'string', description: 'emoji only: a single emoji character' },
          color: { type: 'string', enum: ALLOWED_COLORS, description: 'keyword only: fill color' },
          slot: { type: 'string', enum: ['top', 'upper', 'lower'], description: 'vertical position — never covers the speaker face (center)' },
          sfx: { type: 'string', enum: [...Object.keys(SFX_PACK), 'none'] },
        },
        required: ['wordIndex', 'kind', 'slot', 'sfx'],
      },
    },
  },
  required: ['events'],
} as const;

interface PlannedEvent {
  wordIndex: number;
  kind: EmphasisEvent['kind'];
  text?: string;
  emoji?: string;
  color?: string;
  slot: EmphasisEvent['slot'];
  sfx: string;
}

async function planWithClaude(words: WordChunk[], duration: number): Promise<PlannedEvent[]> {
  if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is not set — the Remotion node needs it to pick important words.');
  const numbered = words.map((w, i) => `${i}[${w.start.toFixed(2)}s] ${w.text}`).join(' ');
  const targetCount = Math.max(3, Math.min(8, Math.round(duration / 2.5)));
  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  const resp = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2000,
    system:
      `You are a short-form UGC ad motion-graphics editor for Runable (an AI agent platform — warm, playful, never corporate). ` +
      `Given a word-timestamped ad script, pick the ~${targetCount} most important emphasis moments: product name ("Runable"), numbers/prices, power words (free, instantly, easy, wow moments), emotional beats. ` +
      `For each, choose ONE treatment: "keyword" (the word pops on screen big and bold — use for the strongest beats; text should be the spoken word or a tight 1-3 word phrase), ` +
      `"emoji" (a single fitting emoji pops in), or "sparkle" (subtle star sparkles — use for gentle positive beats). Mix all three treatments across the ad. ` +
      `Choose a fitting sound effect per moment (${Object.keys(SFX_PACK).join(', ')}) or "none"; do not put a sound on every single moment. ` +
      `Slots: "top"/"upper" are the top third of a 9:16 frame, "lower" is below-center — the speaker's face is around the center, never cover it. Vary slots. ` +
      `Space moments at least 1.5s apart. Never invent words that are not in the transcript.`,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: PLAN_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `Video duration: ${duration.toFixed(1)}s. Numbered transcript (index[start] word): ${numbered}`,
      },
    ],
  } as Parameters<typeof anthropic.messages.create>[0]);
  const blocks = (resp as { content: Array<{ type: string; text?: string }> }).content;
  const text = blocks.find((b) => b.type === 'text')?.text ?? '{"events":[]}';
  const parsed = JSON.parse(text) as { events?: PlannedEvent[] };
  return parsed.events ?? [];
}

/** Turn the LLM plan into concrete timed events, clamped and de-overlapped. */
function resolveEvents(plan: PlannedEvent[], words: WordChunk[], duration: number): EmphasisEvent[] {
  const valid = plan
    .filter((p) => p.wordIndex >= 0 && p.wordIndex < words.length)
    .sort((a, b) => words[a.wordIndex].start - words[b.wordIndex].start);
  const events: EmphasisEvent[] = [];
  for (const p of valid) {
    const w = words[p.wordIndex];
    const start = Math.max(0, Math.min(w.start, duration - 0.5));
    const prev = events[events.length - 1];
    if (prev && start - prev.start < 1.2) continue; // keep moments breathable
    if (prev && prev.end > start) prev.end = Math.max(prev.start + 0.5, start - 0.05);
    events.push({
      id: `ev-${events.length}`,
      kind: p.kind,
      start,
      end: Math.min(start + (p.kind === 'keyword' ? 1.7 : 1.4), duration),
      text: p.kind === 'keyword' ? p.text || w.text : undefined,
      emoji: p.kind === 'emoji' ? p.emoji || '✨' : undefined,
      color: p.kind === 'keyword' ? (ALLOWED_COLORS.includes(p.color ?? '') ? p.color : RUNABLE_COLORS.acidYellow) : undefined,
      slot: p.slot === 'top' || p.slot === 'upper' || p.slot === 'lower' ? p.slot : 'upper',
      sfxUrl: p.sfx && p.sfx !== 'none' ? p.sfx : null, // pack name for now; resolved to a served file below
    });
  }
  return events;
}

/**
 * Core: apply auto graphics + SFX to a LOCAL video file, writing outFile.
 * Returns applied=false (with a warning, and no outFile written) when there is no speech.
 */
export async function emphasizeLocalVideo(localVideo: string, outFile: string): Promise<EmphasisResult> {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'remotion-emphasis-'));
  try {
    const probe = probeVideo(localVideo);
    if (!probe.duration) throw new Error('could not read video duration');

    const words = await transcribeLocal(localVideo, ws);
    const spoken = words.map((w) => w.text).join(' ').trim();
    if (words.length < 3 || spoken.length < 8) {
      return {
        applied: false,
        warning: 'No one is speaking in this ad — Remotion graphics need a spoken script, so nothing was applied.',
      };
    }

    const plan = await planWithClaude(words, probe.duration);
    const events = resolveEvents(plan, words, probe.duration);
    if (!events.length) {
      return { applied: false, warning: 'No emphasis-worthy words found in the script — nothing was applied.', transcript: spoken };
    }

    // stage the render assets dir: video + font + the sfx the plan actually uses
    const assetsDir = path.join(ws, 'assets');
    await fs.mkdir(assetsDir, { recursive: true });
    const videoFile = path.join(assetsDir, `src${path.extname(localVideo) || '.mp4'}`);
    await fs.copyFile(localVideo, videoFile);
    let fontFile: string | null = null;
    try {
      await fs.copyFile(FONT_FILE, path.join(assetsDir, 'display.ttf'));
      fontFile = 'display.ttf';
    } catch {
      /* render falls back to system fonts */
    }
    const sfxFiles = await ensureSfx(events.map((e) => e.sfxUrl).filter(Boolean) as string[]);
    for (const ev of events) {
      const local = ev.sfxUrl ? sfxFiles[ev.sfxUrl] : undefined;
      if (local) {
        const name = path.basename(local);
        await fs.copyFile(local, path.join(assetsDir, name));
        ev.sfxUrl = name;
      } else {
        ev.sfxUrl = null;
      }
    }

    await renderEmphasis({
      videoFile,
      assetsDir,
      fontFile,
      outFile,
      props: {
        events,
        durationInFrames: Math.round(probe.duration * probe.fps),
        fps: probe.fps,
        width: probe.width,
        height: probe.height,
      },
    });
    return { applied: true, events, transcript: spoken };
  } finally {
    await fs.rm(ws, { recursive: true, force: true }).catch(() => {});
  }
}

/** Pipeline wrapper: Storage path in → Storage path out (or pass-through + warning). */
export async function applyRemotionEmphasis(
  videoStoragePath: string,
): Promise<{ videoPath?: string; warning?: string }> {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'remotion-node-'));
  try {
    const local = path.join(ws, `in${path.extname(videoStoragePath) || '.mp4'}`);
    await downloadToPath(videoStoragePath, local);
    const out = path.join(ws, 'emphasized.mp4');
    const result = await emphasizeLocalVideo(local, out);
    if (!result.applied) return { warning: result.warning };
    return { videoPath: await uploadFile(out, { folder: 'gen/remotion' }) };
  } finally {
    await fs.rm(ws, { recursive: true, force: true }).catch(() => {});
  }
}
