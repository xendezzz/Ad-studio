/**
 * Turn a real-person model image into a DISTINCT synthetic persona via FAL
 * image-to-image (Flux). Keeps the UGC-selfie style/framing but generates a new
 * face so the result is not a real-person likeness.
 */
import { fal } from '@fal-ai/client';
import { config } from './config';
import { getSignedUrl, uploadBuffer } from './storage';

const FAL_I2I_ENDPOINT = 'fal-ai/flux/dev/image-to-image';

let _configured = false;
function ensureFal() {
  if (!_configured) {
    fal.config({ credentials: config.falKey });
    _configured = true;
  }
}

const ALTER_PROMPT =
  'photorealistic UGC selfie-style portrait of a different unique young person, ' +
  'natural skin texture, casual real-world setting, soft natural lighting, ' +
  'looking at camera, candid amateur phone photo, vertical 9:16 framing';

/**
 * @param imagePath Supabase Storage object path of the source model image.
 * @param strength  0..1 — higher = more transformed (more distinct face). Default 0.72.
 * @returns Storage object path of the altered synthetic image.
 */
export async function alterModelImage(imagePath: string, strength = 0.72): Promise<string> {
  ensureFal();
  const imageUrl = await getSignedUrl(imagePath, 3600);

  const result = await fal.subscribe(FAL_I2I_ENDPOINT, {
    input: {
      image_url: imageUrl,
      prompt: ALTER_PROMPT,
      strength,
      num_inference_steps: 34,
      guidance_scale: 3.5,
    },
    logs: false,
  });

  const url = (result.data as { images?: { url?: string }[] })?.images?.[0]?.url;
  if (!url) throw new Error('No image returned from FAL image-to-image');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download altered image (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());

  return uploadBuffer(buffer, `altered-${Date.now()}.png`, {
    folder: 'models/synthetic',
    contentType: 'image/png',
  });
}
