'use client';

import { Copy, Trash2, Info, Scissors } from 'lucide-react';

export interface ContextMenuState {
  nodeId: string;
  x: number;
  y: number;
}

export function NodeContextMenu({
  menu,
  canTrim,
  onDuplicate,
  onDelete,
  onDetails,
  onTrim,
}: {
  menu: ContextMenuState;
  canTrim?: boolean;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onDetails: (id: string) => void;
  onTrim?: (id: string) => void;
}) {
  const Item = ({
    icon,
    label,
    onClick,
    danger,
  }: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    danger?: boolean;
  }) => (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors ${
        danger ? 'text-red-300 hover:bg-red-500/15' : 'text-white/80 hover:bg-white/10'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div
      className="studio-node pointer-events-auto absolute z-40 w-40 rounded-xl border border-white/10 bg-[#191919]/95 p-1 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl"
      style={{ left: menu.x, top: menu.y }}
    >
      <Item icon={<Copy className="h-3.5 w-3.5" />} label="Duplicate" onClick={() => onDuplicate(menu.nodeId)} />
      {canTrim && onTrim && (
        <Item icon={<Scissors className="h-3.5 w-3.5" />} label="Trim / Split" onClick={() => onTrim(menu.nodeId)} />
      )}
      <Item icon={<Info className="h-3.5 w-3.5" />} label="Details" onClick={() => onDetails(menu.nodeId)} />
      <div className="my-0.5 h-px bg-white/8" />
      <Item icon={<Trash2 className="h-3.5 w-3.5" />} label="Delete" danger onClick={() => onDelete(menu.nodeId)} />
    </div>
  );
}
