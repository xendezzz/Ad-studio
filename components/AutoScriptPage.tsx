'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, CheckCircle2, Circle, Copy, FileVideo, Link2, Loader2, RotateCcw, Sparkles, Upload, XCircle } from 'lucide-react';
import { StudioNav } from '@/components/StudioNav';

type StepId = 'source' | 'transcribe' | 'script';
type StepState = 'pending' | 'active' | 'done' | 'error';

const STEPS: Array<{ id: StepId; label: string }> = [
  { id: 'source', label: 'Get video' },
  { id: 'transcribe', label: 'Extract transcript (Whisper)' },
  { id: 'script', label: 'Write Runable script (Claude)' },
];

export function AutoScriptPage() {
  const [url, setUrl] = useState('');
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Record<StepId, StepState>>({ source: 'pending', transcribe: 'pending', script: 'pending' });
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [script, setScript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const setStep = (id: StepId, state: StepState) => setSteps((s) => ({ ...s, [id]: state }));

  const reset = () => {
    setSteps({ source: 'pending', transcribe: 'pending', script: 'pending' });
    setVideoPath(null);
    setVideoName(null);
    setTranscript('');
    setScript('');
    setError(null);
  };

  /** Transcribe an uploaded/fetched video, then write the script. Shared tail of both entry points. */
  const runFromVideo = async (path: string) => {
    setStep('transcribe', 'active');
    const tRes = await fetch('/api/voice/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video: path }),
    });
    const tData = await tRes.json();
    if (!tRes.ok) {
      setStep('transcribe', 'error');
      throw new Error(tData.error || 'Transcription failed');
    }
    const text: string = tData.text || '';
    setTranscript(text);
    if (!text.trim()) {
      setStep('transcribe', 'error');
      throw new Error('No speech detected in this video — paste a transcript below and hit Regenerate.');
    }
    setStep('transcribe', 'done');
    await runFromTranscript(text);
  };

  const runFromTranscript = async (text: string) => {
    setStep('script', 'active');
    const res = await fetch('/api/script/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: text }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStep('script', 'error');
      throw new Error(data.error || 'Script generation failed');
    }
    setScript(data.script);
    setStep('script', 'done');
  };

  const runWithFile = async (file: File) => {
    reset();
    setRunning(true);
    try {
      setStep('source', 'active');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'auto-script');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setStep('source', 'error');
        throw new Error(data.error || 'Upload failed');
      }
      setVideoPath(data.path);
      setVideoName(file.name);
      setStep('source', 'done');
      await runFromVideo(data.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Automation failed');
    } finally {
      setRunning(false);
    }
  };

  const runWithUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    reset();
    setRunning(true);
    try {
      setStep('source', 'active');
      const res = await fetch('/api/fetch-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, folder: 'auto-script' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStep('source', 'error');
        throw new Error(data.error || 'Could not fetch a video from that link');
      }
      setVideoPath(data.path);
      setVideoName(data.name || trimmed);
      setStep('source', 'done');
      await runFromVideo(data.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Automation failed');
    } finally {
      setRunning(false);
    }
  };

  /** Re-run only the script step from the (possibly hand-edited) transcript. */
  const regenerate = async () => {
    if (!transcript.trim()) return;
    setError(null);
    setScript('');
    setRunning(true);
    try {
      if (steps.transcribe !== 'done') setStep('transcribe', 'done');
      await runFromTranscript(transcript);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Script generation failed');
    } finally {
      setRunning(false);
    }
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (running) return;
      const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('video/'));
      if (file) void runWithFile(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [running],
  );

  const onCopy = async () => {
    await navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const StepIcon = ({ state }: { state: StepState }) =>
    state === 'done' ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
    ) : state === 'active' ? (
      <Loader2 className="h-4 w-4 animate-spin text-[var(--gold-bright)]" />
    ) : state === 'error' ? (
      <XCircle className="h-4 w-4 text-red-400" />
    ) : (
      <Circle className="h-4 w-4 text-white/20" />
    );

  const started = Object.values(steps).some((s) => s !== 'pending');

  return (
    <main className="min-h-screen w-full text-zinc-200" style={{ background: 'radial-gradient(130% 80% at 50% -10%, #1f1f1f 0%, #141414 55%, #101010 100%)' }}>
      <input ref={fileRef} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void runWithFile(f); }} />
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
          <h1 className="text-[40px] leading-tight text-white">Auto Script</h1>
          <p className="mt-0.5 text-[13px] text-white/45">Drop any video or paste a link — it transcribes and rewrites it into a Runable UGC script automatically. One input, zero clicks in between.</p>
        </div>

        {/* Input */}
        <section
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`mb-6 rounded-xl border p-4 transition-colors ${dragOver ? 'border-[var(--gold-line)] bg-[var(--gold-soft)]' : 'border-white/8 bg-white/[0.03]'}`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
              <Link2 className="h-3.5 w-3.5 shrink-0 text-white/35" />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !running && runWithUrl()}
                placeholder="Paste a video link (Meta ad, direct .mp4, page with a video)…"
                disabled={running}
                className="w-full bg-transparent text-[12.5px] text-white/85 placeholder:text-white/25 focus:outline-none"
              />
              <button
                onClick={runWithUrl}
                disabled={running || !url.trim()}
                className="btn-gold shrink-0 flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-medium disabled:opacity-40"
              >
                <Sparkles className="h-3 w-3" /> Run
              </button>
            </div>
            <span className="text-center text-[11px] text-white/30">or</span>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={running}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-3.5 py-2 text-[12px] font-medium text-white/80 transition-colors hover:border-white/25 hover:text-white/95 disabled:opacity-40"
            >
              <Upload className="h-3.5 w-3.5" /> Upload video
            </button>
          </div>
          <p className="mt-2 text-[11px] text-white/25">Tip: you can also drag &amp; drop a video anywhere on this card.</p>
        </section>

        {/* Progress */}
        {started && (
          <section className="mb-6 rounded-xl border border-white/8 bg-white/[0.03] p-4">
            <div className="flex flex-col gap-2.5">
              {STEPS.map((s) => (
                <div key={s.id} className="flex items-center gap-2.5">
                  <StepIcon state={steps[s.id]} />
                  <span className={`text-[12.5px] ${steps[s.id] === 'pending' ? 'text-white/30' : steps[s.id] === 'error' ? 'text-red-300' : 'text-white/80'}`}>{s.label}</span>
                </div>
              ))}
            </div>
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
        )}

        {/* Transcript (visible once we have one, or if transcription failed so the user can paste) */}
        {(transcript || steps.transcribe === 'error') && (
          <section className="mb-6">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-[16px] font-semibold tracking-tight text-white/90">Transcript</h2>
              <span className="text-[12px] text-white/35">edit and regenerate if needed</span>
              <button
                onClick={regenerate}
                disabled={running || !transcript.trim()}
                className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11.5px] font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white/95 disabled:opacity-40"
              >
                <RotateCcw className="h-3 w-3" /> Regenerate script
              </button>
            </div>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste a transcript here if extraction found no speech."
              rows={5}
              disabled={running}
              className="w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-[13px] leading-relaxed text-white/85 placeholder:text-white/25 focus:border-[var(--gold-line)] focus:outline-none disabled:opacity-50"
            />
          </section>
        )}

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
