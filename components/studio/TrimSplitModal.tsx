'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Play, Pause, Scissors, SplitSquareHorizontal, Loader2 } from 'lucide-react';

type Drag = 'in' | 'out' | 'playhead' | null;

function fmt(t: number): string {
  if (!Number.isFinite(t)) return '0:00.0';
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/**
 * Trim / Split editor for a single video node.
 * - Drag the in/out handles to set a selection; "Clip" trims this node to it.
 * - Drag the playhead; "Split here" cuts the selection into two at the playhead.
 * The parent owns the actual ffmpeg calls (via onClip / onSplit) and the busy flag.
 */
export function TrimSplitModal({
  src,
  title,
  busy,
  onClip,
  onSplit,
  onClose,
  initialIn,
  initialOut,
}: {
  src: string;
  title: string;
  busy: boolean;
  onClip: (start: number, end: number) => void;
  onSplit: (start: number, mid: number, end: number) => void;
  onClose: () => void;
  // when the video is the FULL source (segment cut by AI): pre-position the handles at the
  // cut range; the user can drag them out to reclaim trimmed portions.
  initialIn?: number;
  initialOut?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(0);
  const [inT, setInT] = useState(0);
  const [outT, setOutT] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const drag = useRef<Drag>(null);

  // init bounds once metadata is known — start the selection at the AI-cut range if given
  const onMeta = useCallback(() => {
    const d = videoRef.current?.duration ?? 0;
    if (Number.isFinite(d) && d > 0) {
      setDuration(d);
      const i = Math.max(0, Math.min(initialIn ?? 0, d));
      const o = Math.min(d, initialOut != null ? initialOut : d);
      setInT(i);
      setOutT(o > i ? o : d);
      setPlayhead(i);
      const v = videoRef.current;
      if (v) v.currentTime = i;
    }
  }, [initialIn, initialOut]);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = t;
    setPlayhead(t);
  }, []);

  // pointer → time, clamped to [0, duration]
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
      if (!drag.current) return;
      const t = timeAt(e.clientX);
      if (drag.current === 'in') {
        setInT(Math.min(t, outT - 0.1));
        if (playhead < t) seek(t);
      } else if (drag.current === 'out') {
        setOutT(Math.max(t, inT + 0.1));
        if (playhead > t) seek(t);
      } else {
        seek(Math.min(outT, Math.max(inT, t)));
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
  }, [timeAt, inT, outT, playhead, seek]);

  // keep playhead in sync while playing; loop within the selection
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (v.currentTime >= outT) {
        v.pause();
        v.currentTime = inT;
        setPlaying(false);
      }
      setPlayhead(v.currentTime);
    };
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [inT, outT]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < inT || v.currentTime >= outT) v.currentTime = inT;
      v.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setPlaying(false);
    }
  }, [inT, outT]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const pct = (t: number) => (duration ? (t / duration) * 100 : 0);
  const startHandle = (which: Drag) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = which;
  };
  const canSplit = playhead > inT + 0.1 && playhead < outT - 0.1;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 backdrop-blur-sm" onMouseDown={() => !busy && onClose()}>
      <div
        className="studio-node w-[640px] max-w-[92vw] rounded-2xl border border-white/10 bg-[#15171c]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.7)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scissors className="h-4 w-4 text-white/70" />
            <span className="text-[13px] font-semibold text-white/90">Trim / Split — {title}</span>
          </div>
          <button onClick={onClose} disabled={busy} className="text-white/40 hover:text-white/80 disabled:opacity-40">
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
            className="mx-auto block max-h-[46vh] w-auto cursor-pointer"
          />
          <button
            onClick={togglePlay}
            className="absolute bottom-2 left-2 grid h-8 w-8 place-items-center rounded-lg bg-black/55 text-white/85 backdrop-blur-sm transition-colors hover:bg-black/75"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" fill="currentColor" />}
          </button>
        </div>

        {/* timeline */}
        <div className="mt-4 select-none">
          <div ref={trackRef} className="relative h-10 rounded-lg bg-white/[0.04]">
            {/* selection */}
            <div
              className="absolute inset-y-0 rounded-md bg-white/[0.08]"
              style={{ left: `${pct(inT)}%`, right: `${100 - pct(outT)}%` }}
            />
            {/* dimmed outside */}
            <div className="absolute inset-y-0 left-0 rounded-l-lg bg-black/40" style={{ width: `${pct(inT)}%` }} />
            <div className="absolute inset-y-0 right-0 rounded-r-lg bg-black/40" style={{ width: `${100 - pct(outT)}%` }} />

            {/* in handle */}
            <div
              onPointerDown={startHandle('in')}
              className="absolute top-0 z-20 h-full w-3 -translate-x-1/2 cursor-ew-resize"
              style={{ left: `${pct(inT)}%` }}
            >
              <div className="mx-auto h-full w-1 rounded-full bg-emerald-400" />
            </div>
            {/* out handle */}
            <div
              onPointerDown={startHandle('out')}
              className="absolute top-0 z-20 h-full w-3 -translate-x-1/2 cursor-ew-resize"
              style={{ left: `${pct(outT)}%` }}
            >
              <div className="mx-auto h-full w-1 rounded-full bg-emerald-400" />
            </div>
            {/* playhead */}
            <div
              onPointerDown={startHandle('playhead')}
              className="absolute top-0 z-30 h-full w-3 -translate-x-1/2 cursor-grab active:cursor-grabbing"
              style={{ left: `${pct(playhead)}%` }}
            >
              <div className="mx-auto h-full w-px bg-white" />
              <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white" />
            </div>
          </div>

          {/* time labels */}
          <div className="mt-1.5 flex items-center justify-between text-[10px] tabular-nums text-white/45">
            <span>in {fmt(inT)}</span>
            <span className="text-white/70">▮ {fmt(playhead)}</span>
            <span>out {fmt(outT)}</span>
          </div>
        </div>

        {/* actions */}
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-[11px] text-white/40">
            {initialOut != null ? 'Full source · drag handles to reclaim cut parts · ' : ''}Selection {fmt(Math.max(0, outT - inT))}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSplit(inT, playhead, outT)}
              disabled={busy || !canSplit}
              title={canSplit ? 'Split into two nodes at the playhead' : 'Move the playhead inside the selection'}
              className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/85 transition-colors hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SplitSquareHorizontal className="h-3.5 w-3.5" /> Split here
            </button>
            <button
              onClick={() => onClip(inT, outT)}
              disabled={busy || outT - inT < 0.1}
              className="flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-[12px] font-semibold text-black transition-colors hover:bg-white disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scissors className="h-3.5 w-3.5" />}
              Clip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
