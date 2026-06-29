'use client';

import { Loader2, Download, X, CheckCircle2, AlertTriangle } from 'lucide-react';

/**
 * Floating output panel (bottom-right). Shows a spinner while a run is in flight,
 * the finished 9:16 ad (with download) on success, or a clear error on failure.
 */
export function OutputPanel({
  running,
  resultUrl,
  error,
  onClose,
}: {
  running: boolean;
  resultUrl: string | null;
  error: string | null;
  onClose: () => void;
}) {
  if (!running && !resultUrl && !error) return null;

  const title = running ? 'Rendering…' : error ? 'Run failed' : 'Ad ready';

  return (
    <div className="studio-node pointer-events-auto absolute bottom-4 right-4 z-30 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#15171c]/90 shadow-[0_16px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2.5">
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
        ) : error ? (
          <AlertTriangle className="h-4 w-4 text-red-400" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        )}
        <span className="flex-1 text-[12.5px] font-semibold text-white/90">{title}</span>
        <button onClick={onClose} className="text-white/30 hover:text-white/70">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-3">
        {error ? (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-2 text-[11.5px] leading-relaxed text-red-200">
            {error}
          </p>
        ) : resultUrl ? (
          <>
            <video src={resultUrl} controls autoPlay loop playsInline className="block w-full rounded-xl border border-white/5 bg-black/40" />
            <a
              href={resultUrl}
              download="ad-studio-output.mp4"
              className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-white/90 py-1.5 text-[12px] font-semibold text-black transition-colors hover:bg-white"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
          </>
        ) : (
          <div className="flex aspect-[9/16] w-full items-center justify-center rounded-xl border border-white/5 bg-black/30">
            <span className="text-[11px] text-white/40">Generating your ad…</span>
          </div>
        )}
      </div>
    </div>
  );
}
