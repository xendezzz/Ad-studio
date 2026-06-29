'use client';

// UI style label → preview GIF (the real ffmpeg xfade applied to a sample shot), in /public/transitions
const SLUG: Record<string, string> = {
  Dissolve: 'dissolve',
  'Wipe left': 'wipeleft',
  'Slide up': 'slideup',
  'Circle open': 'circleopen',
  Pixelize: 'pixelize',
};

/**
 * Preview of the selected transition: a looping GIF showing the actual ffmpeg xfade applied to a
 * sample shot (full frame → punched-in framing), so it imitates what the export produces.
 */
export function TransitionPreview({ style }: { style?: string }) {
  const slug = SLUG[style ?? 'Dissolve'] ?? 'dissolve';
  return (
    <div className="relative mt-2.5 aspect-[548/800] w-full overflow-hidden rounded-xl border border-white/8 bg-black/30">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/transitions/${slug}.gif`} alt={`${style ?? 'Dissolve'} transition`} loading="lazy" className="h-full w-full object-cover" />
      <span className="absolute bottom-1 right-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wider text-white/70 backdrop-blur-sm">
        {style ?? 'Dissolve'}
      </span>
    </div>
  );
}
