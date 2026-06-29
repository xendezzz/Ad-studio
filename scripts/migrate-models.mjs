// Migrate ai-ugc models (+ primary image) into Ad-Studio Supabase.
// Run: AIUGC_DB_URL="postgres://..." node --env-file=.env scripts/migrate-models.mjs
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

const AIUGC = process.env.AIUGC_DB_URL;
if (!AIUGC) { console.error('Set AIUGC_DB_URL'); process.exit(1); }

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const bucket = process.env.SUPABASE_BUCKET || 'ad-assets';
const sql = postgres(AIUGC, { ssl: 'require', max: 1 });

const rows = await sql`
  select m.id, m.name, m.description, mi.gcs_url, mi.filename
  from models m
  join model_images mi on mi.model_id = m.id and mi.is_primary = true
  order by m.created_at`;
console.log(`Found ${rows.length} models with a primary image.`);

// idempotency: skip names already present
const { data: existing } = await supa.from('models').select('name');
const have = new Set((existing ?? []).map((r) => r.name));

let done = 0, skipped = 0, failed = 0;
const POOL = 8;
async function worker(item) {
  if (have.has(item.name)) { skipped++; return; }
  try {
    const res = await fetch(item.gcs_url);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = (item.filename?.split('.').pop() || 'jpg').toLowerCase();
    const ct = ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg';
    const objectPath = `models/aiugc-${item.id}.${ext}`;
    const up = await supa.storage.from(bucket).upload(objectPath, buf, { contentType: ct, upsert: true });
    if (up.error) throw new Error(`upload ${up.error.message}`);
    const ins = await supa.from('models').insert({
      name: item.name,
      description: item.description ?? null,
      image_path: objectPath,
      voice_provider: 'elevenlabs',
    });
    if (ins.error) throw new Error(`insert ${ins.error.message}`);
    done++;
    if (done % 25 === 0) console.log(`  ...${done} migrated`);
  } catch (e) {
    failed++;
    if (failed <= 8) console.log(`  FAIL ${item.name}: ${e.message}`);
  }
}

// simple concurrency pool
let idx = 0;
async function run() {
  const runners = Array.from({ length: POOL }, async () => {
    while (idx < rows.length) { const i = idx++; await worker(rows[i]); }
  });
  await Promise.all(runners);
}
await run();
await sql.end();
console.log(`\nDONE. migrated=${done} skipped(existing)=${skipped} failed=${failed}`);
