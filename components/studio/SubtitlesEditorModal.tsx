'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Captions, Play, Pause, Check, Loader2 } from 'lucide-react';

export interface SubtitleConfig {
  style: string;
  font: string;
  fontSize: number; // design px (720 ref)
  stroke: boolean;
  strokeWidth: number;
  strokeColor: string;
  position: 'top' | 'center' | 'bottom' | 'custom';
  customX: number; // 0..1 center
  customY: number; // 0..1 center
}

const STYLES = ['Bold', 'Boxed', 'Highlight', 'Bubble', 'Pop', 'Neon', 'Classic', 'Creator', 'Plain'];
const FONTS = ['Inter', 'Montserrat', 'Poppins', 'Oswald', 'Bebas Neue', 'Anton', 'Archivo Black', 'Roboto', 'Playfair', 'Lora'];
const FONT_CSS: Record<string, string> = {
  Inter: 'Inter, sans-serif', Montserrat: 'Montserrat, sans-serif', Poppins: 'Poppins, sans-serif',
  Oswald: 'Oswald, sans-serif', 'Bebas Neue': '"Bebas Neue", sans-serif', Anton: 'Anton, "Impact", sans-serif',
  'Archivo Black': '"Archivo Black", sans-serif', Roboto: 'Roboto, sans-serif',
  Playfair: '"Playfair Display", Georgia, serif', Lora: 'Lora, Georgia, serif',
};

const POS_XY: Record<'top' | 'center' | 'bottom', { x: number; y: number }> = {
  top: { x: 0.5, y: 0.12 }, center: { x: 0.5, y: 0.5 }, bottom: { x: 0.5, y: 0.85 },
};

export const DEFAULT_SUB_CONFIG: SubtitleConfig = {
  style: 'Bold', font: 'Montserrat', fontSize: 58, stroke: true, strokeWidth: 6, strokeColor: '#000000',
  position: 'bottom', customX: 0.5, customY: 0.85,
};

export function SubtitlesEditorModal({
  src,
  initial,
  busy,
  onApply,
  onClose,
}: {
  src: string | null;
  initial: SubtitleConfig;
  busy: boolean;
  onApply: (cfg: SubtitleConfig) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [cfg, setCfg] = useState<SubtitleConfig>(initial);
  const [playing, setPlaying] = useState(false);

  const set = (p: Partial<SubtitleConfig>) => setCfg((c) => ({ ...c, ...p }));

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().then(() => setPlaying(true)).catch(() => {});
    else { v.pause(); setPlaying(false); }
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  // drag the caption → custom position
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      const r = stageRef.current?.getBoundingClientRect();
      if (!r) return;
      const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      setCfg((c) => ({ ...c, position: 'custom', customX: x, customY: y }));
    };
    const up = () => { dragging.current = false; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);

  const px = cfg.position === 'custom' ? cfg.customX : POS_XY[cfg.position].x;
  const py = cfg.position === 'custom' ? cfg.customY : POS_XY[cfg.position].y;
  const stageW = stageRef.current?.clientWidth ?? 280;
  const previewSize = (cfg.fontSize * stageW) / 720; // match the burn's 720px design width
  const stroke = cfg.stroke
    ? `${cfg.strokeColor} 0 0 ${Math.max(1, cfg.strokeWidth / 3)}px, ${cfg.strokeColor} 0 0 ${Math.max(1, cfg.strokeWidth / 2)}px`
    : '0 1px 2px rgba(0,0,0,0.6)';

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 backdrop-blur-sm" onMouseDown={() => !busy && onClose()}>
      <div className="studio-node flex w-[760px] max-w-[95vw] gap-4 rounded-2xl border border-white/10 bg-[#15171c]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.7)]" onMouseDown={(e) => e.stopPropagation()}>
        {/* preview */}
        <div className="flex flex-col gap-2">
          <div ref={stageRef} className="relative aspect-[9/16] overflow-hidden rounded-xl border border-white/8 bg-black" style={{ width: 'min(38vh, 260px)' }}>
            <video ref={videoRef} src={src ?? undefined} onClick={togglePlay} playsInline className="absolute inset-0 h-full w-full cursor-pointer object-contain" />
            <div
              onPointerDown={(e) => { e.stopPropagation(); dragging.current = true; setCfg((c) => ({ ...c, position: 'custom' })); }}
              className="absolute cursor-move select-none whitespace-nowrap px-1 ring-1 ring-white/40"
              style={{
                left: `${px * 100}%`, top: `${py * 100}%`, transform: 'translate(-50%,-50%)',
                fontFamily: FONT_CSS[cfg.font], fontSize: previewSize, fontWeight: 800, color: '#fff', textShadow: stroke,
              }}
            >
              Sample caption
            </div>
            <button onClick={togglePlay} className="absolute bottom-2 left-2 grid h-8 w-8 place-items-center rounded-lg bg-black/55 text-white/85 backdrop-blur-sm hover:bg-black/75">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" fill="currentColor" />}
            </button>
          </div>
          <div className="text-center text-[10px] text-white/35">Drag the caption to place it anywhere.</div>
        </div>

        {/* controls */}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Captions className="h-4 w-4 text-white/70" /><span className="text-[13px] font-semibold text-white/90">Subtitles</span></div>
            <button onClick={onClose} disabled={busy} className="text-white/40 hover:text-white/80 disabled:opacity-40"><X className="h-4 w-4" /></button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-white/50">Style
              <select value={cfg.style} onChange={(e) => set({ style: e.target.value })} className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[12px] text-white/85 outline-none">
                {STYLES.map((s) => <option key={s} value={s} className="bg-[#15171c]">{s}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-white/50">Font
              <select value={cfg.font} onChange={(e) => set({ font: e.target.value })} className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[12px] text-white/85 outline-none">
                {FONTS.map((f) => <option key={f} value={f} className="bg-[#15171c]">{f}</option>)}
              </select>
            </label>
          </div>

          <label className="text-[11px] text-white/50">Font size
            <div className="mt-1 flex items-center gap-2">
              <input type="range" min={20} max={160} value={cfg.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} className="flex-1 accent-yellow-400" />
              <input type="number" min={8} max={400} value={cfg.fontSize} onChange={(e) => set({ fontSize: Math.max(8, Number(e.target.value) || 0) })} className="w-16 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[12px] text-white/85 outline-none" />
            </div>
          </label>

          {/* stroke */}
          <div className="rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
            <button onClick={() => set({ stroke: !cfg.stroke })} className="flex w-full items-center justify-between text-[11.5px] text-white/80">
              Stroke
              <span className={`relative h-4 w-7 rounded-full transition-colors ${cfg.stroke ? 'bg-emerald-500/80' : 'bg-white/15'}`}>
                <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${cfg.stroke ? 'left-3.5' : 'left-0.5'}`} />
              </span>
            </button>
            {cfg.stroke && (
              <div className="mt-2 flex items-center gap-3">
                <label className="flex flex-1 items-center gap-2 text-[10px] text-white/45">Width
                  <input type="range" min={1} max={24} value={cfg.strokeWidth} onChange={(e) => set({ strokeWidth: Number(e.target.value) })} className="flex-1 accent-yellow-400" />
                  <span className="w-6 text-right tabular-nums text-white/70">{cfg.strokeWidth}</span>
                </label>
                <label className="flex items-center gap-1.5 text-[10px] text-white/45">Color
                  <input type="color" value={cfg.strokeColor} onChange={(e) => set({ strokeColor: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-transparent" />
                </label>
              </div>
            )}
          </div>

          {/* position */}
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-white/35">Position</div>
            <div className="flex gap-1.5">
              {(['top', 'center', 'bottom'] as const).map((p) => (
                <button key={p} onClick={() => set({ position: p })} className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] capitalize transition-colors ${cfg.position === p ? 'border-yellow-400/50 bg-yellow-400/10 text-yellow-200' : 'border-white/10 text-white/60 hover:text-white/85'}`}>{p}</button>
              ))}
              <span className={`flex-1 rounded-md border px-2 py-1.5 text-center text-[11px] ${cfg.position === 'custom' ? 'border-yellow-400/50 bg-yellow-400/10 text-yellow-200' : 'border-white/10 text-white/40'}`}>Custom</span>
            </div>
          </div>

          <div className="mt-auto flex justify-end">
            <button onClick={() => onApply(cfg)} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-white/90 px-3.5 py-1.5 text-[12px] font-semibold text-black hover:bg-white disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Apply subtitles
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
