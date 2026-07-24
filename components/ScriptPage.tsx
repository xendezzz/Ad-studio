'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, FileVideo, Link2, Loader2, Sparkles, Upload } from 'lucide-react';
import { StudioNav } from '@/components/StudioNav';

type Phase = 'idle' | 'uploading' | 'fetching' | 'transcribing' | 'generating';

export function ScriptPage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [url, setUrl] = useState('');
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [script, setScript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = phase !== 'idle';

  const fail = (message: string) => {
    setError(message);
    setPhase('idle');
  };

  const transcribe = async (path: string) => {
    setPhase('transcribing');
    const res = await fetch('/api/voice/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video: path }),
    });
    const data = await res.json();
    if (!res.ok) return fail(data.error || 'Transcription failed');
    setTranscript(data.text || '');
    if (!data.text) setError('No speech detected in this video — paste a transcript manually below.');
    setPhase('idle');
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setScript('');
    setPhase('uploading');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'script');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) return fail(data.error || 'Upload failed');
      setVideoPath(data.path);
      setVideoName(file.name);
      await transcribe(data.path);
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const onFetchUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setError(null);
    setScript('');
    setPhase('fetching');
    try {
      const res = await fetch('/api/fetch-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, folder: 'script' }),
      });
      const data = await res.json();
      if (!res.ok) return fail(data.error || 'Could not fetch a video from that link');
      setVideoPath(data.path);
      setVideoName(data.name || trimmed);
      await transcribe(data.path);
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Fetch failed');
    }
  };

  const onGenerate = async () => {
    if (!transcript.trim()) return;
    setError(null);
    setPhase('generating');
    try {
      const res = await fetch('/api/script/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json();
      if (!res.ok) return fail(data.error || 'Script generation failed');
      setScript(data.script);
      setPhase('idle');
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Script generation failed');
    }
  };

  const onCopy = async () => {
    await navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const phaseLabel: Record<Exclude<Phase, 'idle'>, string> = {
    uploading: 'Uploading video…',
    fetching: 'Fetching video from link…',
    transcribing: 'Extracting script (Whisper)…',
    generating: 'Writing Runable script (Claude Opus 4.8)…',
  };

  return (
    <main className="min-h-screen w-full text-zinc-200" style={{ background: 'radial-gradient(130% 80% at 50% -10%, #1f1f1f 0%, #141414 55%, #101010 100%)' }}>
      <input ref={fileRef} type="file" accept="video/*" hidden onChange={onFile} />
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

      <div className="mx-auto max-w-4xl px-8 pb-20">
        <div className="mb-6 mt-2">
          <h1 className="text-[40px] leading-tight text-white">Script</h1>
          <p className="mt-0.5 text-[13px] text-white/45">Drop a reference ad — uploaded or via link — extract its script, and rewrite it for Runable.</p>
        </div>

        {/* Source input */}
        <section className="mb-6 rounded-xl border border-white/8 bg-white/[0.03] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
              <Link2 className="h-3.5 w-3.5 shrink-0 text-white/35" />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !busy && onFetchUrl()}
                placeholder="Paste a video link (Meta ad, direct .mp4, page with a video)…"
                disabled={busy}
                className="w-full bg-transparent text-[12.5px] text-white/85 placeholder:text-white/25 focus:outline-none"
              />
              <button
                onClick={onFetchUrl}
                disabled={busy || !url.trim()}
                className="shrink-0 rounded-md border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11.5px] font-medium text-white/75 transition-colors hover:border-white/25 hover:text-white/95 disabled:opacity-40"
              >
                Fetch
              </button>
            </div>
            <span className="text-center text-[11px] text-white/30">or</span>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-3.5 py-2 text-[12px] font-medium text-white/80 transition-colors hover:border-white/25 hover:text-white/95 disabled:opacity-40"
            >
              <Upload className="h-3.5 w-3.5" /> Upload video
            </button>
          </div>

          {busy && (
            <div className="mt-3 flex items-center gap-2 text-[12px] text-[var(--gold-bright)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {phaseLabel[phase]}
            </div>
          )}
          {error && <div className="mt-3 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-[12px] text-red-300">{error}</div>}

          {videoPath && (
            <div className="mt-4 flex items-start gap-3">
              <video src={`/api/serve/${videoPath}`} controls preload="metadata" className="w-40 rounded-lg border border-white/10 bg-black/40" />
              <div className="flex items-center gap-1.5 pt-1 text-[12px] text-white/55">
                <FileVideo className="h-3.5 w-3.5 text-white/35" />
                <span className="max-w-[28rem] truncate">{videoName}</span>
              </div>
            </div>
          )}
        </section>

        {/* Transcript */}
        <section className="mb-6">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-[16px] font-semibold tracking-tight text-white/90">Extracted script</h2>
            <span className="text-[12px] text-white/35">edit freely, or paste a transcript directly</span>
          </div>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="The video's transcript appears here after extraction — or paste one yourself."
            rows={7}
            disabled={phase === 'transcribing'}
            className="w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-[13px] leading-relaxed text-white/85 placeholder:text-white/25 focus:border-[var(--gold-line)] focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={onGenerate}
            disabled={busy || !transcript.trim()}
            className="btn-gold mt-3 flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-medium disabled:opacity-40"
          >
            {phase === 'generating' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Turn into Runable script
          </button>
        </section>

        {/* Result */}
        {script && (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-[16px] font-semibold tracking-tight text-white/90">Runable script</h2>
              <button
                onClick={onCopy}
                className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11.5px] font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white/95"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="whitespace-pre-wrap rounded-xl border border-white/8 bg-white/[0.02] px-4 py-4 font-sans text-[13px] leading-relaxed text-white/85">{script}</pre>
          </section>
        )}
      </div>
    </main>
  );
}
