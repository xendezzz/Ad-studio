/**
 * AdEmphasis — Remotion composition that plays the source ad and, at each
 * emphasis event, pops a Runable-branded graphic (keyword text / emoji /
 * four-pointed star sparkles) with an optional sound effect.
 *
 * Visual language follows the Runable identity handoff: brand palette only,
 * warm sourceless glow (layered amber shadows, no hard shadows), 2-4
 * four-pointed star sparkles, playful springy motion.
 */
import React, { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { RUNABLE_COLORS, type AdEmphasisProps, type EmphasisEvent, type EmphasisSlot } from './types';

const SLOT_Y: Record<EmphasisSlot, number> = { top: 0.14, upper: 0.28, lower: 0.74 };

/** Warm "sourceless" glow — layered amber, never a hard drop shadow. */
const glow = (c: string) =>
  `0 0 18px ${RUNABLE_COLORS.warmAmber}cc, 0 0 46px ${RUNABLE_COLORS.warmAmber}66, 0 3px 10px rgba(20,10,0,0.55), 0 0 2px ${c}`;

function FourPointStar({ size, color, opacity }: { size: number; color: string; opacity: number }) {
  // classic four-pointed sparkle: two soft-waisted diamonds
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ opacity, display: 'block' }}>
      <path
        d="M50 0 C54 32 68 46 100 50 C68 54 54 68 50 100 C46 68 32 54 0 50 C32 46 46 32 50 0 Z"
        fill={color}
        style={{ filter: `drop-shadow(0 0 8px ${RUNABLE_COLORS.warmAmber})` }}
      />
    </svg>
  );
}

function KeywordPop({ ev, index }: { ev: EmphasisEvent; index: number }) {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 11, stiffness: 180, mass: 0.6 } });
  const out = interpolate(frame, [durationInFrames - 6, durationInFrames - 1], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const text = (ev.text ?? '').toUpperCase();
  const fontSize = Math.min(width * 0.115, (width * 1.55) / Math.max(4, text.length));
  const rotate = [-3.5, 2.5, -2, 3][index % 4];
  const color = ev.color ?? RUNABLE_COLORS.acidYellow;
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'center' }}>
      <div
        style={{
          position: 'absolute',
          top: `${SLOT_Y[ev.slot] * 100}%`,
          transform: `translateY(-50%) scale(${pop}) rotate(${rotate}deg)`,
          opacity: out,
          fontFamily: 'RunableDisplay, Anton, Arial Black, sans-serif',
          fontSize,
          lineHeight: 1.05,
          color,
          letterSpacing: '0.02em',
          textAlign: 'center',
          padding: '0 4%',
          textShadow: glow(color),
          WebkitTextStroke: `${Math.max(2, fontSize * 0.025)}px rgba(26,20,8,0.85)`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}

function EmojiPop({ ev }: { ev: EmphasisEvent }) {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 9, stiffness: 160, mass: 0.7 } });
  const float = Math.sin(frame / 9) * width * 0.006;
  const out = interpolate(frame, [durationInFrames - 6, durationInFrames - 1], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div
        style={{
          position: 'absolute',
          top: `${SLOT_Y[ev.slot] * 100}%`,
          transform: `translateY(calc(-50% + ${float}px)) scale(${pop})`,
          opacity: out,
          fontSize: width * 0.16,
          filter: `drop-shadow(0 0 22px ${RUNABLE_COLORS.warmAmber}99)`,
        }}
      >
        {ev.emoji}
      </div>
    </AbsoluteFill>
  );
}

/** 3 four-pointed stars (brand rule: 2-4, never more) twinkling around the slot. */
function SparkleBurst({ ev }: { ev: EmphasisEvent }) {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();
  const stars = [
    { dx: -0.16, dy: -0.02, s: 0.075, color: RUNABLE_COLORS.glowTeal, delay: 0 },
    { dx: 0.14, dy: -0.05, s: 0.055, color: RUNABLE_COLORS.warmIvory, delay: 3 },
    { dx: 0.02, dy: 0.045, s: 0.042, color: RUNABLE_COLORS.warmAmber, delay: 6 },
  ];
  const out = interpolate(frame, [durationInFrames - 6, durationInFrames - 1], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      {stars.map((st, i) => {
        const pop = spring({ frame: frame - st.delay, fps, config: { damping: 10, stiffness: 170, mass: 0.5 } });
        const twinkle = 0.75 + 0.25 * Math.sin((frame - st.delay) / 5 + i * 2);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: `calc(${SLOT_Y[ev.slot] * 100}% + ${st.dy * width}px)`,
              transform: `translate(${st.dx * width}px, -50%) scale(${pop}) rotate(${(frame - st.delay) * 0.6}deg)`,
              opacity: out,
            }}
          >
            <FourPointStar size={width * st.s} color={st.color} opacity={twinkle} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

export const AdEmphasis: React.FC<AdEmphasisProps> = ({ src, fontUrl, events, fps }) => {
  const [handle] = useState(() => (fontUrl ? delayRender('load display font') : null));
  useEffect(() => {
    if (!fontUrl || handle === null) return;
    const font = new FontFace('RunableDisplay', `url(${fontUrl})`);
    font
      .load()
      .then((f) => {
        (document as unknown as { fonts: { add: (f: FontFace) => void } }).fonts.add(f);
        continueRender(handle);
      })
      .catch(() => continueRender(handle));
  }, [fontUrl, handle]);

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <OffthreadVideo src={src} />
      {events.map((ev, i) => {
        const from = Math.round(ev.start * fps);
        const dur = Math.max(Math.round((ev.end - ev.start) * fps), Math.round(fps * 0.8));
        return (
          <Sequence key={ev.id} from={from} durationInFrames={dur}>
            {ev.kind === 'keyword' && <KeywordPop ev={ev} index={i} />}
            {ev.kind === 'emoji' && <EmojiPop ev={ev} />}
            {ev.kind === 'sparkle' && <SparkleBurst ev={ev} />}
            {ev.sfxUrl ? <Audio src={ev.sfxUrl} volume={0.55} /> : null}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
