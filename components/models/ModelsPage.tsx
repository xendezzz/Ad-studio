'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, Loader2, X, Upload, Sparkles, Search, MoreHorizontal, Pencil, Copy, Trash2, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import { IMAGE_MODELS, getImageModel, DEFAULT_IMAGE_MODEL } from '@/lib/imageModels';
import { categoriesStore } from '@/lib/categoriesStore';
import { StudioNav } from '@/components/StudioNav';

interface ModelRow {
  id: string;
  name: string;
  description: string | null; // group
  imagePath: string | null;
  gender?: string | null; // 'male' | 'female'
}

const GROUP_ORDER = [
  'Study Girl',
  'Tech Girl',
  'Japanese',
  'Spanish',
  'Brazilian',
  'Twitter',
  'Talking Head English',
  'New Faceless',
  'Old Faceless',
  'Generated',
];

function GenerateModal({
  onClose,
  onCreated,
  categories,
  onAddCategory,
  defaultGender = 'female',
}: {
  onClose: () => void;
  onCreated: () => void;
  categories: string[];
  onAddCategory: (name: string) => void;
  defaultGender?: 'female' | 'male';
}) {
  const [prompt, setPrompt] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'female' | 'male'>(defaultGender);
  const [group, setGroup] = useState(categories[0] ?? 'Generated');
  const [refFile, setRefFile] = useState<File | null>(null);
  const [modelId, setModelId] = useState(DEFAULT_IMAGE_MODEL);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [keys, setKeys] = useState<Record<string, boolean> | null>(null);
  const [result, setResult] = useState<ModelRow | null>(null);
  const [newCat, setNewCat] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/config-status').then((r) => r.json()).then(setKeys).catch(() => {});
  }, []);

  const sel = getImageModel(modelId);
  const keyOk = keys ? !!keys[sel.needs] : true;
  const costLabel = sel.costPerImage < 0.01 ? `~$${sel.costPerImage.toFixed(3)}` : `~$${sel.costPerImage.toFixed(2)}`;

  async function generate() {
    if (!prompt.trim() || !keyOk) return;
    setBusy(true);
    setErr(null);
    try {
      let res: Response;
      if (refFile && sel.supportsReference) {
        const fd = new FormData();
        fd.append('file', refFile);
        fd.append('prompt', prompt);
        fd.append('name', name);
        fd.append('group', group);
        fd.append('model', modelId);
        fd.append('gender', gender);
        res = await fetch('/api/models/generate', { method: 'POST', body: fd });
      } else {
        res = await fetch('/api/models/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, name, group, model: modelId, gender }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'generation failed');
      setResult(data as ModelRow);
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'generation failed');
    } finally {
      setBusy(false);
    }
  }

  async function discardResult() {
    if (result) await fetch(`/api/models/${result.id}`, { method: 'DELETE' });
    onCreated();
  }
  async function regenerate() {
    await discardResult();
    setResult(null);
    generate();
  }
  async function backToEdit() {
    await discardResult();
    setResult(null);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 backdrop-blur-sm">
      <div className="w-[460px] overflow-hidden rounded-2xl border border-white/10 bg-[#15171c]/95 shadow-[0_24px_70px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <span className="flex-1 text-[14px] font-semibold text-white/90">
            {result ? 'Review generated model' : 'Generate model'}
          </span>
          <button onClick={onClose} className="text-white/40 hover:text-white/80"><X className="h-4 w-4" /></button>
        </div>

        {result ? (
          // ---------- post-generation review ----------
          <div className="p-4">
            <div className="flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/serve/${result.imagePath}`} alt={result.name} className="h-44 w-auto rounded-xl border border-white/10" />
              <div className="flex-1 text-[12.5px] text-white/70">
                <div className="text-[13px] font-medium text-white/90">{result.name}</div>
                <div className="mt-1 text-white/45">{sel.label}</div>
                <div className="mt-0.5 text-white/45">Category: {group}</div>
                <p className="mt-3 text-[12px] text-white/55">Looks good, or generate another / tweak the prompt?</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={backToEdit} className="rounded-xl border border-white/10 px-3 py-2 text-[12px] text-white/70 hover:text-white/95">Edit prompt</button>
              <button onClick={regenerate} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-[12px] text-white/80 hover:text-white"><RefreshCw className="h-3.5 w-3.5" /> Regenerate</button>
              <button onClick={() => { onCreated(); onClose(); }} className="flex items-center gap-1.5 rounded-xl bg-white/90 px-4 py-2 text-[12px] font-semibold text-black hover:bg-white"><Check className="h-3.5 w-3.5" /> Keep</button>
            </div>
          </div>
        ) : (
          // ---------- generation form ----------
          <>
            <div className="space-y-3 p-4">
              {/* model picker */}
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">AI model</label>
                <select
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[12.5px] text-white/85 outline-none focus:border-white/30"
                >
                  {IMAGE_MODELS.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#15171c]">{m.label} — {m.provider}</option>
                  ))}
                </select>
                {keys && !keyOk && (
                  <p className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {sel.needs.toUpperCase()} API key not available in .env — add it to use this model.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">Prompt</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  placeholder="e.g. 25-year-old casual female creator, cozy bedroom, warm light"
                  className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[12.5px] text-white/85 outline-none placeholder:text-white/25 focus:border-white/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">Gender</label>
                <div className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
                  {(['female', 'male'] as const).map((g) => (
                    <button key={g} type="button" onClick={() => setGender(g)} className={`flex-1 rounded-md px-2 py-1.5 text-[12px] font-medium capitalize transition-colors ${gender === g ? 'bg-[var(--gold-soft)] text-[var(--gold-bright)]' : 'text-white/50 hover:text-white/80'}`}>{g}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="optional" className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[12.5px] text-white/85 outline-none placeholder:text-white/25 focus:border-white/30" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">Category</label>
                  <select
                    value={group}
                    onChange={(e) => { if (e.target.value === '__new') { setNewCat(' '); } else setGroup(e.target.value); }}
                    className="w-full appearance-none rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[12.5px] text-white/85 outline-none focus:border-white/30"
                  >
                    {categories.map((g) => (<option key={g} value={g} className="bg-[#15171c]">{g}</option>))}
                    <option value="__new" className="bg-[#15171c]">+ New category…</option>
                  </select>
                  {newCat !== '' && (
                    <input
                      autoFocus
                      value={newCat.trim() === '' ? '' : newCat}
                      onChange={(e) => setNewCat(e.target.value)}
                      onBlur={() => { const n = newCat.trim(); if (n) { onAddCategory(n); setGroup(n); } setNewCat(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { const n = newCat.trim(); if (n) { onAddCategory(n); setGroup(n); } setNewCat(''); } if (e.key === 'Escape') setNewCat(''); }}
                      placeholder="New category name"
                      className="mt-1.5 w-full rounded-lg border border-white/15 bg-white/[0.05] px-2.5 py-1.5 text-[12px] text-white outline-none"
                    />
                  )}
                </div>
              </div>
              {sel.supportsReference && (
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">Reference image (optional)</label>
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => setRefFile(e.target.files?.[0] ?? null)} />
                  <button onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-2.5 py-2 text-[11.5px] text-white/55 hover:border-white/30 hover:text-white/80">
                    <Upload className="h-3.5 w-3.5" /> {refFile ? refFile.name : 'Upload reference image'}
                  </button>
                </div>
              )}
              {err && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-2 text-[11.5px] text-red-200">{err}</p>}
            </div>
            <div className="flex items-center justify-between border-t border-white/8 px-4 py-3">
              <span className="text-[11.5px] text-white/45">Cost: <span className="text-white/70">{costLabel}</span> / image · {sel.label}</span>
              <div className="flex gap-2">
                <button onClick={onClose} className="rounded-xl border border-white/10 px-3.5 py-2 text-[12.5px] text-white/70 hover:text-white/95">Cancel</button>
                <button
                  onClick={generate}
                  disabled={busy || !prompt.trim() || !keyOk}
                  className="flex items-center gap-1.5 rounded-xl bg-white/90 px-4 py-2 text-[12.5px] font-semibold text-black hover:bg-white active:scale-95 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {busy ? 'Generating…' : `Generate · ${costLabel}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ModelsPage() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [q, setQ] = useState('');
  const [gender, setGender] = useState<'female' | 'male'>('female');
  const [searchCat, setSearchCat] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [customCats, setCustomCats] = useState<string[]>([]);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [confirmDelCat, setConfirmDelCat] = useState<string | null>(null);
  const addCategory = (name: string) => {
    categoriesStore.add(name);
    setCustomCats(categoriesStore.list());
  };
  async function deleteCategory(cat: string) {
    const inCat = models.filter((m) => catOf(m) === cat);
    // move any models in this category to "Generated" so nothing is lost
    setModels((ms) =>
      ms.map((m) => (catOf(m) === cat ? { ...m, description: isGen(m) ? 'gen:Generated' : 'Generated' } : m)),
    );
    categoriesStore.remove(cat);
    setCustomCats(categoriesStore.list());
    setConfirmDelCat(null);
    if (searchCat === cat) setSearchCat(null);
    await Promise.all(
      inCat.map((m) =>
        fetch(`/api/models/${m.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: isGen(m) ? 'gen:Generated' : 'Generated' }),
        }),
      ),
    );
  }
  const closeMenu = () => {
    setMenuFor(null);
    setConfirmDel(null);
  };

  function load() {
    fetch('/api/models')
      .then((r) => r.json())
      .then((d) => setModels(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
    setCustomCats(categoriesStore.list());
  }, []);

  async function remove(m: ModelRow) {
    closeMenu();
    setModels((ms) => ms.filter((x) => x.id !== m.id));
    await fetch(`/api/models/${m.id}`, { method: 'DELETE' });
  }
  async function duplicate(m: ModelRow) {
    setMenuFor(null);
    await fetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `${m.name} copy`, description: m.description, imagePath: m.imagePath }),
    });
    load();
  }
  function startRename(m: ModelRow) {
    setMenuFor(null);
    setEditingId(m.id);
    setEditName(m.name);
  }
  async function commitRename(id: string) {
    const name = editName.trim();
    setEditingId(null);
    if (!name) return;
    setModels((ms) => ms.map((x) => (x.id === id ? { ...x, name } : x)));
    await fetch(`/api/models/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }

  // description = "<category>" for library models, "gen:<category>" for generated.
  const isGen = (m: ModelRow) => (m.description || '').startsWith('gen:');
  const catOf = (m: ModelRow) =>
    isGen(m) ? m.description!.slice(4) || 'Other' : m.description || 'Other';

  // categories available everywhere = those present on models + user-created ones
  const allCats = [...new Set([...models.map(catOf), ...customCats])].sort(
    (a, b) => (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99),
  );
  // full list for selectors (dialog/search), defaults first
  const selectableCats = [...new Set([...GROUP_ORDER, ...allCats])];
  const genderOf = (m: ModelRow) => (m.gender === 'male' ? 'male' : 'female'); // untagged → female
  const inGender = models.filter((m) => genderOf(m) === gender);
  const searched = inGender.filter(
    (m) =>
      (!q || m.name.toLowerCase().includes(q.toLowerCase())) &&
      (!searchCat || catOf(m) === searchCat),
  );
  // group by category, split into Generated / Library subcategories
  const byCat = new Map<string, { generated: ModelRow[]; library: ModelRow[] }>();
  for (const m of searched) {
    const c = catOf(m);
    if (!byCat.has(c)) byCat.set(c, { generated: [], library: [] });
    (isGen(m) ? byCat.get(c)!.generated : byCat.get(c)!.library).push(m);
  }
  // include user-created categories even when they have no models yet (unless searching)
  const cats = [
    ...new Set([...byCat.keys(), ...(q || searchCat ? [] : customCats)]),
  ].sort((a, b) => (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99));

  return (
    <main
      className="min-h-screen w-full text-zinc-200"
      style={{ background: 'radial-gradient(130% 80% at 50% -10%, #1a1d24 0%, #0c0d11 55%, #08090c 100%)' }}
    >
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-5">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Ad-Studio" className="h-6 w-auto" />
            <span className="text-[15px] font-semibold tracking-tight text-white/90">Ad-Studio</span>
          </Link>
          <StudioNav />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative z-30">
            <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] pl-2.5 pr-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-white/30" />
              {searchCat && (
                <span className="flex shrink-0 items-center gap-1 rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] text-white/80">
                  {searchCat}
                  <button onClick={() => setSearchCat(null)} className="text-white/40 hover:text-white/80"><X className="h-3 w-3" /></button>
                </span>
              )}
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                placeholder={searchCat ? `in ${searchCat}…` : 'Search…'}
                className="w-36 bg-transparent py-2 text-[12.5px] text-white/85 outline-none placeholder:text-white/30"
              />
            </div>
            {searchOpen && (
              <div className="absolute right-0 top-full z-40 mt-1.5 max-h-72 w-56 overflow-y-auto rounded-xl border border-white/10 bg-[#1a1c22]/95 p-1 shadow-[0_16px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-white/35">Search in</div>
                <button onClick={() => { setSearchCat(null); setSearchOpen(false); }} className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] hover:bg-white/10 ${!searchCat ? 'text-white/90' : 'text-white/65'}`}>
                  All categories <span className="text-white/30">{models.length}</span>
                </button>
                {allCats.map((c) => (
                  <button key={c} onClick={() => { setSearchCat(c); setSearchOpen(false); }} className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] hover:bg-white/10 ${searchCat === c ? 'text-white/90' : 'text-white/65'}`}>
                    {c} <span className="text-white/30">{models.filter((m) => catOf(m) === c).length}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {newCatOpen ? (
            <input
              autoFocus
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onBlur={() => { const n = newCatName.trim(); if (n) { addCategory(n); setSearchCat(n); } setNewCatName(''); setNewCatOpen(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { const n = newCatName.trim(); if (n) { addCategory(n); setSearchCat(n); } setNewCatName(''); setNewCatOpen(false); } if (e.key === 'Escape') { setNewCatName(''); setNewCatOpen(false); } }}
              placeholder="New category name"
              className="w-44 rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-[12.5px] text-white outline-none placeholder:text-white/30"
            />
          ) : (
            <button
              onClick={() => setNewCatOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 text-[12.5px] font-medium text-white/70 transition-all hover:border-white/25 hover:text-white/95"
            >
              <Plus className="h-3.5 w-3.5" /> New category
            </button>
          )}
          <button
            onClick={() => setModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-white/90 px-3.5 py-2 text-[13px] font-semibold text-black shadow-lg transition-all hover:bg-white active:scale-95"
          >
            <Plus className="h-4 w-4" /> Generate model
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-8 pb-20">
        <div className="mb-5 mt-2 flex items-end justify-between">
          <div>
            <h1 className="text-[40px] leading-tight text-white">Models</h1>
            <p className="mt-1 text-[13px] text-white/45">{inGender.length} {gender} personas across {cats.length} categories.</p>
          </div>
          {/* Female / Male toggle */}
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {(['female', 'male'] as const).map((g) => (
              <button
                key={g}
                onClick={() => { setGender(g); setSearchCat(null); }}
                className={`rounded-lg px-4 py-1.5 text-[12.5px] font-medium capitalize transition-colors ${
                  gender === g ? 'bg-[var(--gold-soft)] text-[var(--gold-bright)] ring-1 ring-[var(--gold-line)]' : 'text-white/45 hover:text-white/80'
                }`}
              >
                {g} <span className="text-white/30">{models.filter((m) => (m.gender === 'male' ? 'male' : 'female') === g).length}</span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-20 text-white/40"><Loader2 className="h-5 w-5 animate-spin" /> Loading models…</div>
        ) : cats.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <Sparkles className="h-8 w-8 text-white/15" />
            <p className="text-[13px] text-white/40">No models found.</p>
          </div>
        ) : (
          cats.map((cat) => {
            const { generated, library } = byCat.get(cat) ?? { generated: [], library: [] };
            const sub = (label: string, accent: string, rows: ModelRow[]) =>
              rows.length === 0 ? null : (
                <div className="mb-3">
                  <div className="mb-2 flex items-center gap-1.5 px-0.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-white/45">{label}</span>
                    <span className="text-[10.5px] text-white/30">{rows.length}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
                    {rows.map((m) => (
                      <div key={m.id} className="group relative overflow-hidden rounded-xl border border-white/8 bg-[#15171c]/70 transition-all hover:border-white/25">
                        {m.imagePath ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/serve/${m.imagePath}`} alt={m.name} className="aspect-[3/4] w-full object-cover" />
                        ) : (
                          <div className="aspect-[3/4] w-full bg-white/5" />
                        )}
                        <button
                          onClick={() => (menuFor === m.id ? closeMenu() : (setMenuFor(m.id), setConfirmDel(null)))}
                          className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-lg bg-black/55 text-white/70 opacity-0 backdrop-blur-sm transition-all hover:text-white group-hover:opacity-100"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                        {menuFor === m.id && (
                          <div className="absolute right-1.5 top-9 z-20 w-32 rounded-lg border border-white/10 bg-[#1a1c22]/95 p-1 shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                            <button onClick={() => startRename(m)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] text-white/80 hover:bg-white/10"><Pencil className="h-3 w-3" /> Rename</button>
                            <button onClick={() => duplicate(m)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] text-white/80 hover:bg-white/10"><Copy className="h-3 w-3" /> Duplicate</button>
                            <div className="my-0.5 h-px bg-white/8" />
                            <button onClick={() => (confirmDel === m.id ? remove(m) : setConfirmDel(m.id))} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] text-red-300 hover:bg-red-500/15"><Trash2 className="h-3 w-3" /> {confirmDel === m.id ? 'Click to confirm' : 'Delete'}</button>
                          </div>
                        )}
                        {editingId === m.id ? (
                          <input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={() => commitRename(m.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(m.id); if (e.key === 'Escape') setEditingId(null); }}
                            className="m-1.5 w-[calc(100%-12px)] rounded-md border border-white/15 bg-white/[0.05] px-1.5 py-0.5 text-[10.5px] text-white outline-none"
                          />
                        ) : (
                          <div className="truncate px-2 py-1.5 text-[10.5px] text-white/60">{m.name}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            return (
              <section key={cat} className="group/cat mb-9">
                <div className="mb-3 flex items-center gap-2 border-b border-white/8 pb-2">
                  <h2 className="text-[16px] font-semibold text-white/90">{cat}</h2>
                  <span className="text-[11px] text-white/35">{generated.length + library.length}</span>
                  <span className="flex-1" />
                  {confirmDelCat === cat ? (
                    <span className="flex items-center gap-1.5 text-[11.5px]">
                      <span className="text-white/45">
                        {generated.length + library.length > 0
                          ? `Move ${generated.length + library.length} to Generated & delete?`
                          : 'Delete category?'}
                      </span>
                      <button onClick={() => deleteCategory(cat)} className="rounded-md bg-red-500/20 px-2 py-0.5 font-medium text-red-300 hover:bg-red-500/30">Delete</button>
                      <button onClick={() => setConfirmDelCat(null)} className="rounded-md px-2 py-0.5 text-white/50 hover:text-white/80">Cancel</button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDelCat(cat)}
                      title="Delete category"
                      className="grid h-7 w-7 place-items-center rounded-lg text-white/35 opacity-0 transition-all hover:bg-red-500/15 hover:text-red-300 group-hover/cat:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {sub('Generated', '#a78bfa', generated)}
                {sub('Library', '#52606e', library)}
                {generated.length + library.length === 0 && (
                  <button
                    onClick={() => setModal(true)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/12 bg-white/[0.015] py-5 text-[12px] text-white/35 hover:border-white/25 hover:text-white/60"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> No models yet — generate one in “{cat}”
                  </button>
                )}
              </section>
            );
          })
        )}
      </div>

      {menuFor && <div className="fixed inset-0 z-10" onClick={closeMenu} />}
      {searchOpen && <div className="fixed inset-0 z-20" onClick={() => setSearchOpen(false)} />}
      {modal && (
        <GenerateModal
          onClose={() => setModal(false)}
          onCreated={load}
          categories={selectableCats}
          onAddCategory={addCategory}
          defaultGender={gender}
        />
      )}
    </main>
  );
}
