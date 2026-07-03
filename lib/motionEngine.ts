/**
 * Motion-control engine adapter.
 *
 * One interface, two implementations:
 *   - falKlingEngine   (PRIMARY) — FAL Kling 2.6 motion-control
 *   - higgsfieldEngine (switchable) — placeholder until wired to Higgsfield
 *
 * Engine is chosen by config.motionEngine (env MOTION_ENGINE), so callers never
 * hardcode a provider:
 *
 *   const engine = getMotionEngine();
 *   const { outputPath } = await engine.motionControl({ imagePath, driverVideoPath });
 *
 * Inputs/outputs are Supabase Storage object PATHS. The adapter signs URLs for the
 * engine to fetch, runs the job, downloads the result, and re-uploads to Storage.
 */
import { fal } from '@fal-ai/client';
import { config } from './config';
import { getSignedUrl, uploadBuffer } from './storage';

export interface MotionControlInput {
  /** Persona still — Supabase Storage object path. */
  imagePath: string;
  /** Driver clip — Supabase Storage object path. Should be >=3s and >=360px wide. */
  driverVideoPath: string;
  /** Keep the driver's original audio (the new face lip-syncs to it). Default true. */
  keepOriginalSound?: boolean;
  /** Optional motion/style prompt. */
  prompt?: string;
  /**
   * Which subject the output is framed on. 'video' needs a full upper body in the DRIVER clip
   * (good for full-frame swaps); 'image' frames on the persona still and tolerates close-up
   * drivers (needed for tight PiP crops). Default 'video'; the engine auto-retries the other
   * mode if the upper-body check rejects the input.
   */
  characterOrientation?: 'video' | 'image';
}

export interface MotionControlResult {
  /** Swapped clip — Supabase Storage object path. */
  outputPath: string;
  /** Engine-side request id (for logging/recovery). */
  externalRequestId?: string;
}

export interface MotionEngine {
  readonly name: 'fal' | 'higgsfield';
  motionControl(input: MotionControlInput): Promise<MotionControlResult>;
}

// --- FAL Kling 2.6 (primary) ---

const FAL_MOTION_CONTROL_ENDPOINT = 'fal-ai/kling-video/v2.6/standard/motion-control';

let _falConfigured = false;
function ensureFalConfigured() {
  if (!_falConfigured) {
    fal.config({ credentials: config.falKey });
    _falConfigured = true;
  }
}

export const falKlingEngine: MotionEngine = {
  name: 'fal',
  async motionControl(input: MotionControlInput): Promise<MotionControlResult> {
    ensureFalConfigured();

    // Sign the inputs so FAL can fetch them.
    const [imageUrl, videoUrl] = await Promise.all([
      getSignedUrl(input.imagePath, 3600),
      getSignedUrl(input.driverVideoPath, 3600),
    ]);

    // One submit+poll at a given orientation.
    const runAt = async (orientation: 'video' | 'image') => {
      const { request_id } = await fal.queue.submit(FAL_MOTION_CONTROL_ENDPOINT, {
        input: {
          image_url: imageUrl,
          video_url: videoUrl,
          character_orientation: orientation,
          keep_original_sound: input.keepOriginalSound ?? true,
          ...(input.prompt ? { prompt: input.prompt } : {}),
        },
      });
      await fal.queue.subscribeToStatus(FAL_MOTION_CONTROL_ENDPOINT, { requestId: request_id, logs: false });
      const result = await fal.queue.result(FAL_MOTION_CONTROL_ENDPOINT, { requestId: request_id });
      return { result, request_id };
    };

    // 'video' orientation requires a full upper body in the driver; if that check rejects a
    // tight (PiP) crop, retry framing on the persona image instead ('image').
    const isUpperBodyReject = (e: unknown) => {
      const msg = (e instanceof Error ? e.message : String(e)) + ' ' + JSON.stringify((e as { body?: unknown })?.body ?? '');
      return /upper body|character_orientation|no complete/i.test(msg);
    };
    const primary = input.characterOrientation ?? 'video';
    const fallback = primary === 'video' ? 'image' : 'video';
    let request_id: string;
    let result: Awaited<ReturnType<typeof runAt>>['result'];
    try {
      ({ result, request_id } = await runAt(primary));
    } catch (e) {
      if (!isUpperBodyReject(e)) throw e;
      console.warn(`[motion-control] "${primary}" orientation rejected (upper-body check) — retrying with "${fallback}"`);
      ({ result, request_id } = await runAt(fallback));
    }

    const videoData =
      (result.data as { video?: { url?: string } })?.video ??
      (result as unknown as { video?: { url?: string } }).video;
    if (!videoData?.url) throw new Error('No video URL returned from FAL motion-control');

    // Download FAL output and store it in our bucket.
    const res = await fetch(videoData.url);
    if (!res.ok) throw new Error(`Failed to download motion-control output (${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const outputPath = await uploadBuffer(buffer, `motion-${request_id}.mp4`, {
      folder: 'gen/motion-control',
      contentType: 'video/mp4',
    });

    return { outputPath, externalRequestId: request_id };
  },
};

// --- Higgsfield (switchable placeholder) ---

export const higgsfieldEngine: MotionEngine = {
  name: 'higgsfield',
  async motionControl(): Promise<MotionControlResult> {
    throw new Error(
      'Higgsfield motion-control engine is not wired up yet. ' +
        'Set MOTION_ENGINE=fal to use the primary FAL Kling engine.',
    );
  },
};

// --- Selector ---

/** Returns the active engine per config.motionEngine (MOTION_ENGINE env). FAL is the default. */
export function getMotionEngine(): MotionEngine {
  return config.motionEngine === 'higgsfield' ? higgsfieldEngine : falKlingEngine;
}
