/**
 * RunableWorkAd — kinetic-typography faceless ad, modeled on ChatGPT Work's
 * top Meta ad: hook still → the prompt (typed in) → agent working → real
 * output scrolling by (money shot) → capability cloud → brand + CTA.
 *
 * Music-driven, no VO. Colors from the Runable identity handoff.
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
import { RUNABLE_COLORS as C } from './types';
import { LogoBadge } from './RunableUi';

export interface RunableWorkAdProps {
  hookUrl: string;
  logoUrl: string;
  slideUrls: string[];
  musicUrl: string;
  fontUrl: string;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  [key: string]: unknown;
}

const INK = '#141414';
const FONT = 'RunableSans, Inter, Helvetica, sans-serif';

/** Staggered word cascade (the reference ad's core device). */
function Cascade({
  words,
  fontSize,
  color = INK,
  align = 'left',
  stagger = 3,
}: {
  words: Array<{ t: string; c?: string }>;
  fontSize: number;
  color?: string;
  align?: 'left' | 'center';
  stagger?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        fontFamily: FONT,
        fontWeight: 700,
        fontSize,
        lineHeight: 1.28,
        color,
        textAlign: align,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        columnGap: fontSize * 0.28,
      }}
    >
      {words.map((w, i) => {
        const s = spring({ frame: frame - i * stagger, fps, config: { damping: 14, stiffness: 160, mass: 0.5 } });
        return (
          <span
            key={i}
            style={{
              color: w.c ?? color,
              opacity: s,
              transform: `translateY(${(1 - s) * fontSize * 0.5}px)`,
              display: 'inline-block',
            }}
          >
            {w.t}
          </span>
        );
      })}
    </div>
  );
}

function FadeOut({ lastFrames = 8, children }: { lastFrames?: number; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const o = interpolate(frame, [durationInFrames - lastFrames, durationInFrames - 1], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
}

/* ---------- scenes ---------- */

function Hook({ hookUrl }: { hookUrl: string }) {
  const frame = useCurrentFrame();
  const { durationInFrames, width } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [1.06, 1.16]);
  return (
    <FadeOut>
      <AbsoluteFill style={{ backgroundColor: '#0a0a14' }}>
        <Img src={hookUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})` }} />
        <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(10,10,20,0.35) 0%, rgba(10,10,20,0) 40%)' }} />
        <div style={{ position: 'absolute', top: '20%', left: '10%', right: '10%' }}>
          <Cascade
            words={[{ t: 'More' }, { t: 'room' }, { t: 'for' }, { t: 'the' }, { t: 'work' }, { t: 'you' }, { t: 'love.' }]}
            fontSize={width * 0.105}
            color="#FFFFFF"
            stagger={4}
          />
        </div>
        <div style={{ position: 'absolute', bottom: '3%', left: '5%', fontFamily: FONT, fontSize: width * 0.022, color: 'rgba(255,255,255,0.55)' }}>
          AI-generated image
        </div>
      </AbsoluteFill>
    </FadeOut>
  );
}

function Prompt() {
  const { width } = useVideoConfig();
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const arrowIn = spring({ frame: frame - 30, fps, config: { damping: 11, stiffness: 170, mass: 0.6 } });
  return (
    <FadeOut>
      <AbsoluteFill style={{ backgroundColor: '#FFFFFF', justifyContent: 'center' }}>
        <div style={{ padding: '0 9%' }}>
          <Cascade
            fontSize={width * 0.072}
            words={[
              { t: 'Research' }, { t: 'the' }, { t: 'candle' }, { t: 'market,' },
              { t: 'then' }, { t: 'create' }, { t: 'my' },
              { t: 'launch' , c: C.warmAmber }, { t: 'report', c: C.warmAmber },
              { t: 'and' },
              { t: 'pitch', c: C.coralRed }, { t: 'deck', c: C.coralRed },
            ]}
          />
          <div
            style={{
              marginTop: 60,
              width: width * 0.085,
              height: width * 0.085,
              borderRadius: '50%',
              backgroundColor: INK,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: width * 0.045,
              fontFamily: FONT,
              transform: `scale(${arrowIn})`,
            }}
          >
            ↑
          </div>
        </div>
      </AbsoluteFill>
    </FadeOut>
  );
}

function Working() {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();
  const half = durationInFrames / 2;
  const label = frame < half ? 'Researching the candle market' : 'Designing your pitch deck';
  const dots = '.'.repeat((Math.floor(frame / 9) % 3) + 1);
  const chip = (i: number) => spring({ frame: frame - i * 6, fps, config: { damping: 12, stiffness: 170, mass: 0.5 } });
  return (
    <FadeOut>
      <AbsoluteFill style={{ backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', gap: 70 }}>
        <div style={{ display: 'flex', gap: 28 }}>
          {[
            { label: 'Research', bg: C.deepTeal },
            { label: 'Report', bg: C.warmAmber },
            { label: 'Slides', bg: C.coralRed },
          ].map((p, i) => (
            <div
              key={p.label}
              style={{
                transform: `scale(${chip(i)})`,
                backgroundColor: p.bg,
                color: '#fff',
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: width * 0.036,
                padding: '18px 44px',
                borderRadius: 999,
              }}
            >
              {p.label}
            </div>
          ))}
        </div>
        <div
          style={{
            width: '78%',
            border: '2px solid #d9d9d9',
            borderRadius: 20,
            padding: '38px 44px',
            fontFamily: FONT,
            fontSize: width * 0.038,
            color: '#5a5a5a',
            backgroundColor: '#fff',
          }}
        >
          {label}
          {dots}
        </div>
      </AbsoluteFill>
    </FadeOut>
  );
}

/** Money shot: the real Runable-made deck scrolling by. */
function DeckScroll({ slideUrls }: { slideUrls: string[] }) {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const cardW = width * 0.88;
  const cardH = (cardW * 9) / 16;
  const gap = 46;
  const total = slideUrls.length * (cardH + gap);
  const y = interpolate(frame, [0, durationInFrames], [height * 0.55, -(total - height * 0.45)], {
    easing: (t) => 1 - Math.pow(1 - t, 1.6),
  });
  return (
    <FadeOut>
      <AbsoluteFill style={{ backgroundColor: '#F4EFE6' }}>
        <div style={{ position: 'absolute', top: '8.5%', width: '100%', textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: width * 0.034, color: '#8a8577' }}>
          One prompt. The whole deck.
        </div>
        <div style={{ position: 'absolute', left: (width - cardW) / 2, top: y }}>
          {slideUrls.map((u, i) => (
            <Img
              key={i}
              src={u}
              style={{
                width: cardW,
                height: cardH,
                objectFit: 'cover',
                borderRadius: 22,
                marginBottom: gap,
                boxShadow: '0 18px 50px rgba(30,20,5,0.18)',
                display: 'block',
              }}
            />
          ))}
        </div>
      </AbsoluteFill>
    </FadeOut>
  );
}

function CapabilityCloud() {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const others = ['Websites', 'Reports', 'Videos', 'Images', 'Docs', 'Research', 'Audio', 'Slides'];
  return (
    <FadeOut>
      <AbsoluteFill style={{ backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: width * 0.075, color: INK }}>
          <span style={{ color: C.warmAmber }}>Decks</span> in Runable
        </div>
        <div style={{ marginTop: 60, transform: 'rotate(-8deg)' }}>
          {others.map((o, i) => {
            const s = spring({ frame: frame - 6 - i * 3, fps, config: { damping: 13, stiffness: 150, mass: 0.5 } });
            return (
              <div
                key={o}
                style={{
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: width * 0.052,
                  color: '#b9b9b9',
                  textAlign: 'center',
                  lineHeight: 1.35,
                  opacity: s,
                  transform: `translateX(${(i % 2 === 0 ? -1 : 1) * (1 - s) * 60 + (i % 3 - 1) * width * 0.03}px)`,
                }}
              >
                {o}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </FadeOut>
  );
}

function BrandCta({ logoUrl }: { logoUrl: string }) {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();
  const half = durationInFrames * 0.45;
  const logoIn = spring({ frame, fps, config: { damping: 12, stiffness: 140, mass: 0.7 } });
  if (frame < half) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', gap: 34 }}>
        <Img src={logoUrl} style={{ width: width * 0.3, transform: `scale(${logoIn})`, filter: 'brightness(0.35)' }} />
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: width * 0.09, color: INK }}>Runable</div>
      </AbsoluteFill>
    );
  }
  return (
    <FadeOut>
      <AbsoluteFill style={{ backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', gap: 26 }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: width * 0.08, color: INK }}>Your turn.</div>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: width * 0.043, color: C.warmAmber }}>
          Try Runable — first month for $9
        </div>
      </AbsoluteFill>
    </FadeOut>
  );
}

function EndCard({ logoUrl }: { logoUrl: string }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 13, stiffness: 130, mass: 0.7 } });
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          width: width * 0.26,
          height: width * 0.26,
          borderRadius: 44,
          backgroundColor: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${s})`,
          boxShadow: `0 0 90px ${C.warmAmber}55`,
        }}
      >
        <Img src={logoUrl} style={{ width: '78%', filter: 'brightness(0.35)' }} />
      </div>
    </AbsoluteFill>
  );
}

/* ---------- timeline ---------- */

/** Persistent brand badge: light on the hook image, dark on the light scenes, hidden once the brand/CTA scenes take over. */
function BadgeOverlay({ logoUrl }: { logoUrl: string }) {
  const frame = useCurrentFrame();
  const { width, fps } = useVideoConfig();
  if (frame >= Math.round(10 * fps)) return null; // deck scroll onward brands itself
  const tone = frame < Math.round(2.4 * fps) ? 'light' : 'dark';
  return (
    <div style={{ position: 'absolute', top: '3.2%', width: '100%', display: 'flex', justifyContent: 'center' }}>
      <LogoBadge logoUrl={logoUrl} width={width} tone={tone} />
    </div>
  );
}

export const RunableWorkAd: React.FC<RunableWorkAdProps> = ({ hookUrl, logoUrl, slideUrls, musicUrl, fontUrl, fps }) => {
  const [handle] = useState(() => delayRender('load font'));
  useEffect(() => {
    const font = new FontFace('RunableSans', `url(${fontUrl})`);
    font
      .load()
      .then((f) => {
        (document as unknown as { fonts: { add: (f: FontFace) => void } }).fonts.add(f);
        continueRender(handle);
      })
      .catch(() => continueRender(handle));
  }, [fontUrl, handle]);

  const sec = (s: number) => Math.round(s * fps);
  return (
    <AbsoluteFill style={{ backgroundColor: '#fff' }}>
      <Sequence from={0} durationInFrames={sec(2.4)}>
        <Hook hookUrl={hookUrl} />
      </Sequence>
      <Sequence from={sec(2.4)} durationInFrames={sec(4.4)}>
        <Prompt />
      </Sequence>
      <Sequence from={sec(6.8)} durationInFrames={sec(3.2)}>
        <Working />
      </Sequence>
      <Sequence from={sec(10)} durationInFrames={sec(7)}>
        <DeckScroll slideUrls={slideUrls} />
      </Sequence>
      <Sequence from={sec(17)} durationInFrames={sec(2.4)}>
        <CapabilityCloud />
      </Sequence>
      <Sequence from={sec(19.4)} durationInFrames={sec(2.6)}>
        <BrandCta logoUrl={logoUrl} />
      </Sequence>
      <Sequence from={sec(22)} durationInFrames={sec(1.5)}>
        <EndCard logoUrl={logoUrl} />
      </Sequence>
      <BadgeOverlay logoUrl={logoUrl} />
      <Audio src={musicUrl} volume={(f) => interpolate(f, [sec(21), sec(22)], [0.9, 0.4], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    </AbsoluteFill>
  );
};
