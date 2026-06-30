'use client';

import { useEffect, useState } from 'react';
import { Plus, LayoutGrid, X, Search, Loader2, ChevronDown } from 'lucide-react';
import {
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  defsByCategory,
  NODE_DEFS,
  type PipelineNodeKind,
} from '@/lib/pipeline';
import { iconFor } from '@/components/studio/icons';
import { assetsStore, type StoredAsset } from '@/lib/assetsStore';

function hexToRgba(hex: string, a: number) {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
}

type NodeInit = { title?: string; params?: Record<string, string> };
type AddFn = (kind: PipelineNodeKind, init?: NodeInit) => void;
type Panel = 'add' | 'libraries' | null;

interface ModelRow { id: string; name: string; description: string | null; imagePath: string | null; voiceId: string | null }

// mirror the Models page: description = "<cat>" (library) or "gen:<cat>" (generated)
const MODEL_GROUP_ORDER = [
  'Study Girl', 'Tech Girl', 'Japanese', 'Spanish', 'Brazilian',
  'Twitter', 'Talking Head English', 'New Faceless', 'Old Faceless', 'Generated',
];
const isGenModel = (m: ModelRow) => (m.description || '').startsWith('gen:');
const catOfModel = (m: ModelRow) =>
  isGenModel(m) ? m.description!.slice(4) || 'Other' : m.description || 'Other';
interface MediaRow { id: string; name: string; videoPath: string }
interface MusicRow { id: string; name: string; audioPath: string }

function RailButton({ active, label, onClick, children }: { active?: boolean; label: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`grid h-9 w-9 place-items-center rounded-xl text-white/55 transition-all duration-150 hover:bg-white/10 hover:text-white/90 active:scale-95 ${active ? 'bg-white/10 text-white/90' : ''}`}
    >
      {children}
    </button>
  );
}

function LibrariesPanel({ onAdd, onClose }: { onAdd: AddFn; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [hooks, setHooks] = useState<MediaRow[]>([]);
  const [appDemos, setAppDemos] = useState<MediaRow[]>([]);
  const [music, setMusic] = useState<MusicRow[]>([]);
  // a-rolls / b-rolls / pip have no server table yet — sourced from the local assets store
  const [arolls, setArolls] = useState<StoredAsset[]>([]);
  const [brolls, setBrolls] = useState<StoredAsset[]>([]);
  const [pips, setPips] = useState<StoredAsset[]>([]);
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleSection = (k: string) => setCollapsed((c) => ({ ...c, [k]: !c[k] }));

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [m, h, a, mu] = await Promise.all([
          fetch('/api/models').then((r) => r.json()),
          fetch('/api/hooks').then((r) => r.json()),
          fetch('/api/app-demos').then((r) => r.json()),
          fetch('/api/music').then((r) => r.json()),
        ]);
        if (!active) return;
        setModels(Array.isArray(m) ? m : []);
        setHooks(Array.isArray(h) ? h : []);
        setAppDemos(Array.isArray(a) ? a : []);
        setMusic(Array.isArray(mu) ? mu : []);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // local-store assets (a-rolls / b-rolls) — refresh when a project saves a new one
  useEffect(() => {
    const load = () => { setArolls(assetsStore.list('arolls')); setBrolls(assetsStore.list('brolls')); setPips(assetsStore.list('pip')); };
    load();
    window.addEventListener(assetsStore.EVENT, load);
    return () => window.removeEventListener(assetsStore.EVENT, load);
  }, []);

  const filteredModels = q
    ? models.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()))
    : models;

  // group filtered models by category, ordered like the Models page
  const modelsByCat = new Map<string, ModelRow[]>();
  for (const m of filteredModels) {
    const c = catOfModel(m);
    if (!modelsByCat.has(c)) modelsByCat.set(c, []);
    modelsByCat.get(c)!.push(m);
  }
  const modelCats = [...modelsByCat.keys()].sort(
    (a, b) => (MODEL_GROUP_ORDER.indexOf(a) + 1 || 99) - (MODEL_GROUP_ORDER.indexOf(b) + 1 || 99),
  );

  return (
    <div className="studio-node pointer-events-auto flex max-h-[78vh] w-72 flex-col rounded-2xl border border-white/10 bg-[#15171c]/90 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Libraries</span>
        <button onClick={onClose} className="text-white/30 hover:text-white/70"><X className="h-3.5 w-3.5" /></button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-1 py-6 text-[12px] text-white/40">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading assets…
        </div>
      ) : (
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-0.5">
          {/* Models with search + thumbnails */}
          <div>
            <button onClick={() => toggleSection('Models')} className="mb-1 flex w-full items-center gap-1.5 px-1 text-left">
              <ChevronDown className={`h-3 w-3 shrink-0 text-white/30 transition-transform ${collapsed.Models ? '-rotate-90' : ''}`} />
              <span className="text-[10px] uppercase tracking-wider text-white/30">Models</span>
              <span className="ml-auto text-[10px] text-white/25">{models.length}</span>
            </button>
            {collapsed.Models ? null : models.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/8 px-2.5 py-2 text-[10px] text-white/25">Nothing here yet — add on the Models page.</div>
            ) : (
            <>
            <div className="mb-1.5 flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2">
              <Search className="h-3 w-3 text-white/30" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search models…"
                className="w-full bg-transparent py-1.5 text-[11px] text-white/80 outline-none placeholder:text-white/25"
              />
            </div>
            {filteredModels.length === 0 ? (
              <div className="px-1 py-2 text-[10px] text-white/25">No models match “{q}”.</div>
            ) : (
              <div className="space-y-2.5">
                {modelCats.map((cat) => {
                  const rows = modelsByCat.get(cat)!;
                  return (
                    <div key={cat}>
                      <div className="mb-1 flex items-center justify-between px-1">
                        <span className="text-[9px] uppercase tracking-wider text-white/35">{cat}</span>
                        <span className="text-[9px] text-white/20">{rows.length}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {rows.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => onAdd('model', { title: m.name, params: { persona: m.imagePath ?? '', voice: m.voiceId ?? 'Aria' } })}
                            title={m.name}
                            className="group/m overflow-hidden rounded-lg border border-white/8 bg-white/[0.02] transition-all hover:border-white/25"
                          >
                            {m.imagePath ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={`/api/serve/${m.imagePath}`} alt={m.name} className="aspect-square w-full object-cover" />
                            ) : (
                              <div className="aspect-square w-full bg-white/5" />
                            )}
                            <div className="truncate px-1 py-0.5 text-[9px] text-white/55">{m.name}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </>
            )}
          </div>

          <AssetList label="Hooks" kind="hook" rows={hooks.map((h) => ({ id: h.id, name: h.name, params: { clip: h.videoPath } }))} onAdd={onAdd} collapsed={collapsed.Hooks} onToggle={() => toggleSection('Hooks')} />
          <AssetList label="Audios" kind="music" rows={music.map((mu) => ({ id: mu.id, name: mu.name, params: { track: mu.audioPath } }))} onAdd={onAdd} collapsed={collapsed.Audios} onToggle={() => toggleSection('Audios')} />
          <AssetList label="A-rolls" kind="cc-aroll" rows={arolls.map((a) => ({ id: a.id, name: a.name, params: { clip: a.path } }))} onAdd={onAdd} collapsed={collapsed['A-rolls']} onToggle={() => toggleSection('A-rolls')} />
          <AssetList label="B-rolls" kind="cc-broll" rows={brolls.map((b) => ({ id: b.id, name: b.name, params: { clip: b.path } }))} onAdd={onAdd} collapsed={collapsed['B-rolls']} onToggle={() => toggleSection('B-rolls')} />
          <AssetList label="PiP" kind="cc-pip" rows={pips.map((p) => ({ id: p.id, name: p.name, params: { clip: p.path } }))} onAdd={onAdd} collapsed={collapsed.PiP} onToggle={() => toggleSection('PiP')} />
          <AssetList label="App demos" kind="app-demo" rows={appDemos.map((a) => ({ id: a.id, name: a.name, params: { clip: a.videoPath } }))} onAdd={onAdd} collapsed={collapsed['App demos']} onToggle={() => toggleSection('App demos')} />
        </div>
      )}
    </div>
  );
}

function AssetList({ label, kind, rows, onAdd, collapsed, onToggle }: { label: string; kind: PipelineNodeKind; rows: { id: string; name: string; params: Record<string, string> }[]; onAdd: AddFn; collapsed?: boolean; onToggle?: () => void }) {
  const def = NODE_DEFS[kind];
  const Icon = iconFor(def.icon);
  return (
    <div>
      <button onClick={onToggle} className="mb-1 flex w-full items-center gap-1.5 px-1 text-left">
        <ChevronDown className={`h-3 w-3 shrink-0 text-white/30 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        <Icon className="h-3 w-3" style={{ color: def.accent }} />
        <span className="text-[10px] uppercase tracking-wider text-white/30">{label}</span>
        <span className="ml-auto text-[10px] text-white/25">{rows.length}</span>
      </button>
      {collapsed ? null : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/8 px-2.5 py-2 text-[10px] text-white/25">Nothing here yet — add on the {label} page.</div>
      ) : (
      <div className="space-y-1">
        {rows.slice(0, 8).map((r) => (
            <button
              key={r.id}
              onClick={() => onAdd(kind, { title: r.name, params: r.params })}
              className="flex w-full items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-left transition-all hover:border-white/20 hover:bg-white/[0.06]"
            >
              <span className="truncate text-[11px] text-white/75">{r.name}</span>
              <Plus className="h-3 w-3 shrink-0 text-white/30" />
            </button>
          ))}
      </div>
      )}
    </div>
  );
}

export function LeftToolbar({ onAddNode }: { onAddNode: AddFn }) {
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));
  const add: AddFn = (kind, init) => { onAddNode(kind, init); setPanel(null); };

  return (
    <div className="pointer-events-none absolute left-4 top-16 z-20 flex items-start gap-3">
      <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-[#15171c]/70 p-2 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <button
          onClick={() => toggle('add')}
          title="Add node"
          className="grid h-10 w-10 place-items-center rounded-xl bg-white/90 text-black shadow-lg transition-all duration-150 hover:bg-white active:scale-95"
        >
          <Plus className={`h-5 w-5 transition-transform duration-200 ${panel === 'add' ? 'rotate-45' : ''}`} />
        </button>
        <div className="my-0.5 h-px w-6 bg-white/10" />
        <RailButton label="Libraries" active={panel === 'libraries'} onClick={() => toggle('libraries')}>
          <LayoutGrid className="h-[18px] w-[18px]" />
        </RailButton>
      </div>

      {panel === 'add' && (
        <div className="studio-node pointer-events-auto w-64 rounded-2xl border border-white/10 bg-[#15171c]/85 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Add node</span>
            <button onClick={() => setPanel(null)} className="text-white/30 hover:text-white/70"><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-0.5">
            {CATEGORY_ORDER.map((cat) => (
              <div key={cat}>
                <div className="mb-1 px-1 text-[10px] uppercase tracking-wider text-white/25">{CATEGORY_LABELS[cat]}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {defsByCategory(cat).map((def) => {
                    const Icon = iconFor(def.icon);
                    return (
                      <button
                        key={def.kind}
                        onClick={() => add(def.kind)}
                        className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1.5 text-left transition-all duration-150 hover:border-white/15 hover:bg-white/[0.06]"
                      >
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md" style={{ background: hexToRgba(def.accent, 0.16) }}>
                          <Icon className="h-3 w-3" style={{ color: def.accent }} />
                        </span>
                        <span className="truncate text-[11px] font-medium text-white/80">{def.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {panel === 'libraries' && <LibrariesPanel onAdd={add} onClose={() => setPanel(null)} />}
    </div>
  );
}
