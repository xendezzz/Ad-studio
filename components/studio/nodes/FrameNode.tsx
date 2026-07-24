'use client';

import type { NodeProps } from '@xyflow/react';
import { Lock } from 'lucide-react';

export interface FrameNodeData {
  label: string;
  locked?: boolean;
  accent?: string; // border/label tint
  [key: string]: unknown;
}

/**
 * A non-interactive labeled boundary drawn BEHIND a pipeline (the locked reference, or a
 * scaled model row). Sized via the node's style width/height; the label floats on the border.
 */
export function FrameNode({ data }: NodeProps) {
  const d = data as FrameNodeData;
  const accent = d.accent ?? (d.locked ? '#f5b14c' : '#8b7bf7');
  return (
    <div
      className="relative h-full w-full rounded-[28px] border-2 border-dashed"
      style={{ borderColor: `${accent}40`, background: `${accent}08` }}
    >
      <div
        className="absolute -top-3.5 left-5 flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold"
        style={{ borderColor: `${accent}55`, background: '#191919', color: `${accent}` }}
      >
        {d.locked && <Lock className="h-3 w-3" />}
        {d.label}
      </div>
    </div>
  );
}
