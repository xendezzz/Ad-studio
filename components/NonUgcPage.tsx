'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Clapperboard, Download, Loader2, MessageSquare, Play, Type } from 'lucide-react';
import type { NonUgcFormat } from '@/lib/nonugcRender';

interface Field {
  key: string;
  label: string;
  value: string;
}

const FORMAT_META: Record<
  NonUgcFormat,
  { title: string; blurb: string; length: string; icon: typeof Type; fields: Field[] }
> = {
  kinetic: {
    title: 'Kinetic Demo',
    blurb: 'Typography-driven product demo — the prompt, the agent working, the real output scrolling by.',
    length: '23s',
    icon: Type,
    fields: [],
  },
  showcase: {
    title: 'Prompt Showcase',
    blurb: 'One photo of the output in the wild + the prompt that made it. The cheapest scroll-stopper.',
    length: '8s',
    icon: MessageSquare,
    fields: [
      { key: 'promptText', label: 'Prompt (typed into the bar)', value: 'Turn my dog into a logo for my coffee shop.' },
      { key: 'headline', label: 'Headline', value: 'Your dog. Your logo. One sentence.' },
      { key: 'subline', label: 'Subline', value: 'Runable builds it — first month for $9' },
    ],
  },
  story: {
    title: 'Cinematic Story',
    blurb: 'Voice-first mini film — a business owner asks Runable out loud, the product delivers.',
    length: '26s',
    icon: Clapperboard,
    fields: [
      { key: 'hookText', label: 'Hook (over opening scene)', value: 'Just say it. Runable builds it.' },
      { key: 'promptEcho', label: 'Request (chat bubble)', value: 'Build me a website for my bakery — menu, photos, and an order button.' },
      { key: 'statusText', label: 'Agent status', value: 'Building Maya’s Oven…' },
      { key: 'headline', label: 'Showcase headline', value: 'A whole website. Zero clicks.' },
      { key: 'ctaLine', label: 'CTA line', value: 'Grab your first month — $9' },
    ],
  },
};

type JobState = { status: 'idle' } | { status: 'rendering' } | { status: 'done'; url: string } | { status: 'failed'; error: string };

export function NonUgcPage() {
  const [format, setFormat] = useState<NonUgcFormat>('showcase');
  const [values, setValues] = useState<Record<string, string>>({});
  const [job, setJob] = useState<JobState>({ status: 'idle' });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const meta = FORMAT_META[format];
  const fieldValue = (f: Field) => values[`${format}:${f.key}`] ?? f.value;

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const render = useCallback(async () => {
    setJob({ status: 'rendering' });
    const params = Object.fromEntries(meta.fields.map((f) => [f.key, fieldValue(f)]));
    try {
      const res = await fetch('/api/nonugc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, params }),
      });
      const { jobId, error } = await res.json();
      if (!jobId) throw new Error(error || 'failed to start render');
      pollRef.current = setInterval(async () => {
        const s = await fetch(`/api/nonugc?id=${jobId}`).then((r) => r.json());
        if (s.status === 'completed' && s.url) {
          if (pollRef.current) clearInterval(pollRef.current);
          setJob({ status: 'done', url: s.url });
        } else if (s.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
          setJob({ status: 'failed', error: s.error || 'render failed' });
        }
      }, 3000);
    } catch (err) {
      setJob({ status: 'failed', error: err instanceof Error ? err.message : 'render failed' });
    }
  }, [format, meta.fields, values]);

  return (
    <main className="mx-auto w-full max-w-5xl px-8 py-10">
      <h1 className="text-[22px] text-[var(--rn-text)]">Non UGC</h1>
      <p className="mt-1 text-[13px] text-[var(--rn-secondary)]">
        Faceless ads — no creators, no shoots. Pick a format, tune the copy, render.
      </p>

      {/* format picker */}
      <div className="mt-8 grid grid-cols-3 gap-3">
        {(Object.keys(FORMAT_META) as NonUgcFormat[]).map((k) => {
          const m = FORMAT_META[k];
          const active = k === format;
          const Icon = m.icon;
          return (
            <button
              key={k}
              onClick={() => { setFormat(k); setJob({ status: 'idle' }); }}
              className={`rounded-2xl border p-4 text-left transition-colors ${
                active
                  ? 'border-white/40 bg-[var(--rn-surface)]'
                  : 'border-[var(--rn-border)] bg-[var(--rn-surface)]/60 hover:bg-[var(--rn-surface)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <Icon className={`h-4 w-4 ${active ? 'text-white' : 'text-[var(--rn-secondary)]'}`} />
                <span className="text-[10.5px] text-[var(--rn-secondary)]">{m.length}</span>
              </div>
              <div className={`mt-3 text-[13.5px] font-medium ${active ? 'text-white' : 'text-[var(--rn-text)]'}`}>{m.title}</div>
              <div className="mt-1 text-[11.5px] leading-relaxed text-[var(--rn-secondary)]">{m.blurb}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-[1fr_320px] gap-6">
        {/* copy editor */}
        <section className="rounded-2xl border border-[var(--rn-border)] bg-[var(--rn-surface)] p-5">
          <h2 className="text-[13px] font-medium text-[var(--rn-text)]">Copy</h2>
          {meta.fields.length ? (
            <div className="mt-4 flex flex-col gap-4">
              {meta.fields.map((f) => (
                <label key={f.key} className="flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-wider text-[var(--rn-secondary)]">{f.label}</span>
                  <input
                    value={fieldValue(f)}
                    onChange={(e) => setValues((v) => ({ ...v, [`${format}:${f.key}`]: e.target.value }))}
                    className="rounded-xl border border-[var(--rn-border)] bg-[var(--rn-page)] px-3.5 py-2.5 text-[13px] text-[var(--rn-text)] outline-none transition-colors focus:border-white/30"
                  />
                </label>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-[12.5px] leading-relaxed text-[var(--rn-secondary)]">
              This format renders with its built-in copy for now — parameterization lands with the automation flow.
            </p>
          )}
          <button
            onClick={render}
            disabled={job.status === 'rendering'}
            className="btn-runable mt-6 flex items-center gap-2 px-5 py-2.5 text-[13px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {job.status === 'rendering' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {job.status === 'rendering' ? 'Rendering…' : 'Render ad'}
          </button>
        </section>

        {/* output */}
        <section className="rounded-2xl border border-[var(--rn-border)] bg-[var(--rn-surface)] p-5">
          <h2 className="text-[13px] font-medium text-[var(--rn-text)]">Output</h2>
          <div className="mt-4">
            {job.status === 'done' ? (
              <>
                <video src={job.url} controls autoPlay loop playsInline className="w-full rounded-xl border border-[var(--rn-border)] bg-black" />
                <a
                  href={job.url}
                  download
                  className="btn-runable mt-3 flex items-center justify-center gap-1.5 py-2 text-[12.5px]"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </>
            ) : job.status === 'failed' ? (
              <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[12px] leading-relaxed text-red-300">
                {job.error}
              </p>
            ) : (
              <div className="grid aspect-[9/16] place-items-center rounded-xl border border-dashed border-[var(--rn-border)]">
                <span className="px-6 text-center text-[11.5px] leading-relaxed text-[var(--rn-secondary)]">
                  {job.status === 'rendering' ? 'Rendering — usually 1–2 minutes.' : 'Your ad shows up here.'}
                </span>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
