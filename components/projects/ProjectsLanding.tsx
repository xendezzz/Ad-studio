'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, Layers, Trash2, Clock, Sparkles, MoreHorizontal, Pencil, Copy } from 'lucide-react';
import { projectsStore, type Project } from '@/lib/projectsStore';
import { StudioNav } from '@/components/StudioNav';

type ProjectRow = Project;

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function ProjectsLanding() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  function refresh() {
    setProjects(projectsStore.list());
  }
  useEffect(() => {
    refresh();
    setLoading(false);
  }, []);

  function newProject() {
    setCreating(true);
    const p = projectsStore.create('Untitled project');
    router.push(`/project/${p.id}`);
  }

  function remove(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setMenuFor(null);
    projectsStore.remove(id);
    setProjects((ps) => ps.filter((p) => p.id !== id));
  }

  function duplicate(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setMenuFor(null);
    projectsStore.duplicate(id);
    refresh();
  }

  function startRename(p: ProjectRow, e: React.MouseEvent) {
    e.stopPropagation();
    setMenuFor(null);
    setEditingId(p.id);
    setEditName(p.name);
    setTimeout(() => editRef.current?.select(), 0);
  }
  function commitRename(id: string) {
    const name = editName.trim();
    if (name) projectsStore.update(id, { name });
    setEditingId(null);
    refresh();
  }

  return (
    <main
      className="min-h-screen w-full text-zinc-200"
      style={{ background: 'radial-gradient(130% 80% at 50% -10%, #1f1f1f 0%, #141414 55%, #101010 100%)' }}
    >
      {/* header */}
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Ad-Studio" className="h-6 w-auto" />
            <span className="text-[15px] font-semibold tracking-tight text-white/90">Ad-Studio</span>
          </div>
          <StudioNav />
        </div>
        <button
          onClick={newProject}
          disabled={creating}
          className="flex items-center gap-1.5 rounded-xl bg-white/90 px-3.5 py-2 text-[13px] font-semibold text-black shadow-lg transition-all duration-150 hover:bg-white active:scale-95 disabled:opacity-70"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          New Project
        </button>
      </header>

      <div className="mx-auto max-w-6xl px-8 pb-20">
        <div className="mb-6 mt-4">
          <h1 className="text-[40px] leading-tight text-white">Projects</h1>
          <p className="mt-0.5 text-[13px] text-white/45">
            Clone an ad, swap the model, then scale it across many models.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-20 text-white/40">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading projects…
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {/* New project card */}
            <button
              onClick={newProject}
              disabled={creating}
              className="group flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] transition-all duration-200 hover:border-white/30 hover:bg-white/[0.05]"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/5 text-white/60 transition-colors group-hover:bg-white/10 group-hover:text-white/90">
                <Plus className="h-5 w-5" />
              </span>
              <span className="text-[11.5px] font-medium text-white/55 group-hover:text-white/80">New Project</span>
            </button>

            {projects.map((p) => {
              const count = Array.isArray(p.outputs) ? p.outputs.length : 0;
              const steps = Array.isArray(p.graph?.nodes) ? p.graph!.nodes.length : 0;
              const previewPath = p.thumbnail ?? p.outputs?.[0]?.adPath ?? null;
              return (
                <div
                  key={p.id}
                  onClick={() => router.push(`/project/${p.id}`)}
                  className={`group relative flex aspect-[3/4] cursor-pointer flex-col overflow-hidden rounded-xl border border-white/8 bg-[#191919]/80 shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 ${menuFor === p.id ? 'z-30' : ''}`}
                >
                  {/* preview */}
                  <div className="relative flex-1 overflow-hidden bg-black/40">
                    {previewPath ? (
                      <video
                        src={`/api/serve/${previewPath}`}
                        muted
                        playsInline
                        loop
                        preload="metadata"
                        onMouseEnter={(e) => { e.currentTarget.play().catch(() => {}); }}
                        onMouseLeave={(e) => { const v = e.currentTarget; v.pause(); v.currentTime = 0; }}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        className="grid h-full w-full place-items-center bg-gradient-to-br from-white/[0.05] to-transparent"
                        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)', backgroundSize: '14px 14px' }}
                      >
                        <div className="flex flex-col items-center gap-1.5 text-white/30">
                          <Sparkles className="h-6 w-6" />
                          <span className="text-[10.5px] font-medium">{steps > 0 ? `${steps} ${steps === 1 ? 'step' : 'steps'}` : 'Empty pipeline'}</span>
                        </div>
                      </div>
                    )}

                    {/* status badge */}
                    <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide text-white/75 backdrop-blur-sm">
                      {count > 0 ? `${count} ${count === 1 ? 'ad' : 'ads'}` : 'Draft'}
                    </span>

                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === p.id ? null : p.id); }}
                      className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-lg bg-black/50 text-white/60 opacity-0 backdrop-blur-sm transition-all hover:text-white group-hover:opacity-100"
                      title="More"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                    {menuFor === p.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-1.5 top-9 z-20 w-32 rounded-xl border border-white/10 bg-[#1e1e1e]/95 p-1 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl"
                      >
                        <button onClick={(e) => startRename(p, e)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] text-white/80 hover:bg-white/10">
                          <Pencil className="h-3 w-3" /> Rename
                        </button>
                        <button onClick={(e) => duplicate(p.id, e)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] text-white/80 hover:bg-white/10">
                          <Copy className="h-3 w-3" /> Duplicate
                        </button>
                        <div className="my-0.5 h-px bg-white/8" />
                        <button onClick={(e) => remove(p.id, e)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] text-red-300 hover:bg-red-500/15">
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                  {/* meta */}
                  <div className="px-2.5 py-2">
                    {editingId === p.id ? (
                      <input
                        ref={editRef}
                        value={editName}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => commitRename(p.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitRename(p.id); if (e.key === 'Escape') setEditingId(null); }}
                        className="w-full rounded-md border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[12px] font-medium text-white outline-none"
                      />
                    ) : (
                      <div className="truncate text-[12px] font-medium text-white/90">{p.name}</div>
                    )}
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-white/40">
                      <span className="flex items-center gap-1">
                        <Layers className="h-2.5 w-2.5" />
                        {steps}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {timeAgo(p.updatedAt)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {menuFor && <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />}
    </main>
  );
}
