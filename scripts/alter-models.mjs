// Alter N real-person model images into synthetic personas via FAL flux img2img.
// Run: node --env-file=.env scripts/alter-models.mjs [N]
import { createClient } from '@supabase/supabase-js';
import { fal } from '@fal-ai/client';
import fs from 'fs';

const N = parseInt(process.argv[2] || '5', 10);
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
fal.config({ credentials: process.env.FAL_KEY });
const bucket = process.env.SUPABASE_BUCKET || 'ad-assets';
fs.mkdirSync('/tmp/alter', { recursive: true });

const PROMPT =
  'photorealistic UGC selfie-style portrait of a different unique young person, ' +
  'natural skin texture, casual real-world setting, soft natural lighting, ' +
  'looking at camera, candid amateur phone photo, vertical 9:16 framing';

const { data: models } = await supa
  .from('models')
  .select('id,name,image_path,description')
  .not('image_path', 'is', null)
  .limit(N);

console.log(`Altering ${models.length} models...`);
const sign = async (p) => (await supa.storage.from(bucket).createSignedUrl(p, 3600)).data.signedUrl;
const dl = async (url, path) => fs.writeFileSync(path, Buffer.from(await (await fetch(url)).arrayBuffer()));

let i = 0;
for (const m of models) {
  i++;
  try {
    const srcUrl = await sign(m.image_path);
    await dl(srcUrl, `/tmp/alter/${i}_before.png`);
    const r = await fal.subscribe('fal-ai/flux/dev/image-to-image', {
      input: {
        image_url: srcUrl,
        prompt: PROMPT,
        strength: 0.72,
        num_inference_steps: 34,
        guidance_scale: 3.5,
        image_size: 'portrait_16_9',
      },
      logs: false,
    });
    const outUrl = r.data?.images?.[0]?.url;
    if (!outUrl) throw new Error('no image');
    await dl(outUrl, `/tmp/alter/${i}_after.png`);
    const buf = fs.readFileSync(`/tmp/alter/${i}_after.png`);
    const newPath = `models/synthetic/altered-${m.id}.png`;
    await supa.storage.from(bucket).upload(newPath, buf, { contentType: 'image/png', upsert: true });
    await supa.from('models').update({ image_path: newPath }).eq('id', m.id);
    console.log(`  [${i}] ${m.name}: ${m.image_path}  ->  ${newPath}`);
  } catch (e) {
    console.log(`  [${i}] ${m.name} FAILED: ${e.message}`);
  }
}
console.log('done. before/after in /tmp/alter/');
