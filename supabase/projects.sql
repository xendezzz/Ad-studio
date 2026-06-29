-- Ad-Studio: projects table. Paste into Supabase → SQL Editor → Run (idempotent).
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft',   -- draft | ready | scaling
  graph jsonb,                            -- the pipeline (nodes + edges)
  outputs jsonb default '[]'::jsonb,      -- [{ modelId, modelName, adPath, createdAt }]
  thumbnail text,                         -- storage path of a preview frame
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
