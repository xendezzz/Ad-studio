'use client';

/**
 * Persist project assets into their library. Hooks / app-demos / audios have server tables
 * (deduped server-side); a-rolls / b-rolls go to the local assets store. Only the reference
 * pipeline should call this (scaled rows are duplicates).
 */
import { assetsStore } from './assetsStore';
import { projectsStore } from './projectsStore';

const post = (url: string, body: object) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});

export function recordAsset(kind: string | undefined, name: string, path: string): Promise<unknown> {
  if (!kind || !path) return Promise.resolve();
  switch (kind) {
    case 'hook':
    case 'cc-hook':
      return post('/api/hooks', { name, videoPath: path });
    case 'app-demo':
      return post('/api/app-demos', { name, videoPath: path });
    case 'music':
      return post('/api/music', { name, audioPath: path });
    case 'cc-aroll':
      assetsStore.add('arolls', name, path);
      return Promise.resolve();
    case 'cc-broll':
      assetsStore.add('brolls', name, path);
      return Promise.resolve();
    case 'cc-pip':
      assetsStore.add('pip', name, path);
      return Promise.resolve();
    default:
      return Promise.resolve();
  }
}

interface RawNode {
  data?: { kind?: string; title?: string; params?: Record<string, string> };
}

/** Scan every saved project's graph and record its reference-pipeline clips into the libraries. */
export async function backfillFromProjects() {
  const jobs: Promise<unknown>[] = [];
  for (const p of projectsStore.list()) {
    const nodes = (p.graph?.nodes ?? []) as RawNode[];
    for (const n of nodes) {
      const d = n?.data;
      if (!d || d.params?.scaleGroup) continue; // reference pipeline only
      const path = d.params?.clip ?? d.params?.track;
      if (path) jobs.push(recordAsset(d.kind, d.title || d.kind || '', path));
    }
  }
  await Promise.all(jobs);
}
