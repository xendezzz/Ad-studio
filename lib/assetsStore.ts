'use client';

/**
 * Local-first asset library for kinds that have no Supabase table yet (a-rolls, b-rolls).
 * Assets used in a project are recorded here so they show up in the Libraries panel.
 * Hooks / app-demos / audios are server-backed (their own tables) and don't use this.
 */
export interface StoredAsset {
  id: string;
  name: string;
  path: string; // Supabase Storage path (video)
  createdAt: string;
}

export type LocalAssetType = 'arolls' | 'brolls' | 'pip';

const KEY = 'adstudio-assets';
const EVENT = 'adstudio-assets-changed';

function readAll(): Record<string, StoredAsset[]> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}
function writeAll(v: Record<string, StoredAsset[]>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* ignore */
  }
}

export const assetsStore = {
  list(type: LocalAssetType): StoredAsset[] {
    return readAll()[type] ?? [];
  },
  /** Add an asset, deduped by storage path. Returns the stored item (or existing one). */
  add(type: LocalAssetType, name: string, path: string): StoredAsset | null {
    if (!path) return null;
    const all = readAll();
    const arr = all[type] ?? [];
    const dup = arr.find((a) => a.path === path);
    if (dup) return dup;
    const item: StoredAsset = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      name: name || type,
      path,
      createdAt: new Date().toISOString(),
    };
    all[type] = [item, ...arr];
    writeAll(all);
    return item;
  },
  remove(type: LocalAssetType, id: string) {
    const all = readAll();
    all[type] = (all[type] ?? []).filter((a) => a.id !== id);
    writeAll(all);
  },
  EVENT,
};
