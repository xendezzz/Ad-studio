// Validates the Supabase secret key and ensures the storage bucket exists.
// Run: node --env-file=.env scripts/setup-supabase.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_BUCKET || 'ad-assets';

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supa = createClient(url, key, { auth: { persistSession: false } });

const { data: buckets, error: listErr } = await supa.storage.listBuckets();
if (listErr) {
  console.error('Auth/connection FAILED:', listErr.message);
  process.exit(1);
}
console.log('Connected. Existing buckets:', buckets.map((b) => b.name).join(', ') || '(none)');

if (!buckets.find((b) => b.name === bucket)) {
  const { error: createErr } = await supa.storage.createBucket(bucket, { public: false });
  if (createErr) {
    console.error(`Failed to create bucket "${bucket}":`, createErr.message);
    process.exit(1);
  }
  console.log(`Created private bucket "${bucket}".`);
} else {
  console.log(`Bucket "${bucket}" already exists.`);
}

// Quick check: do the tables exist yet?
const { error: tblErr } = await supa.from('models').select('id').limit(1);
if (tblErr) {
  console.log(`\nTables not created yet (${tblErr.message}).`);
  console.log('→ Paste supabase/schema.sql into Supabase SQL Editor and run it.');
} else {
  console.log('\nTables present ✓');
}
