'use client';

/**
 * Local-first project store (browser localStorage). A project holds its pipeline
 * graph + references to generated outputs (whose videos live in Supabase Storage).
 * No DB table required — works immediately and per-machine, which fits a local tool.
 */
export interface ProjectOutput {
  modelId: string;
  modelName: string;
  adPath: string; // Supabase Storage path
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  status: string; // draft | ready | scaling
  graph: { nodes: unknown[]; edges: unknown[] } | null;
  outputs: ProjectOutput[];
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
}

const KEY = 'adstudio-projects';

function readAll(): Project[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Project[]) : [];
  } catch {
    return [];
  }
}

function writeAll(projects: Project[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(projects));
  } catch {
    /* ignore quota */
  }
}

function uid() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const projectsStore = {
  list(): Project[] {
    return readAll().sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
  },
  get(id: string): Project | null {
    return readAll().find((p) => p.id === id) ?? null;
  },
  create(name = 'Untitled project'): Project {
    const now = new Date().toISOString();
    const project: Project = {
      id: uid(),
      name,
      status: 'draft',
      graph: null,
      outputs: [],
      thumbnail: null,
      createdAt: now,
      updatedAt: now,
    };
    writeAll([project, ...readAll()]);
    return project;
  },
  update(id: string, patch: Partial<Project>): Project | null {
    const all = readAll();
    const i = all.findIndex((p) => p.id === id);
    if (i === -1) return null;
    all[i] = { ...all[i], ...patch, updatedAt: new Date().toISOString() };
    writeAll(all);
    return all[i];
  },
  addOutput(id: string, output: ProjectOutput) {
    const p = this.get(id);
    if (!p) return;
    this.update(id, {
      outputs: [...p.outputs, output],
      thumbnail: p.thumbnail ?? output.adPath,
      status: 'ready',
    });
  },
  duplicate(id: string): Project | null {
    const p = this.get(id);
    if (!p) return null;
    const now = new Date().toISOString();
    const copy: Project = {
      ...p,
      id: uid(),
      name: `${p.name} copy`,
      createdAt: now,
      updatedAt: now,
    };
    writeAll([copy, ...readAll()]);
    return copy;
  },
  remove(id: string) {
    writeAll(readAll().filter((p) => p.id !== id));
  },
};
