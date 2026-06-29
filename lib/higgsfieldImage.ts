/**
 * Higgsfield image generation ("Soul" / image gen 2). Used by the Generate-model modal as an
 * alternative to the FAL image models.
 *
 * Higgsfield's platform API authenticates with hf-api-key + hf-secret and runs async job-sets
 * (create → poll). Set HIGGSFIELD_API_KEY and HIGGSFIELD_SECRET in .env. The base URL / soul
 * endpoint here follow the platform.higgsfield.ai API; adjust if your account uses a different path.
 */
import { config } from './config';

const BASE = process.env.HIGGSFIELD_API_BASE || 'https://platform.higgsfield.ai';

interface JobResult {
  status?: string;
  results?: { raw?: { url?: string }; min?: { url?: string } };
}

/** Generate one image from a prompt via Higgsfield Soul. Returns the image bytes. */
export async function generateHiggsfieldImage(prompt: string): Promise<Buffer> {
  const key = config.higgsfieldApiKey;
  const secret = config.higgsfieldSecret;
  if (!key) throw new Error('HIGGSFIELD_API_KEY is not set');
  if (!secret) throw new Error('HIGGSFIELD_SECRET is not set (Higgsfield needs key + secret)');

  const headers = { 'hf-api-key': key, 'hf-secret': secret, 'Content-Type': 'application/json' };

  // 1. create the generation job-set (Soul text-to-image)
  const create = await fetch(`${BASE}/v1/text2image/soul`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ params: { prompt, width_and_height: '1536x1024', batch_size: 1, enhance_prompt: true } }),
  });
  if (!create.ok) throw new Error(`Higgsfield create failed (${create.status}): ${await create.text().catch(() => '')}`);
  const created = (await create.json()) as { id?: string; job_set_id?: string };
  const id = created.id || created.job_set_id;
  if (!id) throw new Error('Higgsfield did not return a job id');

  // 2. poll the job-set until a result image is ready
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const poll = await fetch(`${BASE}/v1/job-sets/${id}`, { headers });
    if (!poll.ok) continue;
    const data = (await poll.json()) as { jobs?: JobResult[]; status?: string };
    const job = data.jobs?.[0];
    const url = job?.results?.raw?.url || job?.results?.min?.url;
    if (url) {
      const img = await fetch(url);
      if (!img.ok) throw new Error(`Failed to download Higgsfield image (${img.status})`);
      return Buffer.from(await img.arrayBuffer());
    }
    if (job?.status === 'failed' || data.status === 'failed') throw new Error('Higgsfield generation failed');
  }
  throw new Error('Higgsfield generation timed out');
}
