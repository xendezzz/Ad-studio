// De-identify the 44 selected models (skip index 0, already done) via FAL Flux img2img.
// Each -> distinct synthetic person, tagged gen:<category>. Run: node --env-file=.env scripts/alter-selected.mjs
import { createClient } from '@supabase/supabase-js';
import { fal } from '@fal-ai/client';
import fs from 'fs';

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
fal.config({ credentials: process.env.FAL_KEY });
const bucket = process.env.SUPABASE_BUCKET || 'ad-assets';

const PROMPT =
  'a completely different, unique fictional person — new face and identity, not the same individual — ' +
  'photorealistic UGC selfie, natural skin texture, casual indoor setting, soft natural light, ' +
  'looking at camera, candid amateur phone photo, vertical 9:16';

const todo = JSON.parse(fs.readFileSync('/tmp/gen45.json', 'utf8')).slice(1); // skip the GPT-Image one
console.log(`Altering ${todo.length} models via FAL img2img...`);

async function processOne(m) {
  const { data } = await supa.from('models').select('image_path').eq('id', m.id).single();
  const url = (await supa.storage.from(bucket).createSignedUrl(data.image_path, 3600)).data.signedUrl;
  const r = await fal.subscribe('fal-ai/flux/dev/image-to-image', {
    input: { image_url: url, prompt: PROMPT, strength: 0.72, num_inference_steps: 34, guidance_scale: 3.5 },
    logs: false,
  });
  const out = r.data?.images?.[0]?.url;
  if (!out) throw new Error('no image');
  const buf = Buffer.from(await (await fetch(out)).arrayBuffer());
  const path = `models/synthetic/gi-${m.id}.png`;
  await supa.storage.from(bucket).upload(path, buf, { contentType: 'image/png', upsert: true });
  await supa.from('models').update({ image_path: path, description: `gen:${m.cat}` }).eq('id', m.id);
  return m.name;
}

let idx = 0, done = 0, failed = 0;
async function worker() {
  while (idx < todo.length) {
    const i = idx++;
    try {
      await processOne(todo[i]);
      done++;
      if (done % 5 === 0) console.log(`  ...${done}/${todo.length}`);
    } catch (e) {
      failed++;
      console.log(`  FAIL ${todo[i].name}: ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: 4 }, () => worker()));
console.log(`done. altered=${done} failed=${failed}`);
