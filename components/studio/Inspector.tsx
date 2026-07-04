'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore, type Node } from '@xyflow/react';
import { X, ChevronDown, Upload, Loader2, Check, LibraryBig, Search, Link2, Plus, Scissors, Wand2 } from 'lucide-react';
import { NODE_DEFS, type PipelineNodeKind } from '@/lib/pipeline';
import { PARAM_SCHEMAS, paramValue } from '@/lib/nodeParams';
import { ANALYSIS_MODELS, estimateAnalysisCost, getAnalysisModel, DEFAULT_ANALYSIS_MODEL } from '@/lib/analysisModels';
import { iconFor } from '@/components/studio/icons';
import { uploadAsset } from '@/lib/uploadAsset';
import type { StepNodeData } from '@/components/studio/nodes/StepNode';

const NODE_WIDTH = 212;
const PANEL_WIDTH = 252;

// ElevenLabs voice library — fetched once per session, shared by every voice inspector
let voiceLibCache: { voiceId: string; name: string }[] | null = null;

/** Live voice picker for the Voice node: search + full ElevenLabs library. */
function VoiceLibrarySelect({
  value,
  onPick,
}: {
  value: string;
  onPick: (voiceId: string, name: string) => void;
}) {
  const [voices, setVoices] = useState<{ voiceId: string; name: string }[] | null>(voiceLibCache);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (voiceLibCache) return;
    fetch('/api/voice/voices')
      .then((r) => r.json())
      .then((d) => {
        voiceLibCache = Array.isArray(d.voices) ? d.voices : [];
        setVoices(voiceLibCache);
      })
      .catch(() => setVoices([]));
  }, []);

  const filtered = (voices ?? []).filter((v) => !q || v.name.toLowerCase().includes(q.toLowerCase()));
  const shown = filtered.slice(0, 200);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2">
        <Search className="h-3 w-3 shrink-0 text-white/30" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={voices === null ? 'Loading voices…' : `Search ${voices.length} voices…`}
          className="w-full bg-transparent py-1.5 text-[11.5px] text-white/85 outline-none placeholder:text-white/30"
        />
      </div>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => {
            const v = (voices ?? []).find((x) => x.voiceId === e.target.value);
            if (v) onPick(v.voiceId, v.name);
          }}
          className="w-full appearance-none rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 pr-7 text-[12px] text-white/85 outline-none transition-colors hover:border-white/20 focus:border-white/30"
        >
          <option value="" className="bg-[#15171c]">Pick a voice…</option>
          {value && !shown.some((v) => v.voiceId === value) && (
            <option value={value} className="bg-[#15171c]">{(voices ?? []).find((v) => v.voiceId === value)?.name ?? 'Current voice'}</option>
          )}
          {shown.map((v) => (
            <option key={v.voiceId} value={v.voiceId} className="bg-[#15171c]">{v.name}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
      </div>
      {filtered.length > 200 && (
        <p className="text-[9.5px] text-white/30">Showing first 200 of {filtered.length} — refine the search.</p>
      )}
      <p className="text-[10px] leading-relaxed text-white/35">
        To hear previews or design a brand-new voice, click <span className="text-white/60">Edit voice</span> on the node.
      </p>
    </div>
  );
}

// the creator-containing parts you can swap a model into (not app-demo / reference / music)
const SWAPPABLE_KINDS = new Set<PipelineNodeKind>(['cc-hook', 'cc-pip', 'cc-aroll', 'cc-broll', 'hook']);

const FOLDER_FOR_KIND: Partial<Record<PipelineNodeKind, string>> = {
  model: 'models',
  hook: 'hooks',
  'app-demo': 'app-demos',
  'reference-ad': 'reference-ads',
  'combined-clip': 'combined-clips',
  'cc-hook': 'combined-clips',
  'cc-pip': 'combined-clips',
  'cc-aroll': 'combined-clips',
  'cc-broll': 'combined-clips',
  music: 'music',
};

function UploadButton({
  kind,
  value,
  onUploaded,
}: {
  kind: PipelineNodeKind;
  value: string;
  onUploaded: (path: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const path = await uploadAsset(file, FOLDER_FOR_KIND[kind] ?? 'misc');
      onUploaded(path);
    } catch (err) {
      console.error('[upload]', err);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" hidden onChange={onChange} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-2.5 py-2 text-[11px] text-white/50 transition-colors hover:border-white/30 hover:text-white/75 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : value ? (
          <Check className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        {busy ? 'Uploading…' : value ? 'Replace file' : 'Upload'}
      </button>
    </>
  );
}

function hexToRgba(hex: string, a: number) {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
}

// Library source per node kind: which endpoint + path field + node-param key.
const LIB_SOURCE: Partial<Record<PipelineNodeKind, { endpoint: string; field: string; key: string; image?: boolean }>> = {
  model: { endpoint: '/api/models', field: 'imagePath', key: 'persona', image: true },
  hook: { endpoint: '/api/hooks', field: 'videoPath', key: 'clip' },
  'app-demo': { endpoint: '/api/app-demos', field: 'videoPath', key: 'clip' },
  'reference-ad': { endpoint: '/api/reference-ads', field: 'videoPath', key: 'clip' },
  music: { endpoint: '/api/music', field: 'audioPath', key: 'track' },
};

interface LibRow { id: string; name: string; [k: string]: unknown }

/** Upload + "Library" picker for a source asset field. */
function AssetField({
  kind,
  value,
  onUpload,
  onPick,
}: {
  kind: PipelineNodeKind;
  value: string;
  onUpload: (path: string) => void;
  onPick: (name: string, path: string) => void;
}) {
  const src = LIB_SOURCE[kind];
  const [picking, setPicking] = useState(false);
  const [rows, setRows] = useState<LibRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [linking, setLinking] = useState(false);
  const [url, setUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [linkErr, setLinkErr] = useState<string | null>(null);

  async function fetchLink() {
    const link = url.trim();
    if (!link || fetching) return;
    setFetching(true);
    setLinkErr(null);
    try {
      const res = await fetch('/api/fetch-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link, folder: FOLDER_FOR_KIND[kind] ?? 'misc' }),
      });
      const data = await res.json();
      if (res.ok && data.path) {
        onPick(data.name || 'Linked video', data.path);
        setUrl('');
        setLinking(false);
      } else {
        setLinkErr(data.error || 'Could not fetch that link');
      }
    } catch {
      setLinkErr('Could not reach that link');
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (!picking || !src) return;
    setLoading(true);
    fetch(src.endpoint)
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [picking, src]);

  const filtered = q ? rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : rows;

  return (
    <div>
      <div className="flex gap-1.5">
        <UploadButton kind={kind} value={value} onUploaded={onUpload} />
        <button
          onClick={() => { setLinking((v) => !v); setLinkErr(null); }}
          className={`flex shrink-0 items-center gap-1 rounded-lg border px-2 py-2 text-[11px] transition-colors ${linking ? 'border-white/25 bg-white/[0.06] text-white/85' : 'border-white/10 bg-white/[0.02] text-white/55 hover:border-white/25 hover:text-white/80'}`}
          title="Paste a link"
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>
        {src && (
          <button
            onClick={() => setPicking((v) => !v)}
            className={`flex shrink-0 items-center gap-1 rounded-lg border px-2 py-2 text-[11px] transition-colors ${picking ? 'border-white/25 bg-white/[0.06] text-white/85' : 'border-white/10 bg-white/[0.02] text-white/55 hover:border-white/25 hover:text-white/80'}`}
            title="Pick from library"
          >
            <LibraryBig className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {linking && (
        <div className="mt-2 rounded-lg border border-white/10 bg-black/30 p-2">
          <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2">
            <Link2 className="h-3 w-3 shrink-0 text-white/30" />
            <input
              value={url}
              autoFocus
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') fetchLink(); }}
              placeholder="Paste a video link…"
              className="w-full bg-transparent py-1.5 text-[11px] text-white/85 outline-none placeholder:text-white/25"
            />
          </div>
          <button
            onClick={fetchLink}
            disabled={fetching || !url.trim()}
            className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-white/15 bg-white/[0.04] py-1.5 text-[11px] text-white/75 transition-colors hover:border-white/30 hover:text-white/90 disabled:opacity-50"
          >
            {fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            {fetching ? 'Fetching…' : 'Fetch & download'}
          </button>
          {linkErr && <div className="mt-1.5 px-0.5 text-[10px] leading-snug text-rose-400/90">{linkErr}</div>}
        </div>
      )}

      {picking && src && (
        <div className="mt-2 rounded-lg border border-white/10 bg-black/30 p-2">
          <div className="mb-1.5 flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2">
            <Search className="h-3 w-3 text-white/30" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${kind}…`}
              className="w-full bg-transparent py-1 text-[11px] text-white/80 outline-none placeholder:text-white/25"
            />
          </div>
          {loading ? (
            <div className="flex items-center gap-2 px-1 py-3 text-[11px] text-white/40">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-1 py-2 text-[11px] text-white/30">Nothing here yet.</div>
          ) : src.image ? (
            <div className="grid max-h-44 grid-cols-3 gap-1.5 overflow-y-auto">
              {filtered.slice(0, 30).map((r) => {
                const path = r[src.field] as string;
                return (
                  <button
                    key={r.id}
                    onClick={() => { onPick(r.name, path); setPicking(false); }}
                    title={r.name}
                    className="overflow-hidden rounded-md border border-white/8 transition-all hover:border-white/30"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {path ? <img src={`/api/serve/${path}`} alt={r.name} className="aspect-square w-full object-cover" /> : <div className="aspect-square w-full bg-white/5" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="max-h-44 space-y-1 overflow-y-auto">
              {filtered.slice(0, 20).map((r) => (
                <button
                  key={r.id}
                  onClick={() => { onPick(r.name, r[src.field] as string); setPicking(false); }}
                  className="flex w-full items-center rounded-md border border-white/5 bg-white/[0.02] px-2 py-1.5 text-left text-[11px] text-white/75 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <span className="truncate">{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface AnalyzedSeg { part: string; startSec: number; endSec: number; description: string }

const PART_COLOR: Record<string, string> = {
  hook: '#22d3ee', pip: '#fb923c', a_roll: '#60a5fa', b_roll: '#c084fc', cta: '#f5a524', other: '#94a3b8',
};
const PART_LABEL: Record<string, string> = {
  hook: 'Hook', pip: 'PiP', a_roll: 'A-roll', b_roll: 'B-roll', cta: 'CTA', other: 'Other',
};
// which node kind to spawn for each detected part
const PART_NODE_KIND: Record<string, PipelineNodeKind> = {
  hook: 'cc-hook', pip: 'cc-pip', a_roll: 'cc-aroll', b_roll: 'cc-broll', cta: 'end-card', other: 'cc-broll',
};

/** Reference-ad clip-by-clip analysis: pick FAL/Claude engine, see cost, run, list detected parts. */
function AnalyzePanel({
  clip,
  savedAnalysis,
  modelId,
  onSetModel,
  onAnalyzingChange,
  onSaveAnalysis,
  onAddPart,
}: {
  clip: string;
  savedAnalysis: string | undefined;
  modelId: string;
  onSetModel: (id: string) => void;
  onAnalyzingChange: (active: boolean) => void;
  onSaveAnalysis: (segments: AnalyzedSeg[], summary: string) => void;
  onAddPart: (seg: AnalyzedSeg) => void;
}) {
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [keys, setKeys] = useState<{ fal: boolean; anthropic: boolean }>({ fal: true, anthropic: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const parsed: { segments: AnalyzedSeg[]; summary: string } | null = savedAnalysis
    ? JSON.parse(savedAnalysis)
    : null;

  const model = getAnalysisModel(modelId);
  const cost = durationSec != null ? estimateAnalysisCost(durationSec, modelId) : null;
  const keyOk = keys[model.needs];

  useEffect(() => {
    if (!clip) return;
    let active = true;
    fetch('/api/reference-ads/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoPath: clip, estimateOnly: true }),
    })
      .then((r) => r.json())
      .then((d) => { if (active) { if (typeof d.durationSec === 'number') setDurationSec(d.durationSec); if (d.keys) setKeys(d.keys); } })
      .catch(() => {});
    return () => { active = false; };
  }, [clip]);

  async function run() {
    setBusy(true);
    setErr(null);
    onAnalyzingChange(true);
    try {
      const res = await fetch('/api/reference-ads/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoPath: clip, model: modelId }),
      });
      const d = await res.json();
      if (res.ok && d.analysis) onSaveAnalysis(d.analysis.segments, d.analysis.summary);
      else setErr(d.error || 'Analysis failed');
    } catch {
      setErr('Analysis failed');
    } finally {
      setBusy(false);
      onAnalyzingChange(false);
    }
  }

  const priceLabel = cost ? `~$${cost.totalCost < 0.01 ? cost.totalCost.toFixed(3) : cost.totalCost.toFixed(2)}` : '…';

  return (
    <div className="mt-1 border-t border-white/8 pt-3">
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="text-[10px] uppercase tracking-wider text-white/35">Clip-by-clip analysis</span>
        {cost && <span className="text-[10px] text-white/30">{cost.frames} frames · {priceLabel}</span>}
      </div>
      <div className="relative mb-1.5">
        <select
          value={modelId}
          onChange={(e) => onSetModel(e.target.value)}
          className="w-full appearance-none rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 pr-7 text-[11px] text-white/85 outline-none transition-colors hover:border-white/20 focus:border-white/30"
        >
          {ANALYSIS_MODELS.map((m) => (
            <option key={m.id} value={m.id} className="bg-[#15171c] text-white">{m.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
      </div>
      <p className="mb-1.5 px-0.5 text-[10px] leading-snug text-white/35">{model.note}</p>
      {!keyOk && (
        <div className="mb-1.5 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-300/90">
          {model.needs === 'anthropic'
            ? 'Set ANTHROPIC_API_KEY in .env to use this model, or pick a FAL model.'
            : 'Set FAL_KEY in .env to enable analysis.'}
        </div>
      )}
      <button
        onClick={run}
        disabled={busy || !clip || !keyOk}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] py-1.5 text-[11px] text-white/80 transition-colors hover:border-white/30 hover:text-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {busy ? 'Analyzing…' : parsed ? `Re-analyze (${priceLabel})` : `Analyze ad (${priceLabel})`}
      </button>
      {err && <div className="mt-1.5 px-0.5 text-[10px] text-rose-400/90">{err}</div>}
      {parsed && (
        <div className="mt-2 space-y-1">
          {parsed.summary && <p className="px-0.5 text-[10px] leading-snug text-white/45">{parsed.summary}</p>}
          {parsed.segments.map((s, i) => (
            <div key={i} className="group/seg flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2 py-1">
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                style={{ background: hexToRgba(PART_COLOR[s.part] ?? '#94a3b8', 0.16), color: PART_COLOR[s.part] ?? '#94a3b8' }}
              >
                {PART_LABEL[s.part] ?? s.part}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-white/40">
                {s.startSec.toFixed(1)}–{s.endSec.toFixed(1)}s
              </span>
              <span className="flex-1 truncate text-[10px] text-white/55">{s.description}</span>
              <button
                onClick={() => onAddPart(s)}
                title={`Add ${PART_LABEL[s.part] ?? s.part} node to canvas`}
                className="grid h-5 w-5 shrink-0 place-items-center rounded border border-white/10 bg-white/[0.04] text-white/45 transition-all hover:border-white/25 hover:bg-white/10 hover:text-white/90"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Inspector({
  node,
  onUpdateParam,
  onSetNodeData,
  onSetStatus,
  onAddNode,
  onTrim,
  onApplyMotion,
  swapModelName,
  onClose,
}: {
  node: Node;
  onUpdateParam: (id: string, key: string, value: string) => void;
  onSetNodeData: (id: string, patch: { title?: string; params?: Record<string, string> }) => void;
  onSetStatus?: (id: string, status: 'processing' | 'completed' | 'failed' | undefined) => void;
  onAddNode?: (kind: PipelineNodeKind, init?: { title?: string; params?: Record<string, string> }) => void;
  onTrim?: (id: string) => void;
  onApplyMotion?: (id: string) => void;
  swapModelName?: string | null;
  onClose: () => void;
}) {
  const transform = useStore((s) => s.transform); // [x, y, zoom]
  const [tx, ty, zoom] = transform;

  const data = node.data as StepNodeData;
  const def = NODE_DEFS[data.kind];
  const Icon = iconFor(def.icon);
  const fields = PARAM_SCHEMAS[data.kind] ?? [];

  // screen position of the node, then place panel to its right (flip left if needed)
  const nodeScreenX = node.position.x * zoom + tx;
  const nodeScreenY = node.position.y * zoom + ty;
  const rightX = nodeScreenX + NODE_WIDTH * zoom + 14;
  const flip =
    typeof window !== 'undefined' && rightX + PANEL_WIDTH > window.innerWidth - 16;
  const left = flip ? nodeScreenX - PANEL_WIDTH - 14 : rightX;
  const top = Math.max(64, nodeScreenY);

  return (
    <div
      className="studio-node pointer-events-auto absolute z-30 rounded-2xl border border-white/10 bg-[#15171c]/90 shadow-[0_16px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl"
      style={{ left, top, width: PANEL_WIDTH }}
    >
      {/* header */}
      <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2.5">
        <span
          className="grid h-6 w-6 place-items-center rounded-lg"
          style={{ background: hexToRgba(def.accent, 0.16) }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color: def.accent }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold text-white/90">
            {data.title ?? def.label}
          </div>
          <div className="truncate text-[10px] text-white/35">{def.hint}</div>
        </div>
        <button
          onClick={onClose}
          className="grid h-5 w-5 place-items-center rounded-md text-white/30 transition-colors hover:bg-white/10 hover:text-white/70"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* fields */}
      <div className="space-y-3 px-3 py-3">
        {fields.length === 0 && (
          <p className="text-[11px] text-white/35">No settings for this step.</p>
        )}
        {fields.map((f) => {
          const value = paramValue(data.kind, f.key, data.params);
          // voice node: real ElevenLabs library with search, not the static schema options
          if (data.kind === 'voice' && f.key === 'voiceId') {
            return (
              <div key={f.key}>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/35">
                  {f.label}
                </label>
                <VoiceLibrarySelect
                  value={data.params?.voiceId ?? ''}
                  onPick={(voiceId, name) => {
                    onUpdateParam(node.id, 'voiceId', voiceId);
                    onUpdateParam(node.id, 'voiceName', name);
                  }}
                />
              </div>
            );
          }
          return (
            <div key={f.key}>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/35">
                {f.label}
              </label>

              {f.control === 'select' && (
                <div className="relative">
                  <select
                    value={value}
                    onChange={(e) => onUpdateParam(node.id, f.key, e.target.value)}
                    className="w-full appearance-none rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 pr-7 text-[12px] text-white/85 outline-none transition-colors hover:border-white/20 focus:border-white/30"
                  >
                    {f.options?.map((o) => (
                      <option key={o} value={o} className="bg-[#15171c] text-white">
                        {o}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
                </div>
              )}

              {f.control === 'text' && (
                <input
                  type="text"
                  value={value}
                  placeholder={f.placeholder}
                  onChange={(e) => onUpdateParam(node.id, f.key, e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-white/85 outline-none transition-colors placeholder:text-white/25 hover:border-white/20 focus:border-white/30"
                />
              )}

              {f.control === 'upload' && (
                <AssetField
                  kind={data.kind}
                  value={value}
                  onUpload={(p) => onUpdateParam(node.id, f.key, p)}
                  onPick={(name, p) => onSetNodeData(node.id, { title: name, params: { [f.key]: p } })}
                />
              )}
            </div>
          );
        })}

        {SWAPPABLE_KINDS.has(data.kind) && data.params?.clip && onApplyMotion && (
          <div className="space-y-2 border-t border-white/8 pt-3">
            <label className="block text-[10px] uppercase tracking-wider text-white/35">Motion control</label>
            {data.params?.swapped && (
              <div className="flex items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-2.5 py-1.5 text-[11px] text-emerald-300/90">
                <Check className="h-3.5 w-3.5" /> Swapped{swapModelName ? ` to ${swapModelName}` : ''}
              </div>
            )}
            {(() => {
              const pipUseOriginal = data.params?.pipUseOriginal === 'true';
              const needsAppDemo = data.kind === 'cc-pip' && !pipUseOriginal && !data.params?.appDemo;
              const blocked = !swapModelName || needsAppDemo;
              return (
                <>
                  {data.kind === 'cc-pip' && (
                    <button
                      onClick={() => onUpdateParam(node.id, 'pipUseOriginal', pipUseOriginal ? 'false' : 'true')}
                      className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/75 transition-colors hover:border-white/20"
                    >
                      <span>Use app demo in clip</span>
                      <span className={`relative h-4 w-7 rounded-full transition-colors ${pipUseOriginal ? 'bg-emerald-500/80' : 'bg-white/15'}`}>
                        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${pipUseOriginal ? 'left-3.5' : 'left-0.5'}`} />
                      </span>
                    </button>
                  )}
                  {data.kind === 'cc-pip' && pipUseOriginal && (
                    <p className="text-[10px] leading-relaxed text-white/35">Crops your selection, swaps the creator, and pastes it back at the same spot — keeping the app demo already in the clip.</p>
                  )}
                  <button
                    onClick={() => onApplyMotion(node.id)}
                    disabled={blocked || data.status === 'processing'}
                    title={
                      !swapModelName
                        ? 'Pick a model in the top bar first'
                        : needsAppDemo
                          ? 'Connect an App Demo node to this PiP part first'
                          : 'Swap this part to the selected model'
                    }
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/90 py-1.5 text-[12px] font-semibold text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {data.status === 'processing' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5" />
                    )}
                    {data.params?.swapped ? 'Re-apply Motion Control' : 'Apply Motion Control'}
                  </button>
                  {!swapModelName && (
                    <p className="text-[10px] leading-relaxed text-white/35">Choose a model to swap to in the top bar first.</p>
                  )}
                  {swapModelName && needsAppDemo && (
                    <p className="text-[10px] leading-relaxed text-white/35">
                      Connect an App Demo node to this PiP part — the bg-removed creator gets composited over it.
                    </p>
                  )}
                  {data.kind === 'cc-pip' && !pipUseOriginal && data.params?.appDemo && (
                    <p className="text-[10px] leading-relaxed text-emerald-300/70">External app demo connected ✓</p>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {data.params?.clip && onTrim && (
          <button
            onClick={() => onTrim(node.id)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] py-1.5 text-[12px] font-medium text-white/80 transition-colors hover:border-white/20 hover:bg-white/[0.07]"
          >
            <Scissors className="h-3.5 w-3.5" /> Trim / Split
          </button>
        )}

        {data.kind === 'reference-ad' && data.params?.clip && (
          <AnalyzePanel
            clip={data.params.clip}
            savedAnalysis={data.params?.analysis}
            modelId={data.params?.analysisModel ?? DEFAULT_ANALYSIS_MODEL}
            onSetModel={(id) => onUpdateParam(node.id, 'analysisModel', id)}
            onAnalyzingChange={(active) => onSetStatus?.(node.id, active ? 'processing' : undefined)}
            onSaveAnalysis={(segments, summary) =>
              onSetNodeData(node.id, { params: { analysis: JSON.stringify({ segments, summary }) } })
            }
            onAddPart={(seg) =>
              onAddNode?.(PART_NODE_KIND[seg.part] ?? 'cc-broll', {
                title: `${PART_LABEL[seg.part] ?? seg.part} · ${seg.startSec.toFixed(1)}–${seg.endSec.toFixed(1)}s`,
                params: {
                  start: String(seg.startSec),
                  end: String(seg.endSec),
                  srcClip: data.params?.clip ?? '',
                },
              })
            }
          />
        )}
      </div>
    </div>
  );
}
