'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Search, Loader2, Check, Sparkles, Layers, ChevronDown } from 'lucide-react';

export interface ScaleModel { id: string; name: string; imagePath: string | null; description?: string | null }

// keep category order consistent with the Models page
const GROUP_ORDER = [
  'Study Girl', 'Tech Girl', 'Japanese Bandi', 'Spanish Bandi', 'Brazilian Bandi',
  'Twitter', 'Talking Head English', 'New Faceless', 'Old Faceless', 'Generated',
];
// description = "<category>" for library models, "gen:<category>" for generated
const catOf = (m: ScaleModel) => {
  const d = m.description || '';
  return (d.startsWith('gen:') ? d.slice(4) : d) || 'Other';
};
const orderOf = (c: string) => (GROUP_ORDER.indexOf(c) + 1 || 99);

/**
 * Pick models to scale across — grouped by category (like the Models page), with
 * per-category and select-all toggles. On confirm, hands the selection to the canvas,
 * which duplicates the whole pipeline (one stacked row per model).
 */
export function ScalePanel({
  onScale,
  onClose,
  usedModels,
  perPipelineUSD,
}: {
  onScale: (models: ScaleModel[]) => void;
  onClose: () => void;
  usedModels?: Set<string>; // model names already used in existing scaled rows
  perPipelineUSD?: number; // est. $ to scale one model (frames + swaps)
}) {
  const [models, setModels] = useState<ScaleModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Record<string, ScaleModel>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json())
      .then((d) => setModels(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = q ? models.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())) : models;

  // group filtered models by category, ordered like the Models page
  const groups = useMemo(() => {
    const map = new Map<string, ScaleModel[]>();
    for (const m of filtered) {
      const c = catOf(m);
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(m);
    }
    return [...map.entries()].sort((a, b) => orderOf(a[0]) - orderOf(b[0]));
  }, [filtered]);

  const selectedList = Object.values(selected);
  const toggle = (m: ScaleModel) =>
    setSelected((s) => {
      const next = { ...s };
      if (next[m.id]) delete next[m.id];
      else next[m.id] = m;
      return next;
    });
  const setMany = (list: ScaleModel[], on: boolean) =>
    setSelected((s) => {
      const next = { ...s };
      for (const m of list) {
        if (on) next[m.id] = m;
        else delete next[m.id];
      }
      return next;
    });

  const allOn = filtered.length > 0 && filtered.every((m) => selected[m.id]);

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-black/50 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="flex max-h-[82vh] w-[660px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#15171c]/95 shadow-[0_24px_70px_rgba(0,0,0,0.6)] backdrop-blur-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <span className="flex-1 text-[14px] font-semibold text-white/90">Scale across models</span>
          <button onClick={onClose} className="text-white/40 hover:text-white/80"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex items-center gap-2 border-b border-white/8 px-4 py-2.5">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5">
            <Search className="h-3.5 w-3.5 text-white/30" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models…" className="w-full bg-transparent py-2 text-[12px] text-white/85 outline-none placeholder:text-white/30" />
          </div>
          <button
            onClick={() => setMany(filtered, !allOn)}
            disabled={!filtered.length}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors disabled:opacity-40 ${allOn ? 'border-violet-400/40 bg-violet-400/10 text-violet-200' : 'border-white/10 bg-white/[0.03] text-white/70 hover:text-white/95'}`}
          >
            <Check className="h-3.5 w-3.5" /> {allOn ? 'Clear all' : 'Select all'}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center gap-2 px-1 py-8 text-white/40"><Loader2 className="h-4 w-4 animate-spin" /> Loading models…</div>
          ) : !groups.length ? (
            <div className="px-1 py-8 text-[12px] text-white/40">No models found.</div>
          ) : (
            groups.map(([cat, list]) => {
              const catAllOn = list.every((m) => selected[m.id]);
              const catSomeOn = !catAllOn && list.some((m) => selected[m.id]);
              const isCollapsed = collapsed[cat];
              return (
                <div key={cat} className="mb-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <button onClick={() => setCollapsed((c) => ({ ...c, [cat]: !c[cat] }))} className="text-white/30 hover:text-white/70">
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                    </button>
                    <button
                      onClick={() => setMany(list, !catAllOn)}
                      className={`grid h-4 w-4 place-items-center rounded border transition-colors ${catAllOn ? 'border-violet-400 bg-violet-500 text-white' : catSomeOn ? 'border-violet-400/60 bg-violet-500/30' : 'border-white/20 hover:border-white/40'}`}
                    >
                      {catAllOn && <Check className="h-2.5 w-2.5" />}
                      {catSomeOn && <span className="h-0.5 w-2 rounded bg-violet-300" />}
                    </button>
                    <button onClick={() => setMany(list, !catAllOn)} className="text-[12px] font-semibold text-white/80 hover:text-white">
                      {cat}
                    </button>
                    <span className="text-[11px] text-white/35">{list.filter((m) => selected[m.id]).length}/{list.length}</span>
                  </div>
                  {!isCollapsed && (
                    <div className="grid grid-cols-7 gap-2 pl-6">
                      {list.map((m) => {
                        const on = !!selected[m.id];
                        const used = usedModels?.has(m.name);
                        return (
                          <button key={m.id} onClick={() => toggle(m)} title={used ? `${m.name} — already scaled` : m.name} className={`relative overflow-hidden rounded-lg border transition-all ${on ? 'border-violet-400 ring-2 ring-violet-400/40' : used ? 'border-emerald-400/40' : 'border-white/8 hover:border-white/25'}`}>
                            {m.imagePath ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={`/api/serve/${m.imagePath}`} alt={m.name} className={`aspect-square w-full object-cover ${used && !on ? 'opacity-55' : ''}`} />
                            ) : (
                              <div className="aspect-square w-full bg-white/5" />
                            )}
                            {used && (
                              <span className="absolute inset-x-0 bottom-0 bg-emerald-500/80 py-0.5 text-center text-[8px] font-semibold uppercase tracking-wider text-white">Used</span>
                            )}
                            {on && <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-violet-500 text-white"><Check className="h-2.5 w-2.5" /></span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/8 px-4 py-3">
          <span className="text-[12px] text-white/45">
            {selectedList.length} selected
            {usedModels && usedModels.size > 0 && (
              <span className="ml-2 text-emerald-300/70">· {usedModels.size} already scaled</span>
            )}
            {perPipelineUSD != null && perPipelineUSD > 0 && selectedList.length > 0 && (
              <span className="ml-2 text-amber-300/80">· ~${(perPipelineUSD * selectedList.length).toFixed(2)}</span>
            )}
          </span>
          <button
            onClick={() => { if (selectedList.length) { onScale(selectedList); onClose(); } }}
            disabled={!selectedList.length}
            className="flex items-center gap-1.5 rounded-xl bg-white/90 px-4 py-2 text-[13px] font-semibold text-black transition-all hover:bg-white active:scale-95 disabled:opacity-40"
          >
            <Layers className="h-3.5 w-3.5" />
            Build {selectedList.length} {selectedList.length === 1 ? 'pipeline' : 'pipelines'}
          </button>
        </div>
      </div>
    </div>
  );
}
