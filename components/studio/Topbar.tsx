'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronLeft, Layers, Loader2, Download, UserRound } from 'lucide-react';

export function Topbar({
  onSave,
  projectName,
  onRename,
  onScale,
  onExportAll,
  exporting,
  scaling,
  swapModelName,
  swapModelImage,
  onPickSwapModel,
  referenceSet,
  onResetReference,
}: {
  onSave?: () => void;
  projectName?: string;
  onRename?: (name: string) => void;
  onScale?: () => void;
  onExportAll?: () => void;
  exporting?: boolean;
  scaling?: boolean;
  swapModelName?: string | null;
  swapModelImage?: string | null;
  onPickSwapModel?: () => void;
  referenceSet?: boolean;
  onResetReference?: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectName ?? 'Untitled project');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editing) setDraft(projectName ?? 'Untitled project');
  }, [projectName, editing]);
  function startEdit() {
    setDraft(projectName ?? 'Untitled project');
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }
  function commitEdit() {
    const name = draft.trim();
    if (name && name !== projectName) onRename?.(name);
    setEditing(false);
  }
  function handleSave() {
    onSave?.();
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  }
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-14 items-center justify-between px-4">
      {/* wordmark — back to projects */}
      <Link
        href="/"
        className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-[#191919]/70 px-2.5 py-1.5 backdrop-blur-xl transition-colors hover:border-white/20"
      >
        <ChevronLeft className="h-4 w-4 text-white/50" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="Ad-Studio" className="h-5 w-auto" />
      </Link>

      {/* project name — double-click to rename */}
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-white/10 bg-[#191919]/70 px-3 py-1.5 backdrop-blur-xl">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            size={Math.max(draft.length, 1)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
            className="max-w-[60vw] bg-transparent text-[12.5px] font-medium text-white outline-none"
          />
        ) : (
          <span
            onDoubleClick={startEdit}
            title="Double-click to rename"
            className="max-w-[260px] cursor-text truncate text-[12.5px] font-medium text-white/70"
          >
            {projectName ?? 'Untitled project'}
          </span>
        )}
      </div>

      {/* actions */}
      <div className="pointer-events-auto flex items-center gap-2">
        <button
          onClick={onPickSwapModel}
          title="Choose the model to swap into your clips"
          className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#191919]/70 py-1.5 pl-1.5 pr-3 backdrop-blur-xl transition-colors hover:border-white/25"
        >
          {swapModelImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/serve/${swapModelImage}`} alt="" className="h-7 w-7 rounded-xl object-cover" />
          ) : (
            <span className="grid h-7 w-7 place-items-center rounded-xl bg-white/10 text-white/50">
              <UserRound className="h-4 w-4" />
            </span>
          )}
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[9px] uppercase tracking-wider text-white/35">Swap to</span>
            <span className="max-w-[120px] truncate text-[12px] font-medium text-white/85">
              {swapModelName ?? 'Select model'}
            </span>
          </span>
        </button>
        {referenceSet && (
          <button
            onClick={onResetReference}
            title="Later parts reuse the first approved swap as the face reference. Click to reset and generate fresh per part."
            className="flex items-center gap-1.5 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.08] px-2.5 py-2 text-[11px] font-medium text-emerald-300/90 backdrop-blur-xl transition-colors hover:border-emerald-400/40"
          >
            <Check className="h-3.5 w-3.5" /> Reference · Reset
          </button>
        )}
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-[#191919]/70 px-3 py-2 text-[12.5px] font-medium text-white/70 backdrop-blur-xl transition-colors hover:text-white/90"
        >
          {saved ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : null}
          {saved ? 'Saved' : 'Save'}
        </button>
        <button
          onClick={onExportAll}
          disabled={exporting}
          title="Render every Export node on the canvas and download each, named by model"
          className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-[#191919]/70 px-3 py-2 text-[12.5px] font-medium text-white/75 backdrop-blur-xl transition-colors hover:text-white/95 disabled:opacity-50"
        >
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {exporting ? 'Exporting…' : 'Export all'}
        </button>
        <button
          onClick={onScale}
          disabled={scaling}
          className="flex items-center gap-1.5 rounded-2xl bg-white/90 px-3.5 py-2 text-[12.5px] font-semibold text-black shadow-lg transition-all duration-150 hover:bg-white active:scale-95 disabled:opacity-60"
        >
          {scaling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
          {scaling ? 'Scaling…' : 'Scale'}
        </button>
      </div>
    </header>
  );
}
