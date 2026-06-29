'use client';

import { useEffect } from 'react';
import { X, Check, RefreshCw, Loader2, Wand2 } from 'lucide-react';

type Stage = 'image' | 'video' | 'idle';

/**
 * Verify the persona-swapped first frame before committing to the video generation.
 * - stage 'image': the first frame is still rendering (spinner, no actions).
 * - stage 'idle':  frame ready → Approve & Generate Video / Regenerate.
 * - stage 'video': motion-control is generating the final clip (locked).
 */
export function FirstFrameModal({
  src,
  stage,
  onApprove,
  onRegenerate,
  onClose,
}: {
  src: string | null;
  stage: Stage;
  onApprove: () => void;
  onRegenerate: () => void;
  onClose: () => void;
}) {
  const locked = stage === 'video';
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, locked]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 backdrop-blur-sm" onMouseDown={() => !locked && onClose()}>
      <div
        className="studio-node w-[460px] max-w-[92vw] rounded-2xl border border-white/10 bg-[#15171c]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.7)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-white/70" />
            <span className="text-[13px] font-semibold text-white/90">Verify first frame</span>
          </div>
          <button onClick={onClose} disabled={locked} className="text-white/40 hover:text-white/80 disabled:opacity-40">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* preview */}
        <div className="relative grid aspect-[9/16] max-h-[56vh] place-items-center overflow-hidden rounded-xl border border-white/8 bg-black">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="first frame" className="h-full w-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-white/45">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-[12px]">Generating first frame…</span>
            </div>
          )}
          {locked && (
            <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2 text-white/80">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-[12px]">Generating video…</span>
              </div>
            </div>
          )}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-white/40">
          This is the persona swapped onto the clip&rsquo;s opening frame. Approve it to generate the full
          motion-control video, or regenerate for another take.
        </p>

        {/* actions */}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            onClick={onRegenerate}
            disabled={stage !== 'idle'}
            className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/85 transition-colors hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Regenerate
          </button>
          <button
            onClick={onApprove}
            disabled={stage !== 'idle' || !src}
            className="flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-[12px] font-semibold text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {stage === 'video' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Approve &amp; Generate Video
          </button>
        </div>
      </div>
    </div>
  );
}
