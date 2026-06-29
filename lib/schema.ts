/**
 * Ad-Studio database schema (Drizzle ORM, Supabase Postgres).
 *
 * Tables map to the ad pipeline flowchart:
 *   asset libraries (models+voices, hooks, app_demos, music) ->
 *   reference_ads (ingest + detected segments) ->
 *   gen_jobs (motion-control / bg-removal / voice / compose) ->
 *   ads (final outputs) ; pipeline_runs orchestrate batches.
 *
 * Media files live in Supabase Storage; tables store the object PATH (key), not bytes.
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

/** Persona "models" — each tied to a voice. (Flowchart: Model library.) */
export const models = pgTable('models', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  gender: text('gender'), // optional: for gender-matched swaps
  imagePath: text('image_path'), // persona still in Storage
  voiceProvider: text('voice_provider').default('elevenlabs'), // 'elevenlabs' | 'higgsfield'
  voiceId: text('voice_id'), // tied voice (e.g. ElevenLabs voiceId)
  createdAt: timestamp('created_at').defaultNow(),
});

/** Talking-head opener clips. (Flowchart: Hook library.) */
export const hooks = pgTable('hooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  videoPath: text('video_path').notNull(),
  durationSec: real('duration_sec'),
  width: integer('width'),
  height: integer('height'),
  createdAt: timestamp('created_at').defaultNow(),
});

/** Screen-recording backgrounds. (Flowchart: App-demo library.) */
export const appDemos = pgTable('app_demos', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  videoPath: text('video_path').notNull(),
  durationSec: real('duration_sec'),
  width: integer('width'),
  height: integer('height'),
  createdAt: timestamp('created_at').defaultNow(),
});

/** Background music tracks. */
export const musicTracks = pgTable('music_tracks', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  audioPath: text('audio_path').notNull(),
  durationSec: real('duration_sec'),
  source: text('source'), // 'upload' | 'shazam' | 'trending' | ...
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * Reference ad ingested for replication. `segments` is the detected/divided clip map:
 * [{ kind: 'hook'|'pip'|'app_demo', startSec, endSec, box?: {x,y,w,h} }]
 */
export const referenceAds = pgTable('reference_ads', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  videoPath: text('video_path').notNull(),
  durationSec: real('duration_sec'),
  width: integer('width'),
  height: integer('height'),
  transcript: text('transcript'),
  segments: jsonb('segments'), // detected hook/pip/app-demo windows
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * A single generation step (motion-control, bg-removal, voice, compose, transition, ...).
 * `inputRefs` holds the input object paths/ids; `externalRequestId` is the FAL/Higgsfield job id.
 */
export const genJobs = pgTable(
  'gen_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(), // 'motion_control' | 'bg_removal' | 'voice' | 'compose' | 'transition' | 'export'
    status: text('status').notNull().default('queued'), // queued|processing|completed|failed
    engine: text('engine'), // 'fal' | 'higgsfield' (for motion_control)
    modelId: uuid('model_id').references(() => models.id, { onDelete: 'set null' }),
    referenceAdId: uuid('reference_ad_id').references(() => referenceAds.id, {
      onDelete: 'set null',
    }),
    pipelineRunId: uuid('pipeline_run_id'),
    inputRefs: jsonb('input_refs'),
    externalRequestId: text('external_request_id'),
    outputPath: text('output_path'),
    error: text('error'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    completedAt: timestamp('completed_at'),
  },
  (t) => [
    index('idx_gen_jobs_status').on(t.status),
    index('idx_gen_jobs_pipeline_run').on(t.pipelineRunId),
    index('idx_gen_jobs_external_request').on(t.externalRequestId),
  ],
);

/** Finished ad outputs. */
export const ads = pgTable('ads', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  referenceAdId: uuid('reference_ad_id').references(() => referenceAds.id, {
    onDelete: 'set null',
  }),
  modelId: uuid('model_id').references(() => models.id, { onDelete: 'set null' }),
  outputPath: text('output_path'),
  durationSec: real('duration_sec'),
  status: text('status').notNull().default('draft'), // draft|rendering|ready|failed
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * A batch run of the pipeline: one reference ad fanned out across selected models.
 * `config` stores the configurable pipeline (steps, transitions, post-effects).
 */
export const pipelineRuns = pgTable('pipeline_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  status: text('status').notNull().default('queued'),
  referenceAdId: uuid('reference_ad_id').references(() => referenceAds.id, {
    onDelete: 'set null',
  }),
  modelIds: jsonb('model_ids'), // array of model uuids
  config: jsonb('config'), // pipeline step config
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
