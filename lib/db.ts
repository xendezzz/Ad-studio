/**
 * Ad-Studio data access — via the Supabase API (PostgREST), using the secret key.
 *
 * No direct Postgres connection / DB password needed. Rows come back snake_case from
 * PostgREST; we transform to/from camelCase so callers use the same shapes as the schema.
 */
import { supa } from './supabaseServer';

// Row shapes (camelCase) returned by the helpers below.
export interface Model {
  id: string;
  name: string;
  description: string | null;
  gender: string | null;
  imagePath: string | null;
  voiceProvider: string | null;
  voiceId: string | null;
  createdAt: string | null;
}
interface MediaAsset {
  id: string;
  name: string;
  videoPath: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  createdAt: string | null;
}
type Hook = MediaAsset;
type AppDemo = MediaAsset;
interface MusicTrack {
  id: string;
  name: string;
  audioPath: string;
  durationSec: number | null;
  source: string | null;
  createdAt: string | null;
}
interface ReferenceAd {
  id: string;
  name: string;
  videoPath: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  transcript: string | null;
  segments: unknown;
  createdAt: string | null;
}
export interface GenJob {
  id: string;
  kind: string;
  status: string;
  engine: string | null;
  modelId: string | null;
  referenceAdId: string | null;
  pipelineRunId: string | null;
  inputRefs: unknown;
  externalRequestId: string | null;
  outputPath: string | null;
  error: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
}
interface Ad {
  id: string;
  name: string;
  referenceAdId: string | null;
  modelId: string | null;
  outputPath: string | null;
  durationSec: number | null;
  status: string;
  createdAt: string | null;
}
export interface PipelineRun {
  id: string;
  name: string;
  status: string;
  referenceAdId: string | null;
  modelIds: unknown;
  config: unknown;
  createdAt: string | null;
  updatedAt: string | null;
}
export interface ProjectOutput {
  modelId: string;
  modelName: string;
  adPath: string;
  createdAt: string;
}
export interface Project {
  id: string;
  name: string;
  status: string;
  graph: unknown;
  outputs: ProjectOutput[] | unknown;
  thumbnail: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

// ---- camel <-> snake transforms ----
const toSnake = (s: string) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function camelRow<T>(row: Record<string, unknown> | null): T {
  if (!row) return row as T;
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v])) as T;
}
function snakeRow(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [toSnake(k), v]));
}

async function listTable<T>(table: string): Promise<T[]> {
  const { data, error } = await supa()
    .from(table)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`${table} list: ${error.message}`);
  return (data ?? []).map((r) => camelRow<T>(r));
}

async function insertRow<T>(table: string, v: Record<string, unknown>): Promise<T> {
  const { data, error } = await supa().from(table).insert(snakeRow(v)).select().single();
  if (error) throw new Error(`${table} insert: ${error.message}`);
  return camelRow<T>(data);
}

async function updateRow<T>(table: string, id: string, v: Record<string, unknown>): Promise<T> {
  const { data, error } = await supa()
    .from(table)
    .update(snakeRow(v))
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`${table} update: ${error.message}`);
  return camelRow<T>(data);
}

async function getRow<T>(table: string, id: string): Promise<T | null> {
  const { data, error } = await supa().from(table).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`${table} get: ${error.message}`);
  return data ? camelRow<T>(data) : null;
}

async function removeRow(table: string, id: string): Promise<void> {
  const { error } = await supa().from(table).delete().eq('id', id);
  if (error) throw new Error(`${table} delete: ${error.message}`);
}

export const Models = {
  list: () => listTable<Model>('models'),
  create: (v: Partial<Model>) => insertRow<Model>('models', v),
  get: (id: string) => getRow<Model>('models', id),
  update: (id: string, v: Partial<Model>) => updateRow<Model>('models', id, v),
  remove: (id: string) => removeRow('models', id),
};

export const Hooks = {
  list: () => listTable<Hook>('hooks'),
  create: (v: Partial<Hook>) => insertRow<Hook>('hooks', v),
  remove: (id: string) => removeRow('hooks', id),
};

export const AppDemos = {
  list: () => listTable<AppDemo>('app_demos'),
  create: (v: Partial<AppDemo>) => insertRow<AppDemo>('app_demos', v),
  remove: (id: string) => removeRow('app_demos', id),
};

export const Music = {
  list: () => listTable<MusicTrack>('music_tracks'),
  create: (v: Partial<MusicTrack>) => insertRow<MusicTrack>('music_tracks', v),
  remove: (id: string) => removeRow('music_tracks', id),
};

export const ReferenceAds = {
  list: () => listTable<ReferenceAd>('reference_ads'),
  create: (v: Partial<ReferenceAd>) => insertRow<ReferenceAd>('reference_ads', v),
  get: (id: string) => getRow<ReferenceAd>('reference_ads', id),
  update: (id: string, v: Partial<ReferenceAd>) => updateRow<ReferenceAd>('reference_ads', id, v),
};

export const GenJobs = {
  create: (v: Partial<GenJob>) => insertRow<GenJob>('gen_jobs', v),
  update: (id: string, v: Partial<GenJob>) =>
    updateRow<GenJob>('gen_jobs', id, { ...v, updatedAt: new Date().toISOString() }),
  byRun: async (runId: string): Promise<GenJob[]> => {
    const { data, error } = await supa().from('gen_jobs').select('*').eq('pipeline_run_id', runId);
    if (error) throw new Error(`gen_jobs byRun: ${error.message}`);
    return (data ?? []).map((r) => camelRow<GenJob>(r));
  },
};

export const Ads = {
  list: () => listTable<Ad>('ads'),
  create: (v: Partial<Ad>) => insertRow<Ad>('ads', v),
};

export const PipelineRuns = {
  create: (v: Partial<PipelineRun>) => insertRow<PipelineRun>('pipeline_runs', v),
  get: (id: string) => getRow<PipelineRun>('pipeline_runs', id),
  update: (id: string, v: Partial<PipelineRun>) =>
    updateRow<PipelineRun>('pipeline_runs', id, { ...v, updatedAt: new Date().toISOString() }),
};

export const Projects = {
  list: () => listTable<Project>('projects'),
  create: (v: Partial<Project>) => insertRow<Project>('projects', v),
  get: (id: string) => getRow<Project>('projects', id),
  update: (id: string, v: Partial<Project>) =>
    updateRow<Project>('projects', id, { ...v, updatedAt: new Date().toISOString() }),
  remove: (id: string) => removeRow('projects', id),
};
