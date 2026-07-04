'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { MoreHorizontal, ChevronDown, Check, AlertCircle, Play, Loader2, Captions, Type, Image as ImageIcon, Mic, Download } from 'lucide-react';
import { NODE_DEFS, type PipelineNodeKind } from '@/lib/pipeline';
import { primaryParam, paramValue } from '@/lib/nodeParams';
import { iconFor } from '@/components/studio/icons';
import { VideoPreview } from '@/components/studio/VideoPreview';
import { TransitionPreview } from '@/components/studio/TransitionPreview';
import { useStudioActions } from '@/components/studio/studioActions';

export type NodeStatus = 'processing' | 'completed' | 'failed';

export type StepNodeData = {
  kind: PipelineNodeKind;
  title?: string;
  subtitle?: string;
  params?: Record<string, string>;
  status?: NodeStatus;
};

function StatusBadge({ status }: { status: NodeStatus }) {
  // 'processing' is shown via the animated gradient border (studio-analyzing), not a spinner.
  if (status === 'processing') return null;
  if (status === 'completed')
    return <Check className="h-3.5 w-3.5 text-emerald-400" />;
  return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
}

function hexToRgba(hex: string, a: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** A compact param row for process nodes — label + a select-style value pill. */
function ParamRow({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-white/35">{label}</span>
      <span
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-white/85"
        style={{ background: hexToRgba(accent, 0.12) }}
      >
        {value}
        <ChevronDown className="h-3 w-3 text-white/40" />
      </span>
    </div>
  );
}

/** Per-kind preview tag + empty-state copy. Nodes that carry/produce media show a box. */
const PREVIEW: Partial<Record<PipelineNodeKind, { tag: string; empty: string }>> = {
  'reference-ad': { tag: 'Reference', empty: 'No reference yet' },
  'combined-clip': { tag: 'Combined', empty: 'No clip yet' },
  'cc-hook': { tag: 'Hook', empty: 'Split from clip' },
  'cc-pip': { tag: 'PiP', empty: 'Split from clip' },
  'cc-aroll': { tag: 'A-roll', empty: 'Split from clip' },
  'cc-broll': { tag: 'B-roll', empty: 'Split from clip' },
  'cc-cta': { tag: 'End Card', empty: 'Runable outro' },
  hook: { tag: 'Video', empty: 'No clip yet' },
  'app-demo': { tag: 'Screen', empty: 'No screen-rec yet' },
  model: { tag: 'Persona', empty: 'No persona yet' },
  'motion-control': { tag: 'Output', empty: 'No output yet' },
  'swap-output': { tag: 'Output', empty: 'No output yet' },
  'bg-remove': { tag: 'Alpha', empty: 'No output yet' },
  combine: { tag: 'Composite', empty: 'No output yet' },
  sequence: { tag: 'Sequence', empty: 'Not joined yet' },
  transition: { tag: 'Preview', empty: 'No output yet' },
  text: { tag: 'Preview', empty: 'No output yet' },
  asset: { tag: 'Preview', empty: 'No assets yet' },
  subtitles: { tag: 'Preview', empty: 'No output yet' },
  voice: { tag: 'Voiced', empty: 'No output yet' },
  'end-card': { tag: 'Outro', empty: 'No output yet' },
  export: { tag: '9:16 · MP4', empty: 'No export yet' },
};

const serve = (p: string) => `/api/serve/${p}`;

/** Dashed placeholder shown when a node has no media yet. */
function EmptyPreview({ icon, label, accent }: { icon: React.ReactNode; label: string; accent: string }) {
  return (
    <div
      className="mt-2.5 flex h-20 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/10 bg-white/[0.015]"
    >
      <span className="grid h-6 w-6 place-items-center rounded-md" style={{ background: hexToRgba(accent, 0.1) }}>
        {icon}
      </span>
      <span className="text-[10px] text-white/30">{label}</span>
    </div>
  );
}

/** Static image thumb (for persona models). */
function ImageThumb({ src, tag }: { src: string; tag: string }) {
  return (
    <div className="relative mt-2.5 w-full overflow-hidden rounded-xl border border-white/5 bg-black/40">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={tag} className="block h-auto w-full" />
      <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-md bg-black/45 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/70 backdrop-blur-sm">
        {tag}
      </span>
    </div>
  );
}

function bodyFor(kind: PipelineNodeKind, accent: string, params?: Record<string, string>) {
  const prim = primaryParam(kind);
  const conf = PREVIEW[kind];
  const Icon = iconFor(NODE_DEFS[kind].icon);

  // Real asset on the node? model -> persona image; video sources -> their clip.
  // Otherwise show an empty state (never a sample/placeholder clip).
  let preview: React.ReactNode = null;
  if (kind === 'transition') {
    // a marker node — show a lightweight CSS preview of the selected transition (no video file)
    preview = <TransitionPreview style={params?.style} />;
  } else if (kind === 'model') {
    preview = params?.persona
      ? <ImageThumb src={serve(params.persona)} tag="Persona" />
      : <EmptyPreview icon={<Icon className="h-3.5 w-3.5" style={{ color: accent }} />} label={conf?.empty ?? 'No persona yet'} accent={accent} />;
  } else if (kind === 'motion-control' || kind === 'swap-output') {
    // the swapped result clip
    preview = params?.clip
      ? <VideoPreview src={serve(params.clip)} tag="Output" />
      : params?.persona
        ? <ImageThumb src={serve(params.persona)} tag="Persona" />
        : <EmptyPreview icon={<Icon className="h-3.5 w-3.5" style={{ color: accent }} />} label={conf?.empty ?? 'No output yet'} accent={accent} />;
  } else if (
    kind === 'hook' || kind === 'app-demo' || kind === 'reference-ad' || kind === 'combined-clip' ||
    kind === 'cc-hook' || kind === 'cc-pip' || kind === 'cc-aroll' || kind === 'cc-broll' || kind === 'cc-cta'
  ) {
    // show the swapped clip once a model's been applied to this part, else the original
    const vid = params?.swapped ?? params?.clip;
    preview = vid
      ? <VideoPreview src={serve(vid)} tag={params?.swapped ? 'Swapped' : (conf?.tag ?? 'Video')} />
      : <EmptyPreview icon={<Icon className="h-3.5 w-3.5" style={{ color: accent }} />} label={conf?.empty ?? 'No clip yet'} accent={accent} />;
  } else if (conf) {
    // output/compose nodes (sequence, export, combine, …) show their rendered clip once produced
    preview = params?.clip
      ? <VideoPreview src={serve(params.clip)} tag={conf.tag} />
      : <EmptyPreview icon={<Icon className="h-3.5 w-3.5" style={{ color: accent }} />} label={conf.empty} accent={accent} />;
  }

  return (
    <>
      {prim && (
        <ParamRow label={prim.label} value={paramValue(kind, prim.key, params)} accent={accent} />
      )}
      {preview}
    </>
  );
}

function StepNodeImpl({ id, data, selected }: NodeProps) {
  const d = data as StepNodeData;
  const def = NODE_DEFS[d.kind];
  const Icon = iconFor(def.icon);
  const accent = def.accent;
  const { onGenerate, running, onApply } = useStudioActions();

  const analyzing = d.status === 'processing';

  return (
    <div
      className={`studio-node group relative w-[212px] rounded-2xl border backdrop-blur-md transition-all duration-200 ease-out hover:-translate-y-px ${analyzing ? 'studio-analyzing' : ''}`}
      style={{
        background: 'linear-gradient(180deg, #1b1e25 0%, #131419 100%)',
        borderColor: selected ? hexToRgba(accent, 0.5) : 'rgba(255,255,255,0.07)',
        boxShadow: selected
          ? `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px ${hexToRgba(accent, 0.3)}, 0 18px 50px rgba(0,0,0,0.6), 0 0 40px ${hexToRgba(accent, 0.14)}`
          : 'inset 0 1px 0 rgba(255,255,255,0.05), 0 14px 40px rgba(0,0,0,0.55)',
      }}
    >
      {def.hasInput && <Handle type="target" position={Position.Left} />}
      {def.hasOutput && <Handle type="source" position={Position.Right} />}

      <div className="px-3 pb-3 pt-2.5">
        {/* header */}
        <div className="flex items-center gap-2">
          <span
            className="grid h-6 w-6 shrink-0 place-items-center rounded-lg"
            style={{ background: hexToRgba(accent, 0.16) }}
          >
            <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold leading-tight text-white/90">
              {d.title ?? def.label}
            </div>
            <div className="truncate text-[10px] leading-tight text-white/35">
              {d.subtitle ?? def.hint}
            </div>
          </div>
          {d.status && <StatusBadge status={d.status} />}
          <button className="grid h-5 w-5 place-items-center rounded-md text-white/30 opacity-0 transition-all hover:bg-white/10 hover:text-white/70 group-hover:opacity-100">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* body */}
        {bodyFor(d.kind, accent, d.params)}

        {/* Text node CTA — opens the multi-text + emoji timeline editor */}
        {d.kind === 'text' && (
          <button
            onClick={() => onApply(id)}
            disabled={d.status === 'processing'}
            className="nodrag mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/90 py-1.5 text-[12px] font-semibold text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {d.status === 'processing' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Type className="h-3.5 w-3.5" />}
            {d.status === 'processing' ? 'Rendering…' : 'Edit text'}
          </button>
        )}

        {d.kind === 'asset' && (
          <button
            onClick={() => onApply(id)}
            disabled={d.status === 'processing'}
            className="nodrag mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/90 py-1.5 text-[12px] font-semibold text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {d.status === 'processing' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
            {d.status === 'processing' ? 'Rendering…' : 'Edit assets'}
          </button>
        )}

        {/* Voice node CTA — transcribe, pick/design a voice, replace the clip's audio */}
        {d.kind === 'voice' && (
          <button
            onClick={() => onApply(id)}
            disabled={d.status === 'processing'}
            className="nodrag mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/90 py-1.5 text-[12px] font-semibold text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {d.status === 'processing' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
            {d.status === 'processing' ? 'Applying…' : 'Edit voice'}
          </button>
        )}

        {/* Subtitles node CTA — transcribe + burn captions onto the wired-in clip */}
        {d.kind === 'subtitles' && (
          <button
            onClick={() => onApply(id)}
            disabled={d.status === 'processing'}
            className="nodrag mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/90 py-1.5 text-[12px] font-semibold text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {d.status === 'processing' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Captions className="h-3.5 w-3.5" />}
            {d.status === 'processing' ? 'Applying…' : 'Edit subtitles'}
          </button>
        )}

        {/* Sequence / Export CTA — runs the pipeline and renders the final ad */}
        {(d.kind === 'sequence' || d.kind === 'export') && (
          <button
            onClick={onGenerate}
            disabled={running}
            className="nodrag mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/90 py-1.5 text-[12px] font-semibold text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" fill="currentColor" />}
            {running ? (d.kind === 'export' ? 'Rendering…' : 'Generating…') : (d.kind === 'export' ? 'Render' : 'Generate video')}
          </button>
        )}

        {/* Download the rendered ad once a sequence/export node has produced it */}
        {(d.kind === 'sequence' || d.kind === 'export') && d.params?.clip && (
          <a
            href={`/api/serve/${d.params.clip}?download=1`}
            download
            className="nodrag mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] py-1.5 text-[12px] font-medium text-white/85 transition-colors hover:bg-white/[0.09]"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </a>
        )}
      </div>
    </div>
  );
}

export const StepNode = memo(StepNodeImpl);
