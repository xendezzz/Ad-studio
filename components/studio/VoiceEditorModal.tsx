'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Mic, Play, Pause, Check, Loader2, Sparkles, Volume2, Save, Search } from 'lucide-react';
import { COST_USD, formatUSD } from '@/lib/costs';

export interface VoiceApplyPayload {
  voiceId?: string;
  generatedVoiceId?: string;
  saveName?: string;
  /** display name of the chosen voice — stored on the node so the pill reads nicely */
  voiceName?: string;
}

interface LibraryVoice {
  voiceId: string;
  name: string;
  category?: string;
  previewUrl?: string;
}

interface DesignPreview {
  audioBase64: string;
  generatedVoiceId: string;
  mediaType: string;
}

export function VoiceEditorModal({
  src,
  initialVoiceId,
  busy,
  onApply,
  onClose,
}: {
  src: string | null; // /api/serve url for the preview player
  initialVoiceId: string | null;
  busy: boolean;
  onApply: (p: VoiceApplyPayload) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<'library' | 'design'>('library');
  const [err, setErr] = useState<string | null>(null);

  // library
  const [voices, setVoices] = useState<LibraryVoice[] | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(initialVoiceId);
  const [q, setQ] = useState('');
  const [playingAudio, setPlayingAudio] = useState<string | null>(null); // url/id of what's playing

  // design
  const [description, setDescription] = useState('');
  const [designing, setDesigning] = useState(false);
  const [previews, setPreviews] = useState<DesignPreview[]>([]);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAs, setSavedAs] = useState<string | null>(null); // voiceId once saved

  useEffect(() => {
    fetch('/api/voice/voices')
      .then((r) => r.json())
      .then((d) => setVoices(Array.isArray(d.voices) ? d.voices : []))
      .catch(() => setVoices([]));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  // one shared audio element for all voice previews
  const playAudio = useCallback((key: string, url: string) => {
    if (playingAudio === key) {
      audioRef.current?.pause();
      setPlayingAudio(null);
      return;
    }
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    a.pause();
    a.src = url;
    a.onended = () => setPlayingAudio(null);
    a.play().then(() => setPlayingAudio(key)).catch(() => setPlayingAudio(null));
  }, [playingAudio]);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().then(() => setPlaying(true)).catch(() => {});
    else { v.pause(); setPlaying(false); }
  }, []);

  async function design() {
    if (!description.trim()) return;
    setDesigning(true);
    setErr(null);
    setSavedAs(null);
    try {
      const res = await fetch('/api/voice/design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'voice design failed');
      setPreviews(Array.isArray(d.previews) ? d.previews : []);
      setPreviewIdx(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Voice design failed');
    } finally {
      setDesigning(false);
    }
  }

  async function saveToLibrary() {
    if (previewIdx === null || !saveName.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch('/api/voice/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generatedVoiceId: previews[previewIdx].generatedVoiceId, name: saveName }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'saving voice failed');
      setSavedAs(d.voiceId);
      setVoiceId(d.voiceId);
      setVoices((vs) => (vs ? [{ voiceId: d.voiceId, name: saveName.trim(), category: 'designed' }, ...vs] : vs));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Saving voice failed');
    } finally {
      setSaving(false);
    }
  }

  // what Apply will use: a saved library voice, or an unsaved designed preview (auto-saved server-side)
  const usingPreview = tab === 'design' && previewIdx !== null && !savedAs;
  const canApply = usingPreview || !!voiceId;
  const applyCost = COST_USD.tts;

  function apply() {
    if (!canApply) return;
    onApply(
      usingPreview
        ? { generatedVoiceId: previews[previewIdx!].generatedVoiceId, saveName: saveName.trim() || undefined, voiceName: saveName.trim() || 'Designed voice' }
        : { voiceId: voiceId!, voiceName: voices?.find((v) => v.voiceId === voiceId)?.name },
    );
  }

  const playBtn = (key: string, url: string) => (
    <button
      onClick={(e) => { e.stopPropagation(); playAudio(key, url); }}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white"
    >
      {playingAudio === key ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 translate-x-[1px]" fill="currentColor" />}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 backdrop-blur-sm" onMouseDown={() => !busy && onClose()}>
      <div className="studio-node flex w-[820px] max-w-[95vw] gap-4 rounded-2xl border border-white/10 bg-[#15171c]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.7)]" onMouseDown={(e) => e.stopPropagation()}>
        {/* left: video preview */}
        <div className="flex w-[260px] shrink-0 flex-col gap-2.5">
          <div className="relative aspect-[9/16] overflow-hidden rounded-xl border border-white/8 bg-black" style={{ maxHeight: '52vh' }}>
            <video ref={videoRef} src={src ?? undefined} onClick={togglePlay} playsInline className="absolute inset-0 h-full w-full cursor-pointer object-contain" />
            <button onClick={togglePlay} className="absolute bottom-2 left-2 grid h-8 w-8 place-items-center rounded-lg bg-black/55 text-white/85 backdrop-blur-sm hover:bg-black/75">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" fill="currentColor" />}
            </button>
          </div>
          <p className="text-center text-[10.5px] leading-relaxed text-white/35">
            Voice change keeps the clip&apos;s original delivery — timing, pauses, and energy — and swaps only the voice.
          </p>
        </div>

        {/* right: voice picker */}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Mic className="h-4 w-4 text-white/70" /><span className="text-[13px] font-semibold text-white/90">Voice</span></div>
            <button onClick={onClose} disabled={busy} className="text-white/40 hover:text-white/80 disabled:opacity-40"><X className="h-4 w-4" /></button>
          </div>

          <div className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
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

          {tab === 'library' ? (
            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-white/30" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={voices === null ? 'Loading voices…' : `Search ${voices.length} voices…`}
                  className="w-full bg-transparent py-2 text-[12px] text-white/85 outline-none placeholder:text-white/30"
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/8 bg-white/[0.015] p-1.5" style={{ maxHeight: '38vh' }}>
              {voices === null ? (
                <div className="flex items-center gap-2 px-2 py-6 text-[12px] text-white/40"><Loader2 className="h-4 w-4 animate-spin" /> Loading voices…</div>
              ) : voices.length === 0 ? (
                <div className="px-2 py-6 text-center text-[12px] text-white/40">No voices in your ElevenLabs library.</div>
              ) : (
                voices
                  .filter((v) => !q || v.name.toLowerCase().includes(q.toLowerCase()))
                  .slice(0, 300)
                  .map((v) => (
                  <button
                    key={v.voiceId}
                    onClick={() => setVoiceId(v.voiceId)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${voiceId === v.voiceId ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'}`}
                  >
                    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${voiceId === v.voiceId ? 'border-[var(--gold-bright)]' : 'border-white/25'}`}>
                      {voiceId === v.voiceId && <span className="h-2 w-2 rounded-full bg-[var(--gold-bright)]" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-white/85">{v.name}</span>
                      {v.category && <span className="block text-[10px] capitalize text-white/35">{v.category}</span>}
                    </span>
                    {v.previewUrl && playBtn(v.voiceId, v.previewUrl)}
                  </button>
                  ))
              )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto" style={{ maxHeight: '42vh' }}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Describe the voice — e.g. energetic 25-year-old American woman, warm and casual, slight rasp"
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[12px] text-white/85 outline-none placeholder:text-white/25 focus:border-white/30"
              />
              <button
                onClick={design}
                disabled={designing || !description.trim()}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] py-2 text-[12px] font-medium text-white/85 hover:bg-white/[0.08] disabled:opacity-50"
              >
                {designing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {designing ? 'Designing…' : `Generate previews · ${formatUSD(COST_USD.voiceDesign)}`}
              </button>

              {previews.length > 0 && (
                <div className="rounded-xl border border-white/8 bg-white/[0.015] p-1.5">
                  {previews.map((p, i) => (
                    <button
                      key={p.generatedVoiceId}
                      onClick={() => { setPreviewIdx(i); setSavedAs(null); }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${previewIdx === i ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'}`}
                    >
                      <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${previewIdx === i ? 'border-[var(--gold-bright)]' : 'border-white/25'}`}>
                        {previewIdx === i && <span className="h-2 w-2 rounded-full bg-[var(--gold-bright)]" />}
                      </span>
                      <Volume2 className="h-3.5 w-3.5 shrink-0 text-white/40" />
                      <span className="flex-1 text-[12.5px] text-white/85">Preview {i + 1}</span>
                      {playBtn(`preview-${i}`, `data:${p.mediaType};base64,${p.audioBase64}`)}
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
                      onClick={saveToLibrary}
                      disabled={saving || previewIdx === null || !saveName.trim() || !!savedAs}
                      className="flex items-center gap-1 rounded-md border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] text-white/80 hover:bg-white/[0.08] disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : savedAs ? <Check className="h-3 w-3 text-emerald-400" /> : <Save className="h-3 w-3" />}
                      {savedAs ? 'Saved' : 'Save to library'}
                    </button>
                  </div>
                  {usingPreview && (
                    <p className="px-1 pb-1 pt-1.5 text-[10px] text-white/35">Applying an unsaved preview saves it to your library automatically.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {err && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-2 text-[11.5px] text-red-200">{err}</p>}

          <div className="mt-auto flex items-center justify-between border-t border-white/8 pt-2.5">
            <span className="text-[11.5px] text-white/45">
              Apply: <span className="text-white/70">~{formatUSD(applyCost)}</span> · same performance, new voice
            </span>
            <button
              onClick={apply}
              disabled={busy || !canApply}
              className="flex items-center gap-1.5 rounded-lg bg-white/90 px-3.5 py-1.5 text-[12px] font-semibold text-black hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Apply voice
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
