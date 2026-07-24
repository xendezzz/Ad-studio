/**
 * PromptShowcase — the "prompt-overlay showcase" faceless format (ChatGPT's
 * signature Meta ad): a real-feeling photo of the product's OUTPUT in the wild,
 * with the prompt that made it typed into a floating prompt bar, then a short
 * headline. ~8s, music-light, no VO.
 *
 * Fully templated: photo, prompt text, headline, subline are props.
 */
import React, { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { LogoBadge, RunablePromptBar } from './RunableUi';

export interface PromptShowcaseProps {
  photoUrl: string;
  logoUrl?: string | null;
  promptText: string;
  headline: string;
  subline?: string;
  musicUrl?: string | null;
  fontUrl: string;
  ui400Url?: string | null;
  ui500Url?: string | null;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  [key: string]: unknown;
}

const FONT = 'RunableSans, Inter, Helvetica, sans-serif';

function PromptBar({ text, appearAt }: { text: string; appearAt: number }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const local = frame - appearAt;
  const pop = spring({ frame: local, fps, config: { damping: 13, stiffness: 150, mass: 0.7 } });
  const typeFrom = appearAt + 8;
  const sendAt = typeFrom + Math.ceil(text.length / 1.4) + 4;
  return (
    <div
      style={{
        position: 'absolute',
        top: '55%',
        left: '7%',
        right: '7%',
        opacity: pop,
        transform: `translateY(${(1 - pop) * 40}px) scale(${0.92 + pop * 0.08})`,
      }}
    >
      <RunablePromptBar width={width * 0.86} text={text} typeFrom={typeFrom} sendAt={sendAt} />
    </div>
  );
}

export const PromptShowcase: React.FC<PromptShowcaseProps> = ({
  photoUrl,
  logoUrl,
  promptText,
  headline,
  subline,
  musicUrl,
  fontUrl,
  ui400Url,
  ui500Url,
  fps,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const [handle] = useState(() => delayRender('load fonts'));
  useEffect(() => {
    const docFonts = (document as unknown as { fonts: { add: (f: FontFace) => void } }).fonts;
    const faces = [
      new FontFace('RunableSans', `url(${fontUrl})`),
      ...(ui400Url ? [new FontFace('InterUI', `url(${ui400Url})`, { weight: '400' })] : []),
      ...(ui500Url ? [new FontFace('InterUI', `url(${ui500Url})`, { weight: '500' })] : []),
    ];
    Promise.allSettled(faces.map((f) => f.load().then((loaded) => docFonts.add(loaded)))).then(() => continueRender(handle));
  }, [fontUrl, ui400Url, ui500Url, handle]);

  const zoom = interpolate(frame, [0, durationInFrames], [1.0, 1.07]);
  const headlineAt = Math.round(fps * 3.6);
  const hl = spring({ frame: frame - headlineAt, fps, config: { damping: 14, stiffness: 130, mass: 0.7 } });
  const sl = spring({ frame: frame - headlineAt - 10, fps, config: { damping: 14, stiffness: 130, mass: 0.7 } });

  return (
    <AbsoluteFill style={{ backgroundColor: '#111' }}>
      <Img src={photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }} />
      {/* soft darkening at the bottom so the headline reads */}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 82%, rgba(0,0,0,0.55) 100%)' }} />

      {logoUrl ? (
        <div style={{ position: 'absolute', top: '3.5%', width: '100%', display: 'flex', justifyContent: 'center' }}>
          <LogoBadge logoUrl={logoUrl} width={width} tone="light" />
        </div>
      ) : null}

      <PromptBar text={promptText} appearAt={Math.round(fps * 0.8)} />

      <div style={{ position: 'absolute', top: '72%', left: '7%', right: '7%', textAlign: 'center' }}>
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: width * 0.058,
            lineHeight: 1.25,
            color: '#fff',
            opacity: hl,
            transform: `translateY(${(1 - hl) * 36}px)`,
            textShadow: '0 2px 18px rgba(0,0,0,0.5)',
          }}
        >
          {headline}
        </div>
        {subline ? (
          <div
            style={{
              marginTop: 22,
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: width * 0.028,
              color: 'rgba(255,255,255,0.82)',
              opacity: sl,
              transform: `translateY(${(1 - sl) * 24}px)`,
            }}
          >
            {subline}
          </div>
        ) : null}
      </div>

      {musicUrl ? (
        <Sequence from={0}>
          <Audio
            src={musicUrl}
            volume={(f) =>
              interpolate(f, [0, 10, durationInFrames - 20, durationInFrames - 1], [0, 0.35, 0.35, 0], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              })
            }
          />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
