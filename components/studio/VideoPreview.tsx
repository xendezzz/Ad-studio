'use client';

import { useRef, useState } from 'react';
import { Volume2, VolumeX, Play } from 'lucide-react';

/**
 * Node media preview.
 * - Shows a static first frame by default.
 * - Plays on hover (scroll/mouse over), pauses + resets on leave.
 * - Mute/unmute toggle in the corner (starts muted so hover-autoplay is allowed).
 */
export function VideoPreview({ src, tag }: { src: string; tag: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);

  function onEnter() {
    const v = ref.current;
    if (!v) return;
    v.play().then(() => setPlaying(true)).catch(() => {});
  }

  function onLeave() {
    const v = ref.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
    setPlaying(false);
  }

  function toggleMute(e: React.MouseEvent) {
    e.stopPropagation();
    const v = ref.current;
    const next = !muted;
    setMuted(next);
    if (v) v.muted = next;
  }

  return (
    <div
      className="group/preview relative mt-2.5 w-full overflow-hidden rounded-xl border border-white/5 bg-black/40"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <video
        ref={ref}
        src={src}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        className="block h-auto w-full"
      />

      {/* play hint (fades while playing) */}
      <div
        className={`pointer-events-none absolute inset-0 grid place-items-center transition-opacity duration-200 ${
          playing ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="grid h-9 w-9 place-items-center rounded-full bg-black/35 backdrop-blur-sm">
          <Play className="h-4 w-4 translate-x-[1px] text-white/80" fill="currentColor" />
        </div>
      </div>

      {/* tag */}
      <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-md bg-black/45 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/70 backdrop-blur-sm">
        {tag}
      </span>

      {/* mute / unmute */}
      <button
        onClick={toggleMute}
        className="nodrag absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md bg-black/45 text-white/75 backdrop-blur-sm transition-colors hover:bg-black/65 hover:text-white"
        title={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
