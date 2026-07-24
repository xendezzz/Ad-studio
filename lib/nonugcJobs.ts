/**
 * In-memory job store for Non-UGC renders. Local-first: works with Supabase
 * down (the project can be paused without breaking the page). Jobs don't
 * survive a dev-server restart — acceptable for a local studio; a rendered
 * file in public/nonugc/ does survive.
 */
import { randomUUID } from 'crypto';

export interface NonUgcJob {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  /** browser-servable URL (public/ path) */
  url?: string;
  error?: string;
  createdAt: number;
}

const jobs = new Map<string, NonUgcJob>();

export function createNonUgcJob(): NonUgcJob {
  const job: NonUgcJob = { id: randomUUID(), status: 'processing', createdAt: Date.now() };
  jobs.set(job.id, job);
  return job;
}

export function updateNonUgcJob(id: string, patch: Partial<NonUgcJob>): void {
  const job = jobs.get(id);
  if (job) Object.assign(job, patch);
}

export function getNonUgcJob(id: string): NonUgcJob | undefined {
  return jobs.get(id);
}
