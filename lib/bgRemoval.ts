/**
 * Background removal (alpha cutout) for the PiP creator clip.
 *
 * This is the one genuinely NEW integration (ai-ugc had none). Uses FAL BEN2 video
 * background removal, matching the manual pipeline's validated "ben/v2 webm-alpha" recipe.
 *
 * NOTE: the exact FAL endpoint id / output field may need a small tweak once tested
 * against a live FAL key — flagged in the run log if it 404s.
 */
import { fal } from '@fal-ai/client';
import { config } from './config';
import { getSignedUrl, uploadBuffer } from './storage';

const FAL_BG_REMOVAL_ENDPOINT = 'fal-ai/ben/v2/video';

let _configured = false;
function ensureFal() {
  if (!_configured) {
    fal.config({ credentials: config.falKey });
    _configured = true;
  }
}

/**
 * Remove the background of a video clip → alpha (webm) cutout, stored in the bucket.
 * @param videoPath Supabase Storage object path of the input clip.
 * @returns Storage object path of the alpha cutout (webm).
 */
export async function removeVideoBackground(videoPath: string): Promise<{
  outputPath: string;
  externalRequestId?: string;
}> {
  ensureFal();

  const videoUrl = await getSignedUrl(videoPath, 3600);

  const { request_id } = await fal.queue.submit(FAL_BG_REMOVAL_ENDPOINT, {
    // output_format 'webm' => VP9 with a true alpha channel; no background_color => transparent.
    input: { video_url: videoUrl, output_format: 'webm' },
  });

  await fal.queue.subscribeToStatus(FAL_BG_REMOVAL_ENDPOINT, {
    requestId: request_id,
    logs: false,
  });
  const result = await fal.queue.result(FAL_BG_REMOVAL_ENDPOINT, { requestId: request_id });

  const videoData =
    (result.data as { video?: { url?: string } })?.video ??
    (result as unknown as { video?: { url?: string } }).video;
  if (!videoData?.url) throw new Error('No alpha video URL returned from FAL bg-removal');

  const res = await fetch(videoData.url);
  if (!res.ok) throw new Error(`Failed to download bg-removal output (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const outputPath = await uploadBuffer(buffer, `alpha-${request_id}.webm`, {
    folder: 'gen/bg-removed',
    contentType: 'video/webm',
  });

  return { outputPath, externalRequestId: request_id };
}
