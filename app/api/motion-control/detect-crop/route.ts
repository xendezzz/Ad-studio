import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';
import { execFileSync } from 'child_process';
import { fal } from '@fal-ai/client';
import Anthropic from '@anthropic-ai/sdk';
import { getFfmpeg } from '@/lib/ffmpegBinaries';
import { createTempWorkspace, cleanupTempWorkspace } from '@/lib/tempWorkspace';
import { downloadToPath, uploadFile, getSignedUrl } from '@/lib/storage';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

let _falReady = false;
function ensureFal() {
  if (!_falReady) {
    fal.config({ credentials: config.falKey });
    _falReady = true;
  }
}

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
interface CropBox {
  corner: Corner;
  x: number;
  y: number;
  w: number;
  h: number;
}

const PROMPT =
  'This is ONE frame from a vertical (9:16) UGC ad. A small inset video of a talking person ' +
  '(the creator) is overlaid in ONE corner, on top of an app / screen recording that fills the frame. ' +
  'Find the creator inset and return its bounding box as fractions of the frame in [0,1]. ' +
  'Respond with ONLY JSON: {"corner":"top-left|top-right|bottom-left|bottom-right","x":<left>,"y":<top>,"w":<width>,"h":<height>}. ' +
  'x,y = the inset top-left corner; w,h = its size. If there is no inset, use the whole frame {"corner":"bottom-left","x":0,"y":0.5,"w":0.5,"h":0.5}.';

function clamp01(n: number, fallback: number): number {
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

function parseBox(raw: string): CropBox | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const p = JSON.parse(m[0]) as Partial<CropBox>;
    const corner = (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as Corner[]).includes(p.corner as Corner)
      ? (p.corner as Corner)
      : 'bottom-left';
    const box: CropBox = {
      corner,
      x: clamp01(p.x as number, 0),
      y: clamp01(p.y as number, 0.5),
      w: clamp01(p.w as number, 0.5),
      h: clamp01(p.h as number, 0.5),
    };
    box.w = Math.min(box.w, 1 - box.x);
    box.h = Math.min(box.h, 1 - box.y);
    return box;
  } catch {
    return null;
  }
}

/** Opus 4.8 vision — most reliable at locating the creator inset. */
async function detectWithOpus(frameBuffer: Buffer): Promise<CropBox | null> {
  if (!config.anthropicApiKey) return null;
  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  const resp = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 300,
    output_config: { effort: 'low' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: frameBuffer.toString('base64') } },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
  } as Parameters<typeof anthropic.messages.create>[0]);
  const blocks = (resp as { content: Array<{ type: string; text?: string }> }).content;
  return parseBox(blocks.find((b) => b.type === 'text')?.text ?? '');
}

/** FAL Gemini Flash vision — cheap fallback if no Anthropic key. */
async function detectWithFal(frameUrl: string): Promise<CropBox | null> {
  const result = await fal.subscribe('fal-ai/any-llm/vision', {
    input: { model: 'google/gemini-flash-1.5', prompt: PROMPT, image_url: frameUrl },
    logs: false,
  });
  return parseBox((result.data as { output?: string })?.output ?? '');
}

/**
 * POST /api/motion-control/detect-crop  { video }
 * Extracts the first frame and asks a vision model which corner the creator inset is in
 * (+ a bounding box). Returns { frame: <storagePath>, box } — the UI shows the frame with
 * the box for the user to confirm/adjust before cropping.
 */
export async function POST(req: NextRequest) {
  try {
    const { video } = await req.json();
    if (!video || typeof video !== 'string') {
      return NextResponse.json({ error: 'video is required' }, { status: 400 });
    }
    ensureFal();

    const ws = createTempWorkspace('adstudio-detectcrop');
    try {
      const local = path.join(ws, 'pip.mp4');
      await downloadToPath(video, local);
      const framePath = path.join(ws, 'frame.jpg');
      execFileSync(
        getFfmpeg(),
        ['-ss', '0.1', '-i', local, '-frames:v', '1', '-q:v', '3', '-y', framePath],
        { stdio: 'ignore' },
      );
      const frame = await uploadFile(framePath, { folder: 'gen/pip-frames', contentType: 'image/jpeg' });

      // detect the creator inset: Opus 4.8 vision (best), else FAL Gemini fallback
      let box: CropBox = { corner: 'bottom-left', x: 0, y: 0.5, w: 0.5, h: 0.5 };
      try {
        const frameBuffer = await fs.readFile(framePath);
        let detected = await detectWithOpus(frameBuffer);
        if (!detected) detected = await detectWithFal(await getSignedUrl(frame, 3600));
        if (detected) box = detected;
      } catch (e) {
        console.warn('[detect-crop] vision detection failed, using default box:', e);
      }

      return NextResponse.json({ frame, box });
    } finally {
      cleanupTempWorkspace(ws);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Crop detection failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
