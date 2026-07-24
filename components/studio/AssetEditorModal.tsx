'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Image as ImageIcon, Upload, Trash2, Play, Pause, Check, Loader2 } from 'lucide-react';
import { uploadAsset } from '@/lib/uploadAsset';

export type AssetKind = 'image' | 'gif' | 'video';

export interface AssetItem {
  id: string;
  path: string; // Storage path
  url: string; // serve URL (for preview)
  kind: AssetKind;
  x: number; // 0..1 center
  y: number; // 0..1 center
  w: number; // design px (720 ref)
  h: number; // design px
  startSec: number;
  endSec: number;
  // crop a region of the asset (fractions of the asset frame)
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  // video assets only
  assetDur?: number; // source duration (for the trim UI)
  trimStart?: number;
  trimEnd?: number;
  muted?: boolean;
}

const uid = () => `as-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

function kindOf(name: string): AssetKind {
  const e = (name.split('.').pop() || '').toLowerCase();
  if (e === 'gif') return 'gif';
  if (['mp4', 'mov', 'webm', 'm4v'].includes(e)) return 'video';
  return 'image';
}

type Drag =
  | { mode: 'stage'; id: string; sx: number; sy: number; ix: number; iy: number }
  | { mode: 'resize'; id: string; sx: number; iw: number; ih: number }
  | { mode: 'bar' | 'l' | 'r'; id: string; sx: number; ss: number; se: number }
  | { mode: 'cmove'; id: string; sx: number; sy: number; ix: number; iy: number }
  | { mode: 'cresize'; id: string; sx: number; sy: number; iw: number; ih: number }
  | null;

export function AssetEditorModal({
  src,
  initial,
  busy,
  onApply,
  onClose,
}: {
  src: string | null;
  initial: AssetItem[];
  busy: boolean;
  onApply: (items: AssetItem[]) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cropRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag>(null);
  const [items, setItems] = useState<AssetItem[]>(initial);
  const [selId, setSelId] = useState<string | null>(initial[0]?.id ?? null);
  const [duration, setDuration] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [uploading, setUploading] = useState(false);

  const sel = items.find((i) => i.id === selId) ?? null;
  const patch = useCallback((id: string, p: Partial<AssetItem>) => {
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

  // drag: stage move, corner resize, timeline move/resize
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (d.mode === 'stage') {
        const r = stageRef.current?.getBoundingClientRect();
        if (!r) return;
        patch(d.id, { x: clamp01(d.ix + (e.clientX - d.sx) / r.width), y: clamp01(d.iy + (e.clientY - d.sy) / r.height) });
      } else if (d.mode === 'resize') {
        const stageW = stageRef.current?.clientWidth ?? 320;
        const deltaDesign = ((e.clientX - d.sx) / stageW) * 720; // px→design
        const nw = Math.max(24, d.iw + deltaDesign);
        patch(d.id, { w: Math.round(nw), h: Math.round(nw * (d.ih / d.iw)) }); // keep aspect
      } else if (d.mode === 'cmove' || d.mode === 'cresize') {
        const r = cropRef.current?.getBoundingClientRect();
        if (!r) return;
        const dx = (e.clientX - d.sx) / r.width;
        const dy = (e.clientY - d.sy) / r.height;
        if (d.mode === 'cmove') {
          const cur = items.find((i) => i.id === d.id)!;
          patch(d.id, { cropX: Math.max(0, Math.min(1 - cur.cropW, d.ix + dx)), cropY: Math.max(0, Math.min(1 - cur.cropH, d.iy + dy)) });
        } else {
          const cur = items.find((i) => i.id === d.id)!;
          patch(d.id, { cropW: Math.max(0.05, Math.min(1 - cur.cropX, d.iw + dx)), cropH: Math.max(0.05, Math.min(1 - cur.cropY, d.ih + dy)) });
        }
      } else {
        const r = trackRef.current?.getBoundingClientRect();
        if (!r || !duration) return;
        const dt = ((e.clientX - d.sx) / r.width) * duration;
        if (d.mode === 'bar') {
          const len = d.se - d.ss;
          const s = Math.max(0, Math.min(duration - len, d.ss + dt));
          patch(d.id, { startSec: s, endSec: s + len });
          // vertical drag reorders the layer stack (After Effects style: top row = front)
          const displayRow = Math.max(0, Math.min(items.length - 1, Math.round((e.clientY - r.top - 4) / 22)));
          setItems((xs) => {
            const from = xs.findIndex((x) => x.id === d.id);
            const to = xs.length - 1 - displayRow; // top row → last array index (front)
            if (from < 0 || to < 0 || from === to) return xs;
            const next = xs.slice();
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
          });
        } else if (d.mode === 'l') patch(d.id, { startSec: Math.max(0, Math.min(d.se - 0.2, d.ss + dt)) });
        else patch(d.id, { endSec: Math.max(d.ss + 0.2, Math.min(duration, d.se + dt)) });
      }
    };
    const up = () => { drag.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [duration, patch, items]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadAsset(file, 'assets');
      const kind = kindOf(file.name);
      // natural aspect + (for video) duration, for sensible defaults
      const meta = await assetMeta(file, kind);
      const w = 200;
      const it: AssetItem = {
        id: uid(), path, url: `/api/serve/${path}`, kind,
        x: 0.5, y: 0.5, w, h: Math.round(w / meta.aspect),
        startSec: playhead, endSec: Math.min(duration || playhead + 3, playhead + 3),
        cropX: 0, cropY: 0, cropW: 1, cropH: 1,
        ...(kind === 'video' ? { assetDur: meta.dur, trimStart: 0, trimEnd: meta.dur, muted: true } : {}),
      };
      setItems((xs) => [...xs, it]);
      setSelId(it.id);
    } catch (err) {
      console.error('[asset upload]', err);
    } finally {
      setUploading(false);
    }
  }
  const del = (id: string) => { setItems((xs) => xs.filter((x) => x.id !== id)); if (selId === id) setSelId(null); };

  const pct = (t: number) => (duration ? (t / duration) * 100 : 0);
  const active = items.filter((i) => playhead >= i.startSec && playhead <= i.endSec);
  const stageW = stageRef.current?.clientWidth ?? 320;
  const pxOf = (design: number) => (design * stageW) / 720;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 backdrop-blur-sm" onMouseDown={() => !busy && onClose()}>
      <div className="studio-node flex w-[920px] max-w-[95vw] flex-col gap-3 rounded-2xl border border-white/10 bg-[#191919]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.7)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-white/70" /><span className="text-[13px] font-semibold text-white/90">Assets — image / gif / video</span></div>
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
                className={`absolute cursor-move select-none ${selId === it.id ? 'ring-1 ring-sky-400' : ''}`}
                style={{ left: `${it.x * 100}%`, top: `${it.y * 100}%`, width: pxOf(it.w), height: pxOf(it.h), transform: 'translate(-50%,-50%)' }}
              >
                {it.kind === 'video' ? (
                  <video src={it.url} muted loop autoPlay playsInline className="h-full w-full object-contain" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.url} alt="" className="h-full w-full object-contain" />
                )}
                {selId === it.id && (
                  <span
                    onPointerDown={(e) => { e.stopPropagation(); drag.current = { mode: 'resize', id: it.id, sx: e.clientX, iw: it.w, ih: it.h }; }}
                    className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-black/40 bg-sky-400"
                  />
                )}
              </div>
            ))}
            <button onClick={togglePlay} className="absolute bottom-2 left-2 grid h-8 w-8 place-items-center rounded-lg bg-black/55 text-white/85 backdrop-blur-sm hover:bg-black/75">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" fill="currentColor" />}
            </button>
          </div>

          {/* controls */}
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-0.5">
            <input ref={fileRef} type="file" hidden accept="image/*,video/*,.gif,.svg" onChange={onPickFile} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-2.5 py-2 text-[12px] text-white/60 hover:border-white/30 hover:text-white/85 disabled:opacity-60">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploading ? 'Uploading…' : 'Add asset (image · gif · video · svg)'}
            </button>

            {sel ? (
              <div className="space-y-2 rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium capitalize text-white/70">{sel.kind}</span>
                  <button onClick={() => del(sel.id)} className="flex items-center gap-1 text-[11px] text-red-300/80 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                </div>
                <label className="flex items-center gap-2 text-[11px] text-white/50">
                  Size
                  <input type="range" min={40} max={640} value={sel.w} onChange={(e) => { const nw = Number(e.target.value); patch(sel.id, { w: nw, h: Math.round(nw * (sel.h / sel.w)) }); }} className="flex-1 accent-sky-400" />
                  <span className="w-8 text-right tabular-nums text-white/70">{sel.w}</span>
                </label>

                {/* crop box — all asset types */}
                <div>
                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-white/35">
                    <span>Crop</span>
                    <button onClick={() => patch(sel.id, { cropX: 0, cropY: 0, cropW: 1, cropH: 1 })} className="text-[9px] text-white/40 hover:text-white/70">reset</button>
                  </div>
                  <div ref={cropRef} className="relative mx-auto max-h-32 w-full max-w-[160px] overflow-hidden rounded-md border border-white/8 bg-black" style={{ aspectRatio: `${sel.w} / ${sel.h}` }}>
                    {sel.kind === 'video'
                      ? <video src={sel.url} muted loop autoPlay playsInline className="absolute inset-0 h-full w-full object-contain opacity-70" />
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={sel.url} alt="" className="absolute inset-0 h-full w-full object-contain opacity-70" />}
                    {/* dim outside the crop */}
                    <div className="absolute inset-0 bg-black/50" />
                    <div
                      onPointerDown={(e) => { e.stopPropagation(); drag.current = { mode: 'cmove', id: sel.id, sx: e.clientX, sy: e.clientY, ix: sel.cropX, iy: sel.cropY }; }}
                      className="absolute cursor-move border border-sky-400 shadow-[0_0_0_9999px_rgba(0,0,0,0)] "
                      style={{ left: `${sel.cropX * 100}%`, top: `${sel.cropY * 100}%`, width: `${sel.cropW * 100}%`, height: `${sel.cropH * 100}%`, boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)' }}
                    >
                      <span
                        onPointerDown={(e) => { e.stopPropagation(); drag.current = { mode: 'cresize', id: sel.id, sx: e.clientX, sy: e.clientY, iw: sel.cropW, ih: sel.cropH }; }}
                        className="absolute -bottom-1 -right-1 h-2.5 w-2.5 cursor-nwse-resize rounded-sm border border-black/40 bg-sky-400"
                      />
                    </div>
                  </div>
                </div>

                {/* video-only: mute + trim */}
                {sel.kind === 'video' && (
                  <>
                    <button onClick={() => patch(sel.id, { muted: !(sel.muted ?? true) })} className="flex w-full items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[11px] text-white/75 hover:border-white/20">
                      <span>Mute asset audio</span>
                      <span className={`relative h-4 w-7 rounded-full transition-colors ${(sel.muted ?? true) ? 'bg-emerald-500/80' : 'bg-white/15'}`}>
                        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${(sel.muted ?? true) ? 'left-3.5' : 'left-0.5'}`} />
                      </span>
                    </button>
                    {(sel.assetDur ?? 0) > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase tracking-wider text-white/35">Trim source · {fmt(sel.trimStart ?? 0)}–{fmt(sel.trimEnd ?? sel.assetDur ?? 0)}</div>
                        <label className="flex items-center gap-2 text-[10px] text-white/45">In
                          <input type="range" min={0} max={sel.assetDur} step={0.1} value={sel.trimStart ?? 0} onChange={(e) => patch(sel.id, { trimStart: Math.min(Number(e.target.value), (sel.trimEnd ?? sel.assetDur!) - 0.2) })} className="flex-1 accent-sky-400" /></label>
                        <label className="flex items-center gap-2 text-[10px] text-white/45">Out
                          <input type="range" min={0} max={sel.assetDur} step={0.1} value={sel.trimEnd ?? sel.assetDur} onChange={(e) => patch(sel.id, { trimEnd: Math.max(Number(e.target.value), (sel.trimStart ?? 0) + 0.2) })} className="flex-1 accent-sky-400" /></label>
                      </div>
                    )}
                  </>
                )}

                <div className="text-[10px] text-white/35">Drag on the video to position · drag the corner to resize · drag the bar below to set when it shows ({fmt(sel.startSec)}–{fmt(sel.endSec)}).</div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-white/12 p-3 text-center text-[11px] text-white/35">Add or select an asset to edit it.</div>
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
            {items.map((it, arrIdx) => {
              const row = items.length - 1 - arrIdx; // front (last in array) shows at the TOP row
              return (
              <div
                key={it.id}
                onPointerDown={(e) => { e.stopPropagation(); setSelId(it.id); drag.current = { mode: 'bar', id: it.id, sx: e.clientX, ss: it.startSec, se: it.endSec }; }}
                className={`absolute h-[18px] cursor-grab rounded-md text-[9px] leading-[18px] active:cursor-grabbing ${selId === it.id ? 'bg-sky-400/30 ring-1 ring-sky-400/60' : 'bg-white/15'}`}
                style={{ top: 4 + row * 22, left: `${pct(it.startSec)}%`, width: `${Math.max(2, pct(it.endSec - it.startSec))}%` }}
              >
                <span className="pointer-events-none ml-1.5 truncate capitalize text-white/80">{it.kind}{arrIdx === items.length - 1 ? ' · front' : arrIdx === 0 && items.length > 1 ? ' · back' : ''}</span>
                <span onPointerDown={(e) => { e.stopPropagation(); drag.current = { mode: 'l', id: it.id, sx: e.clientX, ss: it.startSec, se: it.endSec }; }} className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize rounded-l-md bg-white/40" />
                <span onPointerDown={(e) => { e.stopPropagation(); drag.current = { mode: 'r', id: it.id, sx: e.clientX, ss: it.startSec, se: it.endSec }; }} className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize rounded-r-md bg-white/40" />
              </div>
            ); })}
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

/** Read an uploaded asset's aspect ratio (and duration, for video) for sensible defaults. */
function assetMeta(file: File, kind: AssetKind): Promise<{ aspect: number; dur: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const done = (a: number, d: number) => { URL.revokeObjectURL(url); resolve({ aspect: a > 0 && Number.isFinite(a) ? a : 1, dur: Number.isFinite(d) && d > 0 ? d : 0 }); };
    if (kind === 'video') {
      const v = document.createElement('video');
      v.onloadedmetadata = () => done(v.videoWidth / v.videoHeight, v.duration);
      v.onerror = () => done(1, 0);
      v.src = url;
    } else {
      const img = new window.Image();
      img.onload = () => done(img.naturalWidth / img.naturalHeight, 0);
      img.onerror = () => done(1, 0);
      img.src = url;
    }
  });
}
