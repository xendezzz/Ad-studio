'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Music as MusicIcon, Plus } from 'lucide-react';
import { StudioNav } from '@/components/StudioNav';
import { assetsStore } from '@/lib/assetsStore';
import { backfillFromProjects, recordAsset } from '@/lib/libraryAssets';

interface Clip { id: string; name: string; path: string; audio?: boolean }

// section → node-kind recordAsset understands + the upload folder
const SECTIONS = [
  { label: 'Hooks', blurb: 'Talking-head openers', kind: 'hook', folder: 'hooks' },
  { label: 'A-rolls', blurb: 'Talking-head body clips', kind: 'cc-aroll', folder: 'arolls' },
  { label: 'B-rolls', blurb: 'Supplementary cutaways', kind: 'cc-broll', folder: 'brolls' },
  { label: 'PiP', blurb: 'Creator-over-app-demo clips', kind: 'cc-pip', folder: 'pip' },
  { label: 'App demos', blurb: 'Screen recordings', kind: 'app-demo', folder: 'app-demos' },
  { label: 'Audios', blurb: 'Music beds & VO', kind: 'music', folder: 'audios', audio: true },
] as const;

function VideoCard({ clip }: { clip: Clip }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/8 bg-black/30">
      <video src={`/api/serve/${clip.path}`} muted preload="metadata" className="aspect-[9/16] w-full bg-black/40 object-cover" />
      <div className="truncate px-2 py-1.5 text-[11px] text-white/70">{clip.name}</div>
    </div>
  );
}

function AudioCard({ clip }: { clip: Clip }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/8 bg-white/[0.02] p-2.5">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-amber-400/15 text-amber-300"><MusicIcon className="h-3.5 w-3.5" /></span>
        <span className="truncate text-[11.5px] text-white/75">{clip.name}</span>
      </div>
      <audio src={`/api/serve/${clip.path}`} controls preload="none" className="h-7 w-full" />
    </div>
  );
}

function Section({ label, blurb, clips, audio, busy, onAdd }: { label: string; blurb: string; clips: Clip[]; audio?: boolean; busy?: boolean; onAdd: () => void }) {
  return (
    <section className="mb-9">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[16px] font-semibold tracking-tight text-white/90">{label}</h2>
        <span className="text-[12px] text-white/30">{clips.length}</span>
        <span className="ml-1 text-[12px] text-white/35">{blurb}</span>
        <button
          onClick={onAdd}
          disabled={busy}
          className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11.5px] font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white/95 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
        </button>
      </div>
      {clips.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.015] px-4 py-8 text-center text-[12px] text-white/30">Nothing here yet — click Add to upload.</div>
      ) : audio ? (
        <div className="grid grid-cols-3 gap-2.5">{clips.map((c) => <AudioCard key={c.id} clip={c} />)}</div>
      ) : (
        <div className="grid grid-cols-6 gap-3">{clips.map((c) => <VideoCard key={c.id} clip={c} />)}</div>
      )}
    </section>
  );
}

export function ClipsPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [server, setServer] = useState<{ hook: Clip[]; 'app-demo': Clip[]; music: Clip[] }>({ hook: [], 'app-demo': [], music: [] });
  const [local, setLocal] = useState<{ 'cc-aroll': Clip[]; 'cc-broll': Clip[]; 'cc-pip': Clip[] }>({ 'cc-aroll': [], 'cc-broll': [], 'cc-pip': [] });
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<{ kind: string; folder: string } | null>(null);

  const loadLocal = () => setLocal({
    'cc-aroll': assetsStore.list('arolls').map((a) => ({ id: a.id, name: a.name, path: a.path })),
    'cc-broll': assetsStore.list('brolls').map((b) => ({ id: b.id, name: b.name, path: b.path })),
    'cc-pip': assetsStore.list('pip').map((p) => ({ id: p.id, name: p.name, path: p.path })),
  });

  const loadServer = async () => {
    const [h, a, m] = await Promise.all([
      fetch('/api/hooks').then((r) => r.json()),
      fetch('/api/app-demos').then((r) => r.json()),
      fetch('/api/music').then((r) => r.json()),
    ]);
    setServer({
      hook: (Array.isArray(h) ? h : []).map((x) => ({ id: x.id, name: x.name, path: x.videoPath })),
      'app-demo': (Array.isArray(a) ? a : []).map((x) => ({ id: x.id, name: x.name, path: x.videoPath })),
      music: (Array.isArray(m) ? m : []).map((x) => ({ id: x.id, name: x.name, path: x.audioPath, audio: true })),
    });
  };

  useEffect(() => {
    let active = true;
    (async () => {
      await backfillFromProjects(); // pull clips from existing projects into the libraries
      if (!active) return;
      try { await loadServer(); loadLocal(); } finally { if (active) setLoading(false); }
    })();
    window.addEventListener(assetsStore.EVENT, loadLocal);
    return () => { active = false; window.removeEventListener(assetsStore.EVENT, loadLocal); };
  }, []);

  const triggerAdd = (kind: string, folder: string) => { pending.current = { kind, folder }; fileRef.current?.click(); };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const meta = pending.current;
    e.target.value = '';
    if (!file || !meta) return;
    setBusy(meta.kind);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', meta.folder);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.path) {
        await recordAsset(meta.kind, file.name.replace(/\.[^.]+$/, ''), data.path);
        await loadServer();
        loadLocal();
      }
    } finally {
      setBusy(null);
    }
  };

  const clipsFor = (kind: string): Clip[] =>
    (server as Record<string, Clip[]>)[kind] ?? (local as Record<string, Clip[]>)[kind] ?? [];

  return (
    <main className="min-h-screen w-full text-zinc-200" style={{ background: 'radial-gradient(130% 80% at 50% -10%, #1a1d24 0%, #0c0d11 55%, #08090c 100%)' }}>
      <input ref={fileRef} type="file" hidden onChange={onFile} />
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-5">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Ad-Studio" className="h-6 w-auto" />
            <span className="text-[15px] font-semibold tracking-tight text-white/90">Ad-Studio</span>
          </Link>
          <StudioNav />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-8 pb-20">
        <div className="mb-6 mt-2">
          <h1 className="text-[40px] leading-tight text-white">Clips</h1>
          <p className="mt-0.5 text-[13px] text-white/45">Every clip across your projects, grouped by type. Add your own with Add.</p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-20 text-white/40"><Loader2 className="h-4 w-4 animate-spin" /> Loading clips…</div>
        ) : (
          SECTIONS.map((s) => (
            <Section
              key={s.label}
              label={s.label}
              blurb={s.blurb}
              audio={'audio' in s ? s.audio : false}
              clips={clipsFor(s.kind)}
              busy={busy === s.kind}
              onAdd={() => triggerAdd(s.kind, s.folder)}
            />
          ))
        )}
      </div>
    </main>
  );
}
