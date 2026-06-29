'use client';

import { X, Loader2, Check, RefreshCw, AlertTriangle, Film, Sparkles } from 'lucide-react';
import type { Box } from '@/components/studio/CropVerifyModal';

export interface ScaleFrame {
  taskId: string;
  partId: string;
  persona: string;
  personaName: string;
  partLabel: string;
  clip: string;
  crop?: Box;
  image?: string;
  // character reference for THIS ad — the anchor frame's still, so every part of one ad
  // shows the same person in the same clothes. Falls back to the bare model image.
  reference?: string;
  status: 'pending' | 'generating' | 'done' | 'failed';
  approved: boolean;
}

export interface ScaleReview {
  phase: 'frames' | 'videos' | 'done';
  frames: ScaleFrame[];
  videoDone: number;
}

/**
 * Two-phase Scale review. Phase 1: every swap site's first frame is generated up front;
 * you approve/regenerate them all. Phase 2: render all approved swaps to video unattended.
 */
export function ScaleReviewPanel({
  review,
  onToggle,
  onRegenerate,
  onGenerateVideos,
  onClose,
}: {
  review: ScaleReview;
  onToggle: (taskId: string) => void;
  onRegenerate: (taskId: string) => void;
  onGenerateVideos: () => void;
  onClose: () => void;
}) {
  const { phase, frames, videoDone } = review;
  const resolved = frames.every((f) => f.status === 'done' || f.status === 'failed');
  const genDone = frames.filter((f) => f.status === 'done' || f.status === 'failed').length;
  const approvedCount = frames.filter((f) => f.approved && f.status === 'done').length;
  const reviewing = phase === 'frames';

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-black/50 backdrop-blur-sm" onMouseDown={() => phase !== 'videos' && onClose()}>
      <div className="flex max-h-[86vh] w-[760px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#15171c]/95 shadow-[0_24px_70px_rgba(0,0,0,0.6)] backdrop-blur-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
          {phase === 'done' ? <Check className="h-4 w-4 text-emerald-400" /> : <Sparkles className="h-4 w-4 text-violet-400" />}
          <span className="flex-1 text-[14px] font-semibold text-white/90">
            {phase === 'frames' && (resolved ? 'Review first frames' : 'Generating first frames…')}
            {phase === 'videos' && 'Rendering videos…'}
            {phase === 'done' && 'Scale complete'}
          </span>
          {phase !== 'videos' && (
            <button onClick={onClose} className="text-white/40 hover:text-white/80"><X className="h-4 w-4" /></button>
          )}
        </div>

        <div className="border-b border-white/8 px-4 py-2 text-[12px] text-white/55">
          {phase === 'frames' && (resolved ? `${approvedCount}/${frames.length} approved — approve or regenerate, then render` : `${genDone}/${frames.length} frames generated`)}
          {phase === 'videos' && `${videoDone}/${approvedCount} videos rendered — this runs in the background`}
          {phase === 'done' && `${videoDone} videos rendered onto their swap nodes`}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-4 gap-2.5">
            {frames.map((f) => {
              const dim = phase !== 'frames' && !(f.approved && f.status === 'done');
              return (
                <div key={f.taskId} className={`overflow-hidden rounded-xl border transition-all ${f.approved && f.status === 'done' ? 'border-violet-400/50' : 'border-white/8'} ${dim ? 'opacity-40' : ''}`}>
                  <div className="relative aspect-[9/16] bg-black/40">
                    {f.status === 'done' && f.image ? (
                      // low-res WebP thumbnail + lazy/async decode keeps the grid light at 100s of frames
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/thumb/${f.image}?w=240`} alt={f.partLabel} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : f.status === 'failed' ? (
                      <div className="flex h-full flex-col items-center justify-center gap-1 text-red-300/80"><AlertTriangle className="h-5 w-5" /><span className="text-[10px]">failed</span></div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-white/30"><Loader2 className="h-5 w-5 animate-spin" /></div>
                    )}
                    {reviewing && f.status === 'done' && (
                      <button
                        onClick={() => onToggle(f.taskId)}
                        title={f.approved ? 'Approved — click to exclude' : 'Excluded — click to approve'}
                        className={`absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full border text-white transition-colors ${f.approved ? 'border-violet-400 bg-violet-500' : 'border-white/30 bg-black/50'}`}
                      >
                        {f.approved && <Check className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {reviewing && (f.status === 'done' || f.status === 'failed') && (
                      <button
                        onClick={() => onRegenerate(f.taskId)}
                        title="Regenerate this frame"
                        className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full border border-white/20 bg-black/50 text-white/80 hover:text-white"
                      >
                        <RefreshCw className="h-3 w-3" />
                      </button>
                    )}
                    {phase === 'videos' && f.approved && f.status === 'done' && (
                      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-black/60 px-1.5 py-1 text-[9px] text-white/80"><Loader2 className="h-2.5 w-2.5 animate-spin" /> rendering</div>
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <div className="truncate text-[11px] font-medium text-white/85">{f.personaName}</div>
                    <div className="truncate text-[10px] text-white/40">{f.partLabel}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/8 px-4 py-3">
          <span className="text-[12px] text-white/45">
            {reviewing ? `${approvedCount} will render` : phase === 'videos' ? 'Rendering…' : 'All done'}
          </span>
          {phase === 'done' ? (
            <button onClick={onClose} className="rounded-xl bg-white/90 px-4 py-2 text-[13px] font-semibold text-black hover:bg-white">Done</button>
          ) : (
            <button
              onClick={onGenerateVideos}
              disabled={!reviewing || !resolved || approvedCount === 0}
              className="flex items-center gap-1.5 rounded-xl bg-white/90 px-4 py-2 text-[13px] font-semibold text-black transition-all hover:bg-white active:scale-95 disabled:opacity-40"
            >
              {phase === 'videos' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
              {phase === 'videos' ? 'Rendering…' : `Render ${approvedCount} ${approvedCount === 1 ? 'video' : 'videos'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
