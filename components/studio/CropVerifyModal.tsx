'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Crop, Check, Loader2, Wand2 } from 'lucide-react';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
type Mode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | null;

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Confirm / adjust the creator's crop box over the PiP frame before reconstruction.
 * Box is normalized [0,1] relative to the frame. Drag the box to move, corners to resize.
 */
export function CropVerifyModal({
  src,
  initial,
  busy,
  onConfirm,
  onClose,
  onAutoDetect,
}: {
  src: string | null;
  initial: Box;
  busy: boolean;
  onConfirm: (box: Box) => void;
  onClose: () => void;
  onAutoDetect?: () => Promise<Box | null>;
}) {
  // box follows `initial` until the user starts adjusting (then `edited` takes over)
  const [edited, setEdited] = useState<Box | null>(null);
  const [detecting, setDetecting] = useState(false);
  const box = edited ?? initial;

  const runAutoDetect = useCallback(async () => {
    if (!onAutoDetect) return;
    setDetecting(true);
    try {
      const b = await onAutoDetect();
      if (b) setEdited(b);
    } finally {
      setDetecting(false);
    }
  }, [onAutoDetect]);
  const areaRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: Mode; sx: number; sy: number; start: Box }>({ mode: null, sx: 0, sy: 0, start: initial });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const beginDrag = useCallback((mode: Mode, e: React.PointerEvent, current: Box) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: current };
  }, []);
  const start = (mode: Mode) => (e: React.PointerEvent) => beginDrag(mode, e, box);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      const area = areaRef.current;
      if (!d.mode || !area) return;
      const r = area.getBoundingClientRect();
      const dx = (e.clientX - d.sx) / r.width;
      const dy = (e.clientY - d.sy) / r.height;
      const s = d.start;
      let { x, y, w, h } = s;
      if (d.mode === 'move') {
        x = clamp(s.x + dx);
        y = clamp(s.y + dy);
        x = Math.min(x, 1 - s.w);
        y = Math.min(y, 1 - s.h);
      } else {
        // resize from the dragged corner, keeping the opposite corner anchored
        let left = s.x;
        let top = s.y;
        let right = s.x + s.w;
        let bottom = s.y + s.h;
        if (d.mode === 'nw') { left = clamp(s.x + dx); top = clamp(s.y + dy); }
        if (d.mode === 'ne') { right = clamp(right + dx); top = clamp(s.y + dy); }
        if (d.mode === 'sw') { left = clamp(s.x + dx); bottom = clamp(bottom + dy); }
        if (d.mode === 'se') { right = clamp(right + dx); bottom = clamp(bottom + dy); }
        x = Math.min(left, right);
        y = Math.min(top, bottom);
        w = Math.max(0.04, Math.abs(right - left));
        h = Math.max(0.04, Math.abs(bottom - top));
      }
      setEdited({ x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) });
    };
    const up = () => { drag.current.mode = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  const pct = useCallback((n: number) => `${n * 100}%`, []);
  const handle = 'absolute h-3 w-3 rounded-full bg-white border border-black/40 shadow';

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 backdrop-blur-sm" onMouseDown={() => !busy && onClose()}>
      <div
        className="studio-node w-[460px] max-w-[92vw] rounded-2xl border border-white/10 bg-[#15171c]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.7)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crop className="h-4 w-4 text-white/70" />
            <span className="text-[13px] font-semibold text-white/90">Confirm creator crop</span>
          </div>
          <button onClick={onClose} disabled={busy} className="text-white/40 hover:text-white/80 disabled:opacity-40">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={areaRef} className="relative mx-auto aspect-[9/16] max-h-[56vh] w-auto select-none overflow-hidden rounded-xl border border-white/8 bg-black">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="pip frame" className="pointer-events-none h-full w-full object-contain" draggable={false} />
          ) : (
            <div className="grid h-full place-items-center text-white/45"><Loader2 className="h-6 w-6 animate-spin" /></div>
          )}
          {/* dim outside the box */}
          <div className="pointer-events-none absolute inset-0 bg-black/45" style={{
            clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${pct(box.y)}, ${pct(box.x)} ${pct(box.y)}, ${pct(box.x)} ${pct(box.y + box.h)}, ${pct(box.x + box.w)} ${pct(box.y + box.h)}, ${pct(box.x + box.w)} ${pct(box.y)}, 0 ${pct(box.y)})`,
          }} />
          {/* crop box */}
          <div
            onPointerDown={start('move')}
            className="absolute cursor-move border-2 border-emerald-400"
            style={{ left: pct(box.x), top: pct(box.y), width: pct(box.w), height: pct(box.h) }}
          >
            <div onPointerDown={start('nw')} className={`${handle} -left-1.5 -top-1.5 cursor-nwse-resize`} />
            <div onPointerDown={start('ne')} className={`${handle} -right-1.5 -top-1.5 cursor-nesw-resize`} />
            <div onPointerDown={start('sw')} className={`${handle} -bottom-1.5 -left-1.5 cursor-nesw-resize`} />
            <div onPointerDown={start('se')} className={`${handle} -bottom-1.5 -right-1.5 cursor-nwse-resize`} />
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-white/40">
          Drag the box around just the creator inset. We&rsquo;ll crop them out, swap the face, remove the
          background, and composite them over your app demo.
        </p>

        <div className="mt-3 flex items-center justify-end gap-2">
          {onAutoDetect && (
            <button
              onClick={runAutoDetect}
              disabled={busy || detecting || !src}
              title="Let AI guess the creator's box (you can still adjust it)"
              className="mr-auto flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/85 transition-colors hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {detecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              Auto-detect
            </button>
          )}
          <button
            onClick={() => onConfirm(box)}
            disabled={busy || !src}
            className="flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-[12px] font-semibold text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Use this crop
          </button>
        </div>
      </div>
    </div>
  );
}
