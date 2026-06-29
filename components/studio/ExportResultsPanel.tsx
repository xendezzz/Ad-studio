'use client';

import { X, Download, CheckCircle2 } from 'lucide-react';

/** Sanitize a model/project name into a safe, meaningful filename. */
function fileName(projectName: string | undefined, modelName: string): string {
  const base = [projectName, modelName].filter(Boolean).join(' - ') || 'ad';
  return `${base.replace(/[^a-z0-9 _-]+/gi, '').replace(/\s+/g, '-')}.mp4`;
}

/** Results of an "Export all" run — one row per export node, named by its model. */
export function ExportResultsPanel({
  results,
  projectName,
  onClose,
}: {
  results: { name: string; path: string }[];
  projectName?: string;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-black/50 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="flex max-h-[80vh] w-[480px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#15171c]/95 shadow-[0_24px_70px_rgba(0,0,0,0.6)] backdrop-blur-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span className="flex-1 text-[14px] font-semibold text-white/90">{results.length} {results.length === 1 ? 'export' : 'exports'} ready</span>
          <button onClick={onClose} className="text-white/40 hover:text-white/80"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {results.map((r, i) => {
            const fn = fileName(projectName, r.name);
            return (
              <div key={`${r.path}-${i}`} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-[11px] font-semibold text-white/60">{i + 1}</div>
                <span className="flex-1 truncate text-[12.5px] text-white/85">{fn}</span>
                <a
                  href={`/api/serve/${r.path}?download=1`}
                  download={fn}
                  className="flex items-center gap-1 rounded-lg bg-white/90 px-2.5 py-1.5 text-[11px] font-semibold text-black hover:bg-white"
                >
                  <Download className="h-3 w-3" /> Download
                </a>
              </div>
            );
          })}
        </div>
        <div className="border-t border-white/8 px-4 py-3 text-right">
          <button onClick={onClose} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-white/75 hover:text-white/95">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
