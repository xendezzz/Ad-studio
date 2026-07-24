'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Type, Plus, Trash2, Play, Pause, Check, Loader2 } from 'lucide-react';

export interface TextItem {
  id: string;
  type: 'text' | 'emoji';
  text?: string;
  emoji?: string;
  font: string;
  size: number; // design px (engine scales to video width)
  x: number; // 0..1, center
  y: number; // 0..1, center
  startSec: number;
  endSec: number;
}

const FONTS = ['Inter', 'Montserrat', 'Poppins', 'Oswald', 'Bebas Neue', 'Anton', 'Archivo Black', 'Roboto', 'Playfair', 'Lora'];
const FONT_CSS: Record<string, string> = {
  Inter: 'Inter, sans-serif', Montserrat: 'Montserrat, sans-serif', Poppins: 'Poppins, sans-serif',
  Oswald: 'Oswald, sans-serif', 'Bebas Neue': '"Bebas Neue", sans-serif', Anton: 'Anton, "Impact", sans-serif',
  'Archivo Black': '"Archivo Black", sans-serif', Roboto: 'Roboto, sans-serif',
  Playfair: '"Playfair Display", Georgia, serif', Lora: 'Lora, Georgia, serif',
};
const EMOJIS = ['🔥', '🚀', '✨', '💯', '😂', '😍', '👀', '👍', '❤️', '🎉', '💡', '⚡', '✅', '❌', '💪', '🤯', '🙌', '👇', '🤝', '💰'];

const uid = () => `it-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

type Drag =
  | { mode: 'stage'; id: string; sx: number; sy: number; ix: number; iy: number }
  | { mode: 'bar' | 'l' | 'r'; id: string; sx: number; ss: number; se: number }
  | null;

export function TextEditorModal({
  src,
  initial,
  busy,
  onApply,
  onClose,
}: {
  src: string | null;
  initial: TextItem[];
  busy: boolean;
  onApply: (items: TextItem[]) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag>(null);
  const [items, setItems] = useState<TextItem[]>(initial);
  const [selId, setSelId] = useState<string | null>(initial[0]?.id ?? null);
  const [duration, setDuration] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);

  const sel = items.find((i) => i.id === selId) ?? null;
  const patch = useCallback((id: string, p: Partial<TextItem>) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }, []);

  const onMeta = useCallback(() => {
    const d = videoRef.current?.duration ?? 0;
    if (Number.isFinite(d) && d > 0) setDuration(d);
  }, []);
  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = t;
    setPlayhead(t);
  }, []);
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().then(() => setPlaying(true)).catch(() => {});
    else { v.pause(); setPlaying(false); }
  }, []);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setPlayhead(v.currentTime);
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  // drag (stage move + timeline move/resize)
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (d.mode === 'stage') {
        const r = stageRef.current?.getBoundingClientRect();
        if (!r) return;
        patch(d.id, { x: clamp01(d.ix + (e.clientX - d.sx) / r.width), y: clamp01(d.iy + (e.clientY - d.sy) / r.height) });
      } else {
        const r = trackRef.current?.getBoundingClientRect();
        if (!r || !duration) return;
        const dt = ((e.clientX - d.sx) / r.width) * duration;
        if (d.mode === 'bar') {
          const len = d.se - d.ss;
          let s = Math.max(0, Math.min(duration - len, d.ss + dt));
          patch(d.id, { startSec: s, endSec: s + len });
        } else if (d.mode === 'l') {
          patch(d.id, { startSec: Math.max(0, Math.min(d.se - 0.2, d.ss + dt)) });
        } else {
          patch(d.id, { endSec: Math.max(d.ss + 0.2, Math.min(duration, d.se + dt)) });
        }
      }
    };
    const up = () => { drag.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [duration, patch]);

  const addText = () => {
    const it: TextItem = { id: uid(), type: 'text', text: 'Text', font: 'Montserrat', size: 64, x: 0.5, y: 0.5, startSec: playhead, endSec: Math.min(duration || playhead + 2, playhead + 2) };
    setItems((xs) => [...xs, it]); setSelId(it.id);
  };
  const addEmoji = (emoji: string) => {
    const it: TextItem = { id: uid(), type: 'emoji', emoji, font: 'Montserrat', size: 96, x: 0.5, y: 0.4, startSec: playhead, endSec: Math.min(duration || playhead + 2, playhead + 2) };
    setItems((xs) => [...xs, it]); setSelId(it.id);
  };
  const del = (id: string) => { setItems((xs) => xs.filter((x) => x.id !== id)); if (selId === id) setSelId(null); };

  const pct = (t: number) => (duration ? (t / duration) * 100 : 0);
  const active = items.filter((i) => playhead >= i.startSec && playhead <= i.endSec);
  // preview scale: the burn engine sizes everything against a 720px design width,
  // so the editor must use the SAME reference so on-screen placement == the burn.
  const stageW = stageRef.current?.clientWidth ?? 320;
  const pxOf = (sizeDesign: number) => (sizeDesign * stageW) / 720;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 backdrop-blur-sm" onMouseDown={() => !busy && onClose()}>
      <div className="studio-node flex w-[920px] max-w-[95vw] flex-col gap-3 rounded-2xl border border-white/10 bg-[#191919]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.7)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Type className="h-4 w-4 text-white/70" /><span className="text-[13px] font-semibold text-white/90">Text & emojis</span></div>
          <button onClick={onClose} disabled={busy} className="text-white/40 hover:text-white/80 disabled:opacity-40"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex gap-3">
          {/* stage */}
          <div ref={stageRef} className="relative aspect-[9/16] max-h-[52vh] shrink-0 overflow-hidden rounded-xl border border-white/8 bg-black" style={{ width: 'min(36vh, 280px)' }}>
            <video ref={videoRef} src={src ?? undefined} onLoadedMetadata={onMeta} onClick={togglePlay} playsInline className="absolute inset-0 h-full w-full cursor-pointer object-contain" />
            {active.map((it) => (
              <div
                key={it.id}
                onPointerDown={(e) => { e.stopPropagation(); setSelId(it.id); drag.current = { mode: 'stage', id: it.id, sx: e.clientX, sy: e.clientY, ix: it.x, iy: it.y }; }}
                className={`absolute cursor-move select-none ${selId === it.id ? 'ring-1 ring-white/80' : ''}`}
                style={{ left: `${it.x * 100}%`, top: `${it.y * 100}%`, transform: 'translate(-50%,-50%)', whiteSpace: 'nowrap' }}
              >
                {it.type === 'text' ? (
                  <span style={{ fontFamily: FONT_CSS[it.font], fontSize: pxOf(it.size), fontWeight: 800, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)' }}>{it.text}</span>
                ) : (
                  <span style={{ fontSize: pxOf(it.size) }}>{it.emoji}</span>
                )}
              </div>
            ))}
            <button onClick={togglePlay} className="absolute bottom-2 left-2 grid h-8 w-8 place-items-center rounded-lg bg-black/55 text-white/85 backdrop-blur-sm hover:bg-black/75">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" fill="currentColor" />}
            </button>
          </div>

          {/* controls */}
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-0.5">
            <div className="flex flex-wrap gap-1.5">
              <button onClick={addText} className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-white/85 hover:bg-white/[0.09]"><Plus className="h-3.5 w-3.5" /> Text</button>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-white/35">Add emoji</div>
              <div className="grid grid-cols-10 gap-1">
                {EMOJIS.map((e) => (
                  <button key={e} onClick={() => addEmoji(e)} className="rounded-md py-1 text-[16px] hover:bg-white/10">{e}</button>
                ))}
              </div>
            </div>

            {sel ? (
              <div className="space-y-2 rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-white/70">{sel.type === 'text' ? 'Text' : 'Emoji'}</span>
                  <button onClick={() => del(sel.id)} className="flex items-center gap-1 text-[11px] text-red-300/80 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                </div>
                {sel.type === 'text' && (
                  <>
                    <input value={sel.text} onChange={(e) => patch(sel.id, { text: e.target.value })} placeholder="Your text…" className="w-full rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[12px] text-white/85 outline-none focus:border-white/30" />
                    <div className="flex items-center gap-2">
                      <select value={sel.font} onChange={(e) => patch(sel.id, { font: e.target.value })} className="flex-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[12px] text-white/85 outline-none">
                        {FONTS.map((f) => <option key={f} value={f} className="bg-[#191919]">{f}</option>)}
                      </select>
                    </div>
                  </>
                )}
                <label className="flex items-center gap-2 text-[11px] text-white/50">
                  Size
                  <input type="range" min={sel.type === 'emoji' ? 32 : 24} max={sel.type === 'emoji' ? 320 : 200} value={sel.size} onChange={(e) => patch(sel.id, { size: Number(e.target.value) })} className="flex-1 accent-white" />
                  <span className="w-8 text-right tabular-nums text-white/70">{sel.size}</span>
                </label>
                <div className="text-[10px] text-white/35">Drag on the video to position · drag the bar below to set when it shows ({fmt(sel.startSec)}–{fmt(sel.endSec)}).</div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-white/12 p-3 text-center text-[11px] text-white/35">Add or select a text / emoji to edit it.</div>
            )}
          </div>
        </div>

        {/* timeline */}
        <div className="select-none">
          <div ref={trackRef} className="relative rounded-lg bg-white/[0.04] p-1" style={{ minHeight: 16 + items.length * 22 }}
            onPointerDown={(e) => {
              if (!trackRef.current || !duration) return;
              const r = trackRef.current.getBoundingClientRect();
              seek(Math.max(0, Math.min(duration, ((e.clientX - r.left) / r.width) * duration)));
            }}>
            {items.map((it, row) => (
              <div
                key={it.id}
                onPointerDown={(e) => { e.stopPropagation(); setSelId(it.id); drag.current = { mode: 'bar', id: it.id, sx: e.clientX, ss: it.startSec, se: it.endSec }; }}
                className={`absolute h-[18px] cursor-grab rounded-md text-[9px] leading-[18px] active:cursor-grabbing ${selId === it.id ? 'bg-emerald-400/30 ring-1 ring-emerald-400/60' : 'bg-white/15'}`}
                style={{ top: 4 + row * 22, left: `${pct(it.startSec)}%`, width: `${Math.max(2, pct(it.endSec - it.startSec))}%` }}
              >
                <span className="pointer-events-none ml-1.5 truncate text-white/80">{it.type === 'text' ? (it.text || 'Text') : it.emoji}</span>
                <span onPointerDown={(e) => { e.stopPropagation(); drag.current = { mode: 'l', id: it.id, sx: e.clientX, ss: it.startSec, se: it.endSec }; }} className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize rounded-l-md bg-white/40" />
                <span onPointerDown={(e) => { e.stopPropagation(); drag.current = { mode: 'r', id: it.id, sx: e.clientX, ss: it.startSec, se: it.endSec }; }} className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize rounded-r-md bg-white/40" />
              </div>
            ))}
            {/* playhead */}
            <div className="pointer-events-none absolute top-0 h-full w-px bg-white" style={{ left: `${pct(playhead)}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[10px] tabular-nums text-white/40"><span>0:00.0</span><span>▮ {fmt(playhead)}</span><span>{fmt(duration)}</span></div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button onClick={() => onApply(items)} disabled={busy || !items.length} className="flex items-center gap-1.5 rounded-lg bg-white/90 px-3.5 py-1.5 text-[12px] font-semibold text-black hover:bg-white disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Apply
          </button>
        </div>
      </div>
    </div>
  );
}
