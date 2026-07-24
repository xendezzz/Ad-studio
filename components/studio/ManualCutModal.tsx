'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Play, Pause, Scissors, Plus, Loader2 } from 'lucide-react';

export interface ManualSeg { part: string; startSec: number; endSec: number; description: string }

const PARTS = ['hook', 'pip', 'a_roll', 'b_roll', 'cta', 'other'] as const;
const PART_COLOR: Record<string, string> = {
  hook: '#22d3ee', pip: '#fb923c', a_roll: '#60a5fa', b_roll: '#c084fc', cta: '#f5a524', other: '#94a3b8',
};
const PART_LABEL: Record<string, string> = {
  hook: 'Hook', pip: 'PiP', a_roll: 'A-roll', b_roll: 'B-roll', cta: 'CTA', other: 'Other',
};

function fmt(t: number): string {
  if (!Number.isFinite(t)) return '0:00.0';
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function hexToRgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// sensible default labels for a fresh cut: first part is the hook, last is the CTA
function defaultPart(index: number, total: number): string {
  if (index === 0) return 'hook';
  if (index === total - 1 && total > 1) return 'cta';
  return 'a_roll';
}

/**
 * Manual clip-by-clip cutter for a reference ad — the hand-made counterpart to Analyze.
 * Drop cut markers on the timeline to slice the video into parts, label each one
 * (hook / PiP / A-roll / …), and save. The parent stores the result in the same
 * format as the AI analysis, so part pills and connect-to-cut work identically.
 */
export function ManualCutModal({
  src,
  title,
  initialSegments,
  onSave,
  onClose,
}: {
  src: string;
  title: string;
  initialSegments?: ManualSeg[];
  onSave: (segments: ManualSeg[]) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [cuts, setCuts] = useState<number[]>([]);
  const [parts, setParts] = useState<string[]>(['hook']);
  // 'playhead' or the index of the cut being dragged
  const drag = useRef<'playhead' | number | null>(null);

  const onMeta = useCallback(() => {
    const d = videoRef.current?.duration ?? 0;
    if (!Number.isFinite(d) || d <= 0) return;
    setDuration(d);
    // seed from a previous manual/AI segmentation when its boundaries fit this video
    if (initialSegments && initialSegments.length > 1) {
      const inner = initialSegments.slice(1).map((s) => s.startSec).filter((t) => t > 0.1 && t < d - 0.1);
      if (inner.length === initialSegments.length - 1) {
        setCuts(inner);
        setParts(initialSegments.map((s) => (PART_LABEL[s.part] ? s.part : 'other')));
        return;
      }
    }
    setCuts([]);
    setParts(['hook']);
  }, [initialSegments]);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = t;
    setPlayhead(t);
  }, []);

  const timeAt = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || !duration) return 0;
      const r = track.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      return frac * duration;
    },
    [duration],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (drag.current == null) return;
      const t = timeAt(e.clientX);
      if (drag.current === 'playhead') {
        seek(Math.min(duration, Math.max(0, t)));
      } else {
        const i = drag.current;
        setCuts((cs) => {
          // keep markers ordered with a little breathing room between neighbours
          const lo = (i > 0 ? cs[i - 1] : 0) + 0.1;
          const hi = (i < cs.length - 1 ? cs[i + 1] : duration) - 0.1;
          const clamped = Math.min(hi, Math.max(lo, t));
          return cs.map((c, j) => (j === i ? clamped : c));
        });
      }
    };
    const up = () => {
      drag.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [timeAt, duration, seek]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setPlayhead(v.currentTime);
    const onEnd = () => setPlaying(false);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('ended', onEnd);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('ended', onEnd);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setPlaying(false);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const bounds = [0, ...cuts, duration];
  const canCut =
    duration > 0 && bounds.every((b) => Math.abs(b - playhead) > 0.15);

  const addCut = useCallback(() => {
    if (!canCut) return;
    setCuts((cs) => {
      const next = [...cs, playhead].sort((a, b) => a - b);
      const at = next.indexOf(playhead);
      setParts((ps) => {
        const out = [...ps];
        // the segment at `at` was split in two; the new right half copies its label
        out.splice(at + 1, 0, ps[at] ?? 'a_roll');
        return out.map((p, i) => (ps.length === 1 ? defaultPart(i, out.length) : p));
      });
      return next;
    });
  }, [canCut, playhead]);

  const removeCut = useCallback((i: number) => {
    // merging segment i+1 into segment i: drop the cut and the right-hand label
    setCuts((cs) => cs.filter((_, j) => j !== i));
    setParts((ps) => ps.filter((_, j) => j !== i + 1));
  }, []);

  const pct = (t: number) => (duration ? (t / duration) * 100 : 0);

  const save = useCallback(() => {
    const segs: ManualSeg[] = parts.map((part, i) => ({
      part,
      startSec: Math.round(bounds[i] * 10) / 10,
      endSec: Math.round(bounds[i + 1] * 10) / 10,
      description: `${PART_LABEL[part] ?? part} (manual cut)`,
    }));
    onSave(segs);
  }, [parts, bounds, onSave]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="studio-node w-[680px] max-w-[92vw] rounded-2xl border border-white/10 bg-[#191919]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.7)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scissors className="h-4 w-4 text-white/70" />
            <span className="text-[13px] font-semibold text-white/90">Cut into parts — {title}</span>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* player */}
        <div className="relative overflow-hidden rounded-xl border border-white/8 bg-black">
          <video
            ref={videoRef}
            src={src}
            onLoadedMetadata={onMeta}
            onClick={togglePlay}
            playsInline
            className="mx-auto block max-h-[42vh] w-auto cursor-pointer"
          />
          <button
            onClick={togglePlay}
            className="absolute bottom-2 left-2 grid h-8 w-8 place-items-center rounded-lg bg-black/55 text-white/85 backdrop-blur-sm transition-colors hover:bg-black/75"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" fill="currentColor" />}
          </button>
        </div>

        {/* timeline: colored part segments + draggable cut markers + playhead */}
        <div className="mt-4 select-none">
          <div ref={trackRef} className="relative h-10 overflow-hidden rounded-lg bg-white/[0.04]">
            {parts.map((part, i) => (
              <div
                key={i}
                className="absolute inset-y-0"
                style={{
                  left: `${pct(bounds[i])}%`,
                  width: `${pct(bounds[i + 1]) - pct(bounds[i])}%`,
                  background: hexToRgba(PART_COLOR[part] ?? '#94a3b8', 0.22),
                }}
              />
            ))}
            {cuts.map((c, i) => (
              <div
                key={i}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  drag.current = i;
                }}
                className="absolute top-0 z-20 h-full w-3 -translate-x-1/2 cursor-ew-resize"
                style={{ left: `${pct(c)}%` }}
              >
                <div className="mx-auto h-full w-1 rounded-full bg-emerald-400" />
              </div>
            ))}
            {/* playhead */}
            <div
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                drag.current = 'playhead';
              }}
              className="absolute top-0 z-30 h-full w-3 -translate-x-1/2 cursor-grab active:cursor-grabbing"
              style={{ left: `${pct(playhead)}%` }}
            >
              <div className="mx-auto h-full w-px bg-white" />
              <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white" />
            </div>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] tabular-nums text-white/45">
            <span>{fmt(0)}</span>
            <span className="text-white/70">▮ {fmt(playhead)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>

        {/* segment list: label each part, merge unwanted cuts */}
        <div className="mt-3 max-h-[22vh] space-y-1 overflow-y-auto pr-0.5">
          {parts.map((part, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2 py-1">
              <span className="w-4 shrink-0 text-center text-[10px] text-white/35">{i + 1}</span>
              <select
                value={part}
                onChange={(e) => setParts((ps) => ps.map((p, j) => (j === i ? e.target.value : p)))}
                className="shrink-0 appearance-none rounded border-0 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide outline-none"
                style={{ background: hexToRgba(PART_COLOR[part] ?? '#94a3b8', 0.16), color: PART_COLOR[part] ?? '#94a3b8' }}
              >
                {PARTS.map((p) => (
                  <option key={p} value={p} className="bg-[#191919] text-white">{PART_LABEL[p]}</option>
                ))}
              </select>
              <button
                onClick={() => seek(bounds[i])}
                className="flex-1 text-left text-[10px] tabular-nums text-white/40 hover:text-white/70"
                title="Jump to segment start"
              >
                {fmt(bounds[i])} – {fmt(bounds[i + 1])} · {fmt(Math.max(0, bounds[i + 1] - bounds[i]))}
              </button>
              {i > 0 && (
                <button
                  onClick={() => removeCut(i - 1)}
                  title="Merge into previous part"
                  className="grid h-5 w-5 shrink-0 place-items-center rounded border border-white/10 bg-white/[0.04] text-white/45 transition-all hover:border-white/25 hover:bg-white/10 hover:text-white/90"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* actions */}
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-[11px] text-white/40">
            {parts.length} part{parts.length === 1 ? '' : 's'} · move the playhead, then add a cut
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={addCut}
              disabled={!canCut}
              title={canCut ? 'Cut at the playhead' : 'Move the playhead away from existing cuts'}
              className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/85 transition-colors hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> Add cut at {fmt(playhead)}
            </button>
            <button
              onClick={save}
              disabled={duration <= 0 || cuts.length === 0}
              title={cuts.length === 0 ? 'Add at least one cut first' : `Save ${parts.length} parts`}
              className="flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-[12px] font-semibold text-black transition-colors hover:bg-white disabled:opacity-40"
            >
              {duration <= 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scissors className="h-3.5 w-3.5" />}
              Save {parts.length} parts
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
