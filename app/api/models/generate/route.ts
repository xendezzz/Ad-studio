import { NextRequest, NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import { config } from '@/lib/config';
import { uploadBuffer, getSignedUrl } from '@/lib/storage';
import { Models } from '@/lib/db';
import { DEFAULT_IMAGE_MODEL, getImageModel } from '@/lib/imageModels';
import { generateHiggsfieldImage } from '@/lib/higgsfieldImage';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

let _falConfigured = false;
function ensureFal() {
  if (!_falConfigured) {
    fal.config({ credentials: config.falKey });
    _falConfigured = true;
  }
}

type Builder = (prompt: string, url?: string) => Record<string, unknown>;
interface FalModel {
  text: string;
  edit: string | null;
  textInput: Builder;
  editInput: Builder | null;
}
const FAL_MODELS: Record<string, FalModel> = {
  'gpt-image-1': {
    text: 'fal-ai/gpt-image-1/text-to-image',
    edit: 'fal-ai/gpt-image-1/edit-image',
    textInput: (p) => ({ prompt: p, image_size: '1024x1536', quality: 'medium' }),
    editInput: (p, url) => ({ prompt: p, image_urls: [url], image_size: '1024x1536', quality: 'medium' }),
  },
  'flux-dev': {
    text: 'fal-ai/flux/dev',
    edit: 'fal-ai/flux/dev/image-to-image',
    textInput: (p) => ({ prompt: p, image_size: 'portrait_16_9', num_inference_steps: 34 }),
    editInput: (p, url) => ({ prompt: p, image_url: url, strength: 0.85, num_inference_steps: 34 }),
  },
  'flux-schnell': {
    text: 'fal-ai/flux/schnell',
    edit: null,
    textInput: (p) => ({ prompt: p, image_size: 'portrait_16_9' }),
    editInput: null,
  },
};

/**
 * POST /api/models/generate — generate a persona via a chosen FAL image model.
 *   JSON / multipart: { prompt, name?, group?, model? } (+ file=<reference>)
 */
export async function POST(req: NextRequest) {
  ensureFal();
  try {
    const ct = req.headers.get('content-type') || '';
    let prompt = '';
    let name = '';
    let group = 'Generated';
    let modelId = DEFAULT_IMAGE_MODEL;
    let refBuffer: Buffer | null = null;

    if (ct.includes('multipart/form-data')) {
      const form = await req.formData();
      prompt = (form.get('prompt') as string) || '';
      name = (form.get('name') as string) || '';
      group = (form.get('group') as string) || 'Generated';
      modelId = (form.get('model') as string) || modelId;
      const file = form.get('file');
      if (file instanceof Blob) refBuffer = Buffer.from(await file.arrayBuffer());
    } else {
      const body = await req.json();
      prompt = body?.prompt || '';
      name = body?.name || '';
      group = body?.group || 'Generated';
      modelId = body?.model || modelId;
    }

    if (!prompt.trim()) return NextResponse.json({ error: 'prompt required' }, { status: 400 });

    const personaPrompt =
      `${prompt}. Photorealistic UGC selfie-style portrait of one fictional person, vertical 9:16, ` +
      `natural skin texture, soft natural lighting, looking at camera, casual real-world setting.`;

    let buffer: Buffer;
    if (getImageModel(modelId).needs === 'higgsfield') {
      // Higgsfield Soul (image gen 2) — its own API; returns image bytes directly
      buffer = await generateHiggsfieldImage(personaPrompt);
    } else {
      const m = FAL_MODELS[modelId] ?? FAL_MODELS[DEFAULT_IMAGE_MODEL];
      let resultUrl: string | undefined;
      if (refBuffer && m.edit && m.editInput) {
        const refPath = await uploadBuffer(refBuffer, 'ref.png', { folder: 'tmp', contentType: 'image/png' });
        const refUrl = await getSignedUrl(refPath, 3600);
        const r = await fal.subscribe(m.edit, { input: m.editInput(personaPrompt, refUrl), logs: false });
        resultUrl = (r.data as { images?: { url?: string }[] })?.images?.[0]?.url;
      } else {
        const r = await fal.subscribe(m.text, { input: m.textInput(personaPrompt), logs: false });
        resultUrl = (r.data as { images?: { url?: string }[] })?.images?.[0]?.url;
      }
      if (!resultUrl) throw new Error('No image returned');
      const res = await fetch(resultUrl);
      if (!res.ok) throw new Error(`Failed to download generated image (${res.status})`);
      buffer = Buffer.from(await res.arrayBuffer());
    }
    const imagePath = await uploadBuffer(buffer, `${(name || 'model').replace(/\s+/g, '-')}.png`, {
      folder: 'models',
      contentType: 'image/png',
    });

    const row = await Models.create({
      name: name.trim() || `Model ${Date.now().toString(36)}`,
      description: `gen:${group}`,
      imagePath,
      voiceProvider: 'elevenlabs',
    });
    return NextResponse.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
