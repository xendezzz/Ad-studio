-- Ad-Studio schema. Paste into Supabase → SQL Editor → Run.
-- Safe to re-run (IF NOT EXISTS).

create extension if not exists "pgcrypto";

create table if not exists models (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  gender text,
  image_path text,
  voice_provider text default 'elevenlabs',
  voice_id text,
  created_at timestamptz default now()
);

create table if not exists hooks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  video_path text not null,
  duration_sec real,
  width integer,
  height integer,
  created_at timestamptz default now()
);

create table if not exists app_demos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  video_path text not null,
  duration_sec real,
  width integer,
  height integer,
  created_at timestamptz default now()
);

-- a-rolls / b-rolls (created when ready; until then the app stores them client-side)
create table if not exists arolls (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  video_path text not null,
  duration_sec real,
  width integer,
  height integer,
  created_at timestamptz default now()
);

create table if not exists brolls (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  video_path text not null,
  duration_sec real,
  width integer,
  height integer,
  created_at timestamptz default now()
);

create table if not exists music_tracks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  audio_path text not null,
  duration_sec real,
  source text,
  created_at timestamptz default now()
);

create table if not exists reference_ads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  video_path text not null,
  duration_sec real,
  width integer,
  height integer,
  transcript text,
  segments jsonb,
  created_at timestamptz default now()
);

create table if not exists gen_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  status text not null default 'queued',
  engine text,
  model_id uuid,
  reference_ad_id uuid,
  pipeline_run_id uuid,
  input_refs jsonb,
  external_request_id text,
  output_path text,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists ads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  reference_ad_id uuid,
  model_id uuid,
  output_path text,
  duration_sec real,
  status text not null default 'draft',
  created_at timestamptz default now()
);

create table if not exists pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'queued',
  reference_ad_id uuid,
  model_ids jsonb,
  config jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
