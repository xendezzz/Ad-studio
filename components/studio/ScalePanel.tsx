'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Loader2, Check, Sparkles, Layers, ChevronDown, Play, Pause, Mic, Save } from 'lucide-react';
import { COST_USD, formatUSD } from '@/lib/costs';

export interface ScaleModel { id: string; name: string; imagePath: string | null; description?: string | null; voiceId?: string }

interface LibraryVoice { voiceId: string; name: string; previewUrl?: string }
interface DesignPreview { audioBase64: string; generatedVoiceId: string; mediaType: string }

/** Voice picker for one model — its own modal, same options as the Voice node: library (with play) or design new. */
function VoicePickerModal({
  model,
  voices,
  playingKey,
  onPlay,
  initialVoiceId,
  onUse,
  onClose,
  onVoiceSaved,
}: {
  model: ScaleModel;
  voices: LibraryVoice[] | null;
  playingKey: string | null;
  onPlay: (key: string, url: string) => void;
  initialVoiceId?: string;
  onUse: (voiceId: string) => void;
  onClose: () => void;
  onVoiceSaved: (voiceId: string, name: string) => void;
}) {
  const [tab, setTab] = useState<'library' | 'design'>('library');
  const [sel, setSel] = useState<string | null>(initialVoiceId ?? null);
  const [vq, setVq] = useState('');
  const [desc, setDesc] = useState('');
  const [designing, setDesigning] = useState(false);
  const [previews, setPreviews] = useState<DesignPreview[]>([]);
  const [selIdx, setSelIdx] = useState<number | null>(null);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function design() {
    if (!desc.trim()) return;
    setDesigning(true);
    setErr(null);
    try {
      const res = await fetch('/api/voice/design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'voice design failed');
      setPreviews(Array.isArray(d.previews) ? d.previews : []);
      setSelIdx(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Voice design failed');
    } finally {
      setDesigning(false);
    }
  }

  async function saveAndUse() {
    if (selIdx === null || !saveName.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch('/api/voice/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generatedVoiceId: previews[selIdx].generatedVoiceId, name: saveName }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'saving voice failed');
      onVoiceSaved(d.voiceId, saveName.trim());
      onUse(d.voiceId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Saving voice failed');
      setSaving(false);
    }
  }

  const playBtn = (key: string, url: string) => (
    <span
      role="button"
      onClick={(e) => { e.stopPropagation(); onPlay(key, url); }}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white"
    >
      {playingKey === key ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 translate-x-[1px]" fill="currentColor" />}
    </span>
  );

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="flex max-h-[78vh] w-[440px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#191919]/95 shadow-[0_24px_70px_rgba(0,0,0,0.6)] backdrop-blur-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 border-b border-white/8 px-4 py-3">
          {model.imagePath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/serve/${model.imagePath}`} alt={model.name} className="h-8 w-8 rounded-lg object-cover" />
          ) : (
            <Mic className="h-4 w-4 text-white/70" />
          )}
          <div className="flex-1">
            <div className="text-[13px] font-semibold text-white/90">Voice for {model.name}</div>
            <div className="text-[10.5px] text-white/40">Pick from your library or design a new voice.</div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80"><X className="h-4 w-4" /></button>
        </div>

        <div className="mx-4 mt-3 flex gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
          {([['library', 'Library'], ['design', 'Design new']] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors ${tab === t ? 'bg-[var(--gold-soft)] text-[var(--gold-bright)]' : 'text-white/50 hover:text-white/80'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-3">
          {tab === 'library' ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-white/30" />
                <input
                  value={vq}
                  onChange={(e) => setVq(e.target.value)}
                  placeholder={voices === null ? 'Loading voices…' : `Search ${voices.length} voices…`}
                  className="w-full bg-transparent py-2 text-[12px] text-white/85 outline-none placeholder:text-white/30"
                />
              </div>
              <div className="max-h-[34vh] overflow-y-auto rounded-xl border border-white/8 bg-white/[0.015] p-1.5">
              {voices === null ? (
                <div className="flex items-center gap-2 px-2 py-6 text-[12px] text-white/40"><Loader2 className="h-4 w-4 animate-spin" /> Loading voices…</div>
              ) : voices.length === 0 ? (
                <div className="px-2 py-6 text-center text-[12px] text-white/40">No voices in your ElevenLabs library.</div>
              ) : (
                voices
                  .filter((v) => !vq || v.name.toLowerCase().includes(vq.toLowerCase()))
                  .slice(0, 300)
                  .map((v) => (
                  <button
                    key={v.voiceId}
                    onClick={() => setSel(v.voiceId)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${sel === v.voiceId ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'}`}
                  >
                    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${sel === v.voiceId ? 'border-[var(--gold-bright)]' : 'border-white/25'}`}>
                      {sel === v.voiceId && <span className="h-2 w-2 rounded-full bg-[var(--gold-bright)]" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/85">{v.name}</span>
                    {v.previewUrl && playBtn(`${model.id}-${v.voiceId}`, v.previewUrl)}
                  </button>
                  ))
              )}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={2}
                placeholder={`Describe ${model.name}'s voice — e.g. warm Spanish-accented young woman, casual and upbeat`}
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[12px] text-white/85 outline-none placeholder:text-white/25 focus:border-white/30"
              />
              <button
                onClick={design}
                disabled={designing || !desc.trim()}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] py-2 text-[12px] font-medium text-white/85 hover:bg-white/[0.08] disabled:opacity-50"
              >
                {designing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {designing ? 'Designing…' : `Generate previews · ${formatUSD(COST_USD.voiceDesign)}`}
              </button>
              {previews.length > 0 && (
                <div className="rounded-xl border border-white/8 bg-white/[0.015] p-1.5">
                  {previews.map((p, i) => (
                    <button
                      key={p.generatedVoiceId}
                      onClick={() => setSelIdx(i)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${selIdx === i ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'}`}
                    >
                      <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${selIdx === i ? 'border-[var(--gold-bright)]' : 'border-white/25'}`}>
                        {selIdx === i && <span className="h-2 w-2 rounded-full bg-[var(--gold-bright)]" />}
                      </span>
                      <span className="flex-1 text-[12.5px] text-white/85">Preview {i + 1}</span>
                      {playBtn(`${model.id}-p${i}`, `data:${p.mediaType};base64,${p.audioBase64}`)}
                    </button>
                  ))}
                  <div className="mt-1.5 flex items-center gap-1.5 border-t border-white/8 px-1 pt-2">
                    <input
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder="Voice name"
                      className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[11.5px] text-white/85 outline-none placeholder:text-white/25 focus:border-white/30"
                    />
                    <button
                      onClick={saveAndUse}
                      disabled={saving || selIdx === null || !saveName.trim()}
                      className="flex shrink-0 items-center gap-1 rounded-md border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] text-white/80 hover:bg-white/[0.08] disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save & use
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {err && <p className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-2 text-[11.5px] text-red-200">{err}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/8 px-4 py-3">
          <button onClick={onClose} className="rounded-xl border border-white/10 px-3.5 py-2 text-[12px] text-white/70 hover:text-white/95">Cancel</button>
          <button
            onClick={() => { if (sel) onUse(sel); }}
            disabled={!sel}
            className="flex items-center gap-1.5 rounded-xl bg-white/90 px-4 py-2 text-[12px] font-semibold text-black hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" /> Use voice
          </button>
        </div>
      </div>
    </div>
  );
}

// keep category order consistent with the Models page
const GROUP_ORDER = [
  'Study Girl', 'Tech Girl', 'Japanese', 'Spanish', 'Brazilian',
  'Twitter', 'Talking Head English', 'New Faceless', 'Old Faceless', 'Generated',
];
// description = "<category>" for library models, "gen:<category>" for generated
const catOf = (m: ScaleModel) => {
  const d = m.description || '';
  return (d.startsWith('gen:') ? d.slice(4) : d) || 'Other';
};
const orderOf = (c: string) => (GROUP_ORDER.indexOf(c) + 1 || 99);

/**
 * Pick models to scale across — grouped by category (like the Models page), with
 * per-category and select-all toggles. On confirm, hands the selection to the canvas,
 * which duplicates the whole pipeline (one stacked row per model).
 */
export function ScalePanel({
  onScale,
  onClose,
  usedModels,
  perPipelineUSD,
}: {
  onScale: (models: ScaleModel[]) => void;
  onClose: () => void;
  usedModels?: Set<string>; // model names already used in existing scaled rows
  perPipelineUSD?: number; // est. $ to scale one model (frames + swaps)
}) {
  const [models, setModels] = useState<ScaleModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Record<string, ScaleModel>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // per-model voice change: toggle + chosen library voiceId; picker opens as its own modal
  const [voiceCfg, setVoiceCfg] = useState<Record<string, { on: boolean; voiceId?: string }>>({});
  const [voiceModalFor, setVoiceModalFor] = useState<string | null>(null);
  const [voices, setVoices] = useState<LibraryVoice[] | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json())
      .then((d) => setModels(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  // load the ElevenLabs library the first time any voice toggle turns on
  const anyVoiceOn = Object.values(voiceCfg).some((c) => c.on) || voiceModalFor !== null;
  useEffect(() => {
    if (!anyVoiceOn || voices !== null) return;
    fetch('/api/voice/voices')
      .then((r) => r.json())
      .then((d) => setVoices(Array.isArray(d.voices) ? d.voices : []))
      .catch(() => setVoices([]));
  }, [anyVoiceOn, voices]);

  const playAudio = useCallback((key: string, url: string) => {
    if (playingKey === key) {
      audioRef.current?.pause();
      setPlayingKey(null);
      return;
    }
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    a.pause();
    a.src = url;
    a.onended = () => setPlayingKey(null);
    a.play().then(() => setPlayingKey(key)).catch(() => setPlayingKey(null));
  }, [playingKey]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const filtered = q ? models.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())) : models;

  // group filtered models by category, ordered like the Models page
  const groups = useMemo(() => {
    const map = new Map<string, ScaleModel[]>();
    for (const m of filtered) {
      const c = catOf(m);
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(m);
    }
    return [...map.entries()].sort((a, b) => orderOf(a[0]) - orderOf(b[0]));
  }, [filtered]);

  const selectedList = Object.values(selected);
  const toggle = (m: ScaleModel) =>
    setSelected((s) => {
      const next = { ...s };
      if (next[m.id]) delete next[m.id];
      else next[m.id] = m;
      return next;
    });
  const setMany = (list: ScaleModel[], on: boolean) =>
    setSelected((s) => {
      const next = { ...s };
      for (const m of list) {
        if (on) next[m.id] = m;
        else delete next[m.id];
      }
      return next;
    });

  const allOn = filtered.length > 0 && filtered.every((m) => selected[m.id]);

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-black/50 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="flex max-h-[82vh] w-[660px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#191919]/95 shadow-[0_24px_70px_rgba(0,0,0,0.6)] backdrop-blur-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <span className="flex-1 text-[14px] font-semibold text-white/90">Scale across models</span>
          <button onClick={onClose} className="text-white/40 hover:text-white/80"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex items-center gap-2 border-b border-white/8 px-4 py-2.5">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5">
            <Search className="h-3.5 w-3.5 text-white/30" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models…" className="w-full bg-transparent py-2 text-[12px] text-white/85 outline-none placeholder:text-white/30" />
          </div>
          <button
            onClick={() => setMany(filtered, !allOn)}
            disabled={!filtered.length}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors disabled:opacity-40 ${allOn ? 'border-violet-400/40 bg-violet-400/10 text-violet-200' : 'border-white/10 bg-white/[0.03] text-white/70 hover:text-white/95'}`}
          >
            <Check className="h-3.5 w-3.5" /> {allOn ? 'Clear all' : 'Select all'}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center gap-2 px-1 py-8 text-white/40"><Loader2 className="h-4 w-4 animate-spin" /> Loading models…</div>
          ) : !groups.length ? (
            <div className="px-1 py-8 text-[12px] text-white/40">No models found.</div>
          ) : (
            groups.map(([cat, list]) => {
              const catAllOn = list.every((m) => selected[m.id]);
              const catSomeOn = !catAllOn && list.some((m) => selected[m.id]);
              const isCollapsed = collapsed[cat];
              return (
                <div key={cat} className="mb-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <button onClick={() => setCollapsed((c) => ({ ...c, [cat]: !c[cat] }))} className="text-white/30 hover:text-white/70">
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                    </button>
                    <button
                      onClick={() => setMany(list, !catAllOn)}
                      className={`grid h-4 w-4 place-items-center rounded border transition-colors ${catAllOn ? 'border-violet-400 bg-violet-500 text-white' : catSomeOn ? 'border-violet-400/60 bg-violet-500/30' : 'border-white/20 hover:border-white/40'}`}
                    >
                      {catAllOn && <Check className="h-2.5 w-2.5" />}
                      {catSomeOn && <span className="h-0.5 w-2 rounded bg-violet-300" />}
                    </button>
                    <button onClick={() => setMany(list, !catAllOn)} className="text-[12px] font-semibold text-white/80 hover:text-white">
                      {cat}
                    </button>
                    <span className="text-[11px] text-white/35">{list.filter((m) => selected[m.id]).length}/{list.length}</span>
                  </div>
                  {!isCollapsed && (
                    <div className="grid grid-cols-7 gap-2 pl-6">
                      {list.map((m) => {
                        const on = !!selected[m.id];
                        const used = usedModels?.has(m.name);
                        const cfg = voiceCfg[m.id];
                        const voiceName = cfg?.voiceId ? voices?.find((v) => v.voiceId === cfg.voiceId)?.name ?? 'Voice set' : null;
                        return (
                          <div key={m.id}>
                            <button onClick={() => toggle(m)} title={used ? `${m.name} — already scaled` : m.name} className={`relative w-full overflow-hidden rounded-lg border transition-all ${on ? 'border-violet-400 ring-2 ring-violet-400/40' : used ? 'border-emerald-400/40' : 'border-white/8 hover:border-white/25'}`}>
                              {m.imagePath ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={`/api/serve/${m.imagePath}`} alt={m.name} className={`aspect-square w-full object-cover ${used && !on ? 'opacity-55' : ''}`} />
                              ) : (
                                <div className="aspect-square w-full bg-white/5" />
                              )}
                              {used && (
                                <span className="absolute inset-x-0 bottom-0 bg-emerald-500/80 py-0.5 text-center text-[8px] font-semibold uppercase tracking-wider text-white">Used</span>
                              )}
                              {on && <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-violet-500 text-white"><Check className="h-2.5 w-2.5" /></span>}
                            </button>
                            {/* voice-change switch — shown under each selected model */}
                            {on && (
                              <div className="mt-1 flex items-center gap-1 px-0.5">
                                <button
                                  onClick={() => {
                                    const next = !(cfg?.on ?? false);
                                    setVoiceCfg((c) => ({ ...c, [m.id]: { ...(c[m.id] ?? {}), on: next } }));
                                    if (next && !cfg?.voiceId) setVoiceModalFor(m.id);
                                  }}
                                  title="Voice change"
                                  className={`relative h-3.5 w-7 shrink-0 rounded-full transition-colors ${cfg?.on ? 'bg-emerald-500/80' : 'bg-white/15'}`}
                                >
                                  <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${cfg?.on ? 'left-[15px]' : 'left-0.5'}`} />
                                </button>
                                {cfg?.on ? (
                                  <button
                                    onClick={() => setVoiceModalFor(m.id)}
                                    className="min-w-0 flex-1 truncate text-left text-[9px] text-white/60 hover:text-white/90"
                                  >
                                    {voiceName ?? 'Pick voice…'}
                                  </button>
                                ) : (
                                  <span className="truncate text-[9px] text-white/30">Voice</span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/8 px-4 py-3">
          <span className="text-[12px] text-white/45">
            {selectedList.length} selected
            {usedModels && usedModels.size > 0 && (
              <span className="ml-2 text-emerald-300/70">· {usedModels.size} already scaled</span>
            )}
            {(() => {
              const voiceCount = selectedList.filter((m) => voiceCfg[m.id]?.on && voiceCfg[m.id]?.voiceId).length;
              const base = (perPipelineUSD ?? 0) * selectedList.length;
              const voiceCost = voiceCount * COST_USD.tts;
              const total = base + voiceCost;
              return total > 0 && selectedList.length > 0 ? (
                <span className="ml-2 text-amber-300/80">
                  · ~${total.toFixed(2)}{voiceCount > 0 && <span className="text-white/35"> (incl. {voiceCount} voice)</span>}
                </span>
              ) : null;
            })()}
          </span>
          <button
            onClick={() => {
              if (!selectedList.length) return;
              const withVoice = selectedList.map((m) => {
                const c = voiceCfg[m.id];
                return c?.on && c.voiceId ? { ...m, voiceId: c.voiceId } : m;
              });
              onScale(withVoice);
              onClose();
            }}
            disabled={!selectedList.length}
            className="flex items-center gap-1.5 rounded-xl bg-white/90 px-4 py-2 text-[13px] font-semibold text-black transition-all hover:bg-white active:scale-95 disabled:opacity-40"
          >
            <Layers className="h-3.5 w-3.5" />
            Build {selectedList.length} {selectedList.length === 1 ? 'pipeline' : 'pipelines'}
          </button>
        </div>
      </div>

      {voiceModalFor && (() => {
        const m = selected[voiceModalFor] ?? models.find((x) => x.id === voiceModalFor);
        if (!m) return null;
        return (
          <VoicePickerModal
            model={m}
            voices={voices}
            playingKey={playingKey}
            onPlay={playAudio}
            initialVoiceId={voiceCfg[m.id]?.voiceId}
            onUse={(voiceId) => {
              setVoiceCfg((c) => ({ ...c, [m.id]: { on: true, voiceId } }));
              setVoiceModalFor(null);
            }}
            onClose={() => {
              // closed without picking → drop the toggle if no voice was ever chosen
              setVoiceCfg((c) =>
                c[m.id]?.voiceId ? c : { ...c, [m.id]: { on: false } },
              );
              setVoiceModalFor(null);
            }}
            onVoiceSaved={(voiceId, name) => {
              setVoices((vs) => (vs && !vs.some((v) => v.voiceId === voiceId) ? [{ voiceId, name }, ...vs] : vs));
            }}
          />
        );
      })()}
    </div>
  );
}
