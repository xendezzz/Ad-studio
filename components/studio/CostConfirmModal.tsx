'use client';

import { X, DollarSign, ArrowRight } from 'lucide-react';
import { type CostLine, totalUSD, formatUSD } from '@/lib/costs';

export interface CostPrompt {
  title: string;
  note?: string;
  lines: CostLine[];
  confirmLabel?: string;
  onConfirm: () => void;
}

/** Shows the estimated credit cost (with breakdown) before a generation step runs. */
export function CostConfirmModal({ prompt, onClose }: { prompt: CostPrompt; onClose: () => void }) {
  const lines = prompt.lines.filter((l) => l.count > 0);
  const total = totalUSD(lines);
  return (
    <div className="pointer-events-auto absolute inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-[420px] overflow-hidden rounded-2xl border border-white/10 bg-[#15171c]/95 shadow-[0_24px_70px_rgba(0,0,0,0.6)] backdrop-blur-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
          <DollarSign className="h-4 w-4 text-amber-300" />
          <span className="flex-1 text-[14px] font-semibold text-white/90">{prompt.title}</span>
          <button onClick={onClose} className="text-white/40 hover:text-white/80"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-4 py-3">
          <div className="space-y-1.5">
            {lines.map((l, i) => (
              <div key={i} className="flex items-center justify-between text-[12.5px]">
                <span className="text-white/65">{l.label} <span className="text-white/35">· {l.count.toLocaleString()} × {formatUSD(l.each)}</span></span>
                <span className="tabular-nums text-white/85">{formatUSD(l.amount)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3">
            <span className="text-[12px] font-medium text-white/55">Estimated total</span>
            <span className="text-[15px] font-semibold text-amber-300">{formatUSD(total)}</span>
          </div>
          {prompt.note && <p className="mt-2 text-[11px] leading-snug text-white/40">{prompt.note}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-white/8 px-4 py-3">
          <button onClick={onClose} className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[13px] font-medium text-white/75 hover:text-white/95">
            Cancel
          </button>
          <button
            onClick={() => { prompt.onConfirm(); onClose(); }}
            className="flex items-center gap-1.5 rounded-xl bg-white/90 px-4 py-2 text-[13px] font-semibold text-black transition-all hover:bg-white active:scale-95"
          >
            {prompt.confirmLabel ?? 'Run'} <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
