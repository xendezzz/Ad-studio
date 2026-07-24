/**
 * CinematicStory — the "voice-first day in the life" faceless-story format
 * (modeled on ChatGPT's 30s Hindi story ad): generated live-action clips of a
 * small-business owner talking to Runable by voice, a crisp phone-UI scene
 * showing the agent working, the real output, then brand + CTA.
 *
 * All narrative beats are props so the automation can re-skin the story.
 */
import React, { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { RUNABLE_COLORS as C } from './types';
import { AgentText, LogoBadge, OutputCard, ProLabel, RUI, RunablePromptBar, StepsRow, UI_FONT, UserBubble, uiScale } from './RunableUi';

export interface SubtitleCue {
  text: string;
  start: number; // seconds, composition-global
  end: number;
}

export interface CinematicStoryProps {
  clip1Url: string; // establishing scene
  clip2Url: string; // talking-to-phone scene
  siteUrl: string; // output screenshot (money shot)
  voUserUrl: string; // owner's spoken request
  voAgentUrl: string; // Runable's spoken reply
  musicUrl: string;
  fontUrl: string;
  /** Inter 400/500 for the product-UI scene (real app font) */
  ui400Url?: string | null;
  ui500Url?: string | null;
  logoUrl: string;
  hookText: string;
  promptEcho: string; // the request, shown in the chat UI
  statusText: string;
  headline: string;
  ctaLine: string;
  subtitles: SubtitleCue[];
  voUserAt: number; // seconds
  voAgentAt: number;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  [key: string]: unknown;
}

const FONT = 'RunableSans, Inter, Helvetica, sans-serif';
const INK = '#141414';

function Subtitles({ cues }: { cues: SubtitleCue[] }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const t = frame / fps;
  const cue = cues.find((c) => t >= c.start && t <= c.end);
  if (!cue) return null;
  return (
    <div style={{ position: 'absolute', bottom: '12%', left: '8%', right: '8%', textAlign: 'center' }}>
      <span
        style={{
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: width * 0.036,
          lineHeight: 1.5,
          color: '#fff',
          textShadow: '0 1px 6px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)',
          padding: '6px 14px',
        }}
      >
        {cue.text}
      </span>
    </div>
  );
}

function HookText({ text }: { text: string }) {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();
  const s = spring({ frame: frame - Math.round(fps * 0.6), fps, config: { damping: 14, stiffness: 120, mass: 0.7 } });
  const out = interpolate(frame, [durationInFrames - 10, durationInFrames - 1], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', top: '14%', left: '9%', right: '9%', textAlign: 'center', opacity: s * out, transform: `translateY(${(1 - s) * 30}px)` }}>
      <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: width * 0.052, lineHeight: 1.35, color: '#fff', textShadow: '0 2px 16px rgba(0,0,0,0.6)' }}>
        {text}
      </span>
    </div>
  );
}

function Waveform({ active }: { active: boolean }) {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const bars = 24;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, height: width * 0.05 }}>
      {Array.from({ length: bars }, (_, i) => {
        const h = active ? 0.25 + 0.75 * Math.abs(Math.sin(frame / 4 + i * 0.9) * Math.sin(frame / 9 + i)) : 0.2;
        return <div key={i} style={{ width: 5, height: `${h * 100}%`, borderRadius: 3, backgroundColor: '#4a4a4a' }} />;
      })}
    </div>
  );
}

/** Phone-UI scene: the REAL Runable mobile chat (tokens from the product Figma). */
function PhoneUi({ promptEcho, statusText, siteUrl }: { promptEcho: string; statusText: string; siteUrl: string }) {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();
  const s = uiScale(width);
  const bubbleIn = spring({ frame, fps, config: { damping: 13, stiffness: 140, mass: 0.6 } });
  const agentAt = Math.round(fps * 1.2);
  const siteAt = Math.round(fps * 3.0);
  const agentIn = spring({ frame: frame - agentAt, fps, config: { damping: 13, stiffness: 140, mass: 0.6 } });
  const stepsIn = spring({ frame: frame - siteAt + 6, fps, config: { damping: 13, stiffness: 140, mass: 0.6 } });
  const out = interpolate(frame, [durationInFrames - 8, durationInFrames - 1], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ backgroundColor: RUI.pageBg, opacity: out }}>
      <div style={{ position: 'absolute', top: s(22), width: '100%', textAlign: 'center', fontFamily: UI_FONT, fontWeight: 500, fontSize: s(14), color: RUI.secondary }}>
        Runable
      </div>
      <div style={{ position: 'absolute', top: s(56), left: s(18), right: s(18), display: 'flex', flexDirection: 'column', gap: s(18) }}>
        <div style={{ opacity: bubbleIn, transform: `translateY(${(1 - bubbleIn) * 24}px)` }}>
          <UserBubble text={promptEcho} width={width} />
        </div>
        <div style={{ opacity: agentIn, transform: `translateY(${(1 - agentIn) * 20}px)`, display: 'flex', flexDirection: 'column', gap: s(10) }}>
          <ProLabel width={width} />
          <AgentText text={`On it! ${statusText}`} width={width} revealFrom={agentAt + 4} />
        </div>
        <div style={{ opacity: stepsIn }}>
          <StepsRow text="Completed 10 steps" width={width} />
        </div>
        <OutputCard title="Maya’s Oven — Website" imageUrl={siteUrl} width={width} appearAt={siteAt} />
      </div>
      <div style={{ position: 'absolute', bottom: s(18), left: s(14), right: s(14) }}>
        <RunablePromptBar width={width} />
      </div>
    </AbsoluteFill>
  );
}

/** Money-shot: the site big, slow pan, headline. */
function SiteShowcase({ siteUrl, headline }: { siteUrl: string; headline: string }) {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const pan = interpolate(frame, [0, durationInFrames], [0, -height * 0.16]);
  const hl = spring({ frame: frame - Math.round(fps * 0.8), fps, config: { damping: 14, stiffness: 120, mass: 0.7 } });
  const out = interpolate(frame, [durationInFrames - 8, durationInFrames - 1], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ backgroundColor: '#F4EFE6', opacity: out }}>
      <div style={{ position: 'absolute', top: `calc(12% + ${pan}px)`, left: '11%', right: '11%' }}>
        <Img src={siteUrl} style={{ width: '100%', borderRadius: 34, boxShadow: '0 26px 90px rgba(30,20,5,0.25)', display: 'block' }} />
      </div>
      <div style={{ position: 'absolute', bottom: '7%', left: '8%', right: '8%', textAlign: 'center', opacity: hl, transform: `translateY(${(1 - hl) * 30}px)` }}>
        <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: width * 0.055, color: INK }}>{headline}</span>
      </div>
    </AbsoluteFill>
  );
}

function Cta({ ctaLine, logoUrl }: { ctaLine: string; logoUrl: string }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const a = spring({ frame, fps, config: { damping: 13, stiffness: 130, mass: 0.7 } });
  const b = spring({ frame: frame - 12, fps, config: { damping: 13, stiffness: 130, mass: 0.7 } });
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', gap: 40 }}>
      <div
        style={{
          width: width * 0.2,
          height: width * 0.2,
          borderRadius: 36,
          backgroundColor: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${a})`,
          boxShadow: `0 0 80px ${C.warmAmber}44`,
        }}
      >
        <Img src={logoUrl} style={{ width: '76%', filter: 'brightness(0.35)' }} />
      </div>
      <div style={{ textAlign: 'center', opacity: b, transform: `translateY(${(1 - b) * 24}px)` }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: width * 0.07, color: '#fff' }}>Runable</div>
        <div style={{ marginTop: 18, fontFamily: FONT, fontWeight: 700, fontSize: width * 0.038, color: C.warmAmber }}>{ctaLine}</div>
      </div>
    </AbsoluteFill>
  );
}

export const CinematicStory: React.FC<CinematicStoryProps> = (p) => {
  const [handle] = useState(() => delayRender('load fonts'));
  useEffect(() => {
    const docFonts = (document as unknown as { fonts: { add: (f: FontFace) => void } }).fonts;
    const faces = [
      new FontFace('RunableSans', `url(${p.fontUrl})`),
      ...(p.ui400Url ? [new FontFace('InterUI', `url(${p.ui400Url})`, { weight: '400' })] : []),
      ...(p.ui500Url ? [new FontFace('InterUI', `url(${p.ui500Url})`, { weight: '500' })] : []),
    ];
    Promise.allSettled(faces.map((f) => f.load().then((loaded) => docFonts.add(loaded)))).then(() => continueRender(handle));
  }, [p.fontUrl, p.ui400Url, p.ui500Url, handle]);

  const sec = (s: number) => Math.round(s * p.fps);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Sequence from={0} durationInFrames={sec(5)}>
        <OffthreadVideo src={p.clip1Url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <HookText text={p.hookText} />
      </Sequence>
      <Sequence from={sec(5)} durationInFrames={sec(5)}>
        <OffthreadVideo src={p.clip2Url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </Sequence>
      <Sequence from={sec(10)} durationInFrames={sec(5.5)}>
        <PhoneUi promptEcho={p.promptEcho} statusText={p.statusText} siteUrl={p.siteUrl} />
      </Sequence>
      <Sequence from={sec(15.5)} durationInFrames={sec(5)}>
        <SiteShowcase siteUrl={p.siteUrl} headline={p.headline} />
      </Sequence>
      <Sequence from={sec(20.5)} durationInFrames={p.durationInFrames - sec(20.5)}>
        <Cta ctaLine={p.ctaLine} logoUrl={p.logoUrl} />
      </Sequence>

      {/* persistent brand badge: over the film scenes (light) and the showcase (dark); CTA scene brands itself */}
      <Sequence from={0} durationInFrames={sec(10)}>
        <div style={{ position: 'absolute', top: '3.2%', right: '5%' }}>
          <LogoBadge logoUrl={p.logoUrl} width={1080} tone="light" size={0.028} />
        </div>
      </Sequence>
      <Sequence from={sec(15.5)} durationInFrames={sec(5)}>
        <div style={{ position: 'absolute', top: '3.2%', right: '5%' }}>
          <LogoBadge logoUrl={p.logoUrl} width={1080} tone="dark" size={0.028} />
        </div>
      </Sequence>

      <Subtitles cues={p.subtitles} />

      <Sequence from={sec(p.voUserAt)}>
        <Audio src={p.voUserUrl} volume={1} />
      </Sequence>
      <Sequence from={sec(p.voAgentAt)}>
        <Audio src={p.voAgentUrl} volume={1} />
      </Sequence>
      <Audio
        src={p.musicUrl}
        loop
        volume={(f) =>
          interpolate(f, [0, 20, p.durationInFrames - 30, p.durationInFrames - 1], [0, 0.16, 0.16, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        }
      />
    </AbsoluteFill>
  );
};
