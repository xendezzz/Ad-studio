import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { execFileSync } from 'child_process';
import { fal } from '@fal-ai/client';
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';
import { getFfmpeg } from '@/lib/ffmpegBinaries';
import { createTempWorkspace, cleanupTempWorkspace } from '@/lib/tempWorkspace';
import { downloadToPath, downloadToBuffer, uploadBuffer } from '@/lib/storage';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const PROMPT =
  'Replace the person in the second image with the person from the first image. ' +
  'Keep the exact same pose, background, camera angle, and lighting from the second image. ' +
  'The person must retain their exact facial features and appearance from the first image. ' +
  'Remove any text, watermarks, or logos. Output a clean photorealistic photograph.';

// nano-banana-pro intermittently returns no_media_generated, so fall back through these.
function editTrials(personaUrl: string, frameUrl: string): { model: string; input: Record<string, unknown> }[] {
  return [
    { model: 'fal-ai/nano-banana-pro/edit', input: { image_urls: [personaUrl, frameUrl], prompt: PROMPT, num_images: 1, output_format: 'jpeg', limit_generations: true, resolution: '1K', safety_tolerance: '6', thinking_level: 'high' } },
    { model: 'fal-ai/nano-banana/edit', input: { image_urls: [personaUrl, frameUrl], prompt: PROMPT, num_images: 1, output_format: 'jpeg' } },
    { model: 'fal-ai/bytedance/seedream/v4/edit', input: { image_urls: [personaUrl, frameUrl], prompt: PROMPT, num_images: 1 } },
  ];
}

let _falReady = false;
function ensureFal() {
  if (!_falReady) {
    fal.config({ credentials: config.falKey });
    _falReady = true;
  }
}

/** Run one FAL edit model; returns the image URL or null (logs the real FAL reason on failure). */
async function runEdit(model: string, input: Record<string, unknown>): Promise<string | null> {
  try {
    const r = await fal.subscribe(model as never, { input: input as never, logs: false });
    const data = r.data as { images?: { url?: string }[]; image?: { url?: string } };
    return data?.images?.[0]?.url ?? data?.image?.url ?? null;
  } catch (e) {
    let msg = e instanceof Error ? e.message : String(e);
    const body = (e as { body?: unknown })?.body;
    if (Array.isArray(body) && body.length) msg = (body[0] as { msg?: string })?.msg || msg;
    console.warn(`[first-frame] ${model} failed: ${String(msg).slice(0, 140)}`);
    return null;
  }
}

/** Opus 4.8 vision: do the generated face and the persona look like the same person? */
async function faceMatches(personaJpeg: Buffer, genBuf: Buffer): Promise<'match' | 'mismatch' | 'unknown'> {
  if (!config.anthropicApiKey) return 'unknown';
  try {
    const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    const resp = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 400,
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: { type: 'object', properties: { same_person: { type: 'boolean' }, reason: { type: 'string' } }, required: ['same_person', 'reason'], additionalProperties: false },
        },
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: personaJpeg.toString('base64') } },
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: genBuf.toString('base64') } },
            { type: 'text', text: 'Image 1 is a reference face. Image 2 is an AI-edited photo that is supposed to show the SAME person. Ignore pose, background, lighting, crop and expression. Do the faces look like the same person, and is image 2 a clean, non-garbled photo of a face? Respond JSON: {"same_person": <bool>, "reason": "<short>"}.' },
          ],
        },
      ],
    } as Parameters<typeof anthropic.messages.create>[0]);
    const blocks = (resp as { content: Array<{ type: string; text?: string }> }).content;
    const text = blocks.find((b) => b.type === 'text')?.text ?? '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return 'unknown';
    const parsed = JSON.parse(m[0]) as { same_person?: boolean };
    return parsed.same_person === true ? 'match' : parsed.same_person === false ? 'mismatch' : 'unknown';
  } catch (e) {
    console.warn('[first-frame] Opus face-match review failed:', e instanceof Error ? e.message : e);
    return 'unknown';
  }
}

/**
 * POST /api/motion-control/first-frame  { persona, video }
 * Extracts the driver video's first frame and swaps in the persona (nano-banana edit),
 * producing a still to verify before committing to the (expensive) video generation.
 * Returns { image: <storagePath> }.
 */
export async function POST(req: NextRequest) {
  try {
    const { persona, video, crop } = await req.json();
    if (!persona || typeof persona !== 'string') {
      return NextResponse.json({ error: 'persona (model image) is required' }, { status: 400 });
    }
    if (!video || typeof video !== 'string') {
      return NextResponse.json({ error: 'video (driver clip) is required' }, { status: 400 });
    }
    ensureFal();

    const ws = createTempWorkspace('adstudio-firstframe');
    try {
      // extract the driver's opening frame (0.1s avoids an occasional black frame at 0)
      const local = path.join(ws, 'driver.mp4');
      await downloadToPath(video, local);
      const framePath = path.join(ws, 'frame.jpg');
      execFileSync(
        getFfmpeg(),
        ['-ss', '0.1', '-i', local, '-frames:v', '1', '-q:v', '3', '-y', framePath],
        { stdio: 'ignore' },
      );

      // for PiP, crop down to just the creator inset before swapping
      let frameInput = sharp(framePath);
      if (crop && typeof crop === 'object') {
        const meta = await sharp(framePath).metadata();
        const W = meta.width ?? 0;
        const H = meta.height ?? 0;
        if (W && H) {
          const left = Math.max(0, Math.round((crop.x ?? 0) * W));
          const top = Math.max(0, Math.round((crop.y ?? 0) * H));
          const width = Math.max(1, Math.min(W - left, Math.round((crop.w ?? 1) * W)));
          const height = Math.max(1, Math.min(H - top, Math.round((crop.h ?? 1) * H)));
          frameInput = sharp(framePath).extract({ left, top, width, height });
        }
      }

      // normalize both inputs to <=1024 jpeg for model compatibility
      const personaBuf = await downloadToBuffer(persona);
      const [personaJpeg, frameJpeg] = await Promise.all([
        sharp(personaBuf).resize(1024, 1024, { fit: 'inside', withoutEnlargement: false }).jpeg({ quality: 95 }).toBuffer(),
        frameInput.resize(1024, 1024, { fit: 'inside', withoutEnlargement: false }).jpeg({ quality: 95 }).toBuffer(),
      ]);

      // hand FAL fetchable urls (order matters: [face, scene])
      const [personaUrl, frameUrl] = await Promise.all([
        fal.storage.upload(new Blob([new Uint8Array(personaJpeg)], { type: 'image/jpeg' })),
        fal.storage.upload(new Blob([new Uint8Array(frameJpeg)], { type: 'image/jpeg' })),
      ]);

      // Try each model in turn; accept the first that produces a face Opus 4.8 confirms
      // matches the persona. If none "match", keep the last produced image (don't hard-fail).
      let matched: { buf: Buffer; model: string } | null = null;
      let lastProduced: { buf: Buffer; model: string } | null = null;
      for (const trial of editTrials(personaUrl, frameUrl)) {
        const url = await runEdit(trial.model, trial.input);
        if (!url) continue;
        const res = await fetch(url);
        if (!res.ok) continue;
        const outBuf = Buffer.from(await res.arrayBuffer());
        lastProduced = { buf: outBuf, model: trial.model };
        const review = await faceMatches(personaJpeg, outBuf);
        if (review === 'mismatch') {
          console.warn(`[first-frame] ${trial.model} produced a non-matching face — trying next model`);
          continue;
        }
        matched = { buf: outBuf, model: trial.model };
        break;
      }

      const chosen = matched ?? lastProduced;
      if (!chosen) {
        return NextResponse.json(
          { error: 'The image model could not generate a first frame (all fallbacks failed). Try again, or adjust the crop so the creator’s face is clearly inside it.' },
          { status: 502 },
        );
      }
      const image = await uploadBuffer(chosen.buf, `first-frame-${Date.now()}.jpg`, {
        folder: 'gen/first-frame',
        contentType: 'image/jpeg',
      });

      return NextResponse.json({ image, model: chosen.model, faceMatch: matched ? 'match' : 'unverified' });
    } finally {
      cleanupTempWorkspace(ws);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'First-frame generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
