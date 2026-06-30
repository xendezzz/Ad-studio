'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Search, Loader2 } from 'lucide-react';

export interface PickModel {
  id: string;
  name: string;
  imagePath: string | null;
  voiceId: string | null;
}

interface ModelRow extends PickModel {
  description: string | null;
}

// mirror the Models page / Libraries panel grouping
const GROUP_ORDER = [
  'Study Girl', 'Tech Girl', 'Japanese', 'Spanish', 'Brazilian',
  'Twitter', 'Talking Head English', 'New Faceless', 'Old Faceless', 'Generated',
];
const catOf = (m: ModelRow) => {
  const d = m.description || '';
  return d.startsWith('gen:') ? d.slice(4) || 'Other' : d || 'Other';
};

/** Pick a persona model for a Motion Control node. */
export function ModelPickerModal({
  onPick,
  onClose,
}: {
  onPick: (m: PickModel) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetch('/api/models').then((res) => res.json());
        if (active) setModels(Array.isArray(r) ? r : []);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const grouped = useMemo(() => {
    const filtered = q
      ? models.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()))
      : models;
    const map = new Map<string, ModelRow[]>();
    for (const m of filtered) {
      const c = catOf(m);
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(m);
    }
    const cats = [...map.keys()].sort(
      (a, b) => (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99),
    );
    return cats.map((c) => ({ cat: c, rows: map.get(c)! }));
  }, [models, q]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="studio-node flex max-h-[80vh] w-[560px] max-w-[92vw] flex-col rounded-2xl border border-white/10 bg-[#15171c]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.7)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-white/90">Pick a model</span>
          <button onClick={onClose} className="text-white/40 hover:text-white/80">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5">
          <Search className="h-3.5 w-3.5 text-white/30" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search models…"
            className="w-full bg-transparent py-2 text-[12px] text-white/80 outline-none placeholder:text-white/25"
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 px-1 py-10 text-[12px] text-white/40">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading models…
          </div>
        ) : models.length === 0 ? (
          <div className="px-1 py-10 text-center text-[12px] text-white/35">
            No models yet. Add them on the Models page.
          </div>
        ) : (
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-0.5">
            {grouped.map(({ cat, rows }) => (
              <div key={cat}>
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <span className="text-[10px] uppercase tracking-wider text-white/35">{cat}</span>
                  <span className="text-[10px] text-white/20">{rows.length}</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {rows.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => onPick(m)}
                      title={m.name}
                      className="group/m overflow-hidden rounded-xl border border-white/8 bg-white/[0.02] transition-all hover:border-white/30 hover:ring-1 hover:ring-white/20"
                    >
                      {m.imagePath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/serve/${m.imagePath}`} alt={m.name} className="aspect-square w-full object-cover" />
                      ) : (
                        <div className="aspect-square w-full bg-white/5" />
                      )}
                      <div className="truncate px-1 py-1 text-[10px] text-white/60">{m.name}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
