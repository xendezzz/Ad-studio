/**
 * RunableUi — pixel-faithful recreations of Runable's real product UI for use
 * inside ad compositions. Extracted from the product Figma (abhijeet_labs →
 * "UI screens", 2026-07-22):
 *
 *   page bg        #141414
 *   user bubble    #1a1a1a, radius 20, light-grey text #e0e0e0
 *   agent reply    plain text on page bg (NO bubble), #d6d6d6
 *   secondary text #8a8a8a  ("Completed 10 steps ›", placeholder)
 *   input bar      #191919, radius 24, subtle #2a2a2a border,
 *                  "+" in #2a2a2a circle bottom-left,
 *                  send = WHITE circle + dark arrow bottom-right
 *   output card    #191919, radius 16, header row: title + white "Publish" pill
 *   font           Inter (400/500 body, 600 titles)
 */
import React from 'react';
import { Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const RUI = {
  pageBg: '#141414',
  bubbleBg: '#1a1a1a',
  bubbleText: '#e0e0e0',
  agentText: '#d6d6d6',
  secondary: '#8a8a8a',
  inputBg: '#191919',
  border: '#2a2a2a',
  cardBg: '#191919',
  white: '#ffffff',
  ink: '#1a1a1a',
} as const;

export const UI_FONT = 'InterUI, Inter, Helvetica, sans-serif';

/** Scaled UI unit: Figma frames are 400w — s(px) maps design px to render px. */
export const uiScale = (width: number) => (px: number) => (px / 400) * width;

export function UserBubble({ text, width }: { text: string; width: number }) {
  const s = uiScale(width);
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div
        style={{
          maxWidth: '82%',
          backgroundColor: RUI.bubbleBg,
          borderRadius: s(20),
          padding: `${s(14)}px ${s(18)}px`,
          fontFamily: UI_FONT,
          fontWeight: 400,
          fontSize: s(15),
          lineHeight: 1.5,
          color: RUI.bubbleText,
        }}
      >
        {text}
      </div>
    </div>
  );
}

export function ProLabel({ width }: { width: number }) {
  const s = uiScale(width);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: s(7), color: RUI.secondary, fontFamily: UI_FONT, fontWeight: 500, fontSize: s(13) }}>
      <span style={{ fontSize: s(12) }}>✦</span> Pro
    </div>
  );
}

export function AgentText({ text, width, revealFrom = 0 }: { text: string; width: number; revealFrom?: number }) {
  const frame = useCurrentFrame();
  const s = uiScale(width);
  const chars = Math.max(0, Math.floor((frame - revealFrom) * 3));
  return (
    <div style={{ fontFamily: UI_FONT, fontWeight: 400, fontSize: s(15), lineHeight: 1.55, color: RUI.agentText }}>
      {text.slice(0, chars)}
    </div>
  );
}

export function StepsRow({ text, width }: { text: string; width: number }) {
  const s = uiScale(width);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: s(6), fontFamily: UI_FONT, fontWeight: 400, fontSize: s(13.5), color: RUI.secondary }}>
      {text} <span style={{ fontSize: s(12) }}>›</span>
    </div>
  );
}

export function OutputCard({
  title,
  imageUrl,
  width,
  appearAt = 0,
}: {
  title: string;
  imageUrl: string;
  width: number;
  appearAt?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = uiScale(width);
  const pop = spring({ frame: frame - appearAt, fps, config: { damping: 14, stiffness: 110, mass: 0.8 } });
  return (
    <div
      style={{
        backgroundColor: RUI.cardBg,
        border: `1px solid ${RUI.border}`,
        borderRadius: s(16),
        overflow: 'hidden',
        opacity: pop,
        transform: `translateY(${(1 - pop) * s(40)}px) scale(${0.96 + pop * 0.04})`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${s(12)}px ${s(14)}px` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: s(8), fontFamily: UI_FONT, fontWeight: 500, fontSize: s(13), color: RUI.bubbleText }}>
          <span style={{ color: RUI.secondary }}>▣</span> {title}
        </div>
        <div
          style={{
            backgroundColor: RUI.white,
            color: RUI.ink,
            borderRadius: 999,
            padding: `${s(6)}px ${s(14)}px`,
            fontFamily: UI_FONT,
            fontWeight: 500,
            fontSize: s(12.5),
          }}
        >
          Publish
        </div>
      </div>
      <div style={{ padding: `0 ${s(10)}px ${s(10)}px` }}>
        <Img src={imageUrl} style={{ width: '100%', height: s(250), objectFit: 'cover', objectPosition: 'top', borderRadius: s(10), display: 'block' }} />
      </div>
    </div>
  );
}

/** The real Runable prompt bar: dark rounded input, "+" circle, white send circle. */
export function RunablePromptBar({
  width,
  text,
  placeholder = 'Type your idea here...',
  typeFrom = 0,
  sendAt,
}: {
  width: number;
  text?: string;
  placeholder?: string;
  typeFrom?: number;
  sendAt?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = uiScale(width);
  const chars = text ? Math.max(0, Math.floor((frame - typeFrom) * 1.4)) : 0;
  const shown = text ? text.slice(0, chars) : '';
  const typing = text ? chars < text.length : false;
  const sendPop = sendAt != null ? spring({ frame: frame - sendAt, fps, config: { damping: 9, stiffness: 200, mass: 0.5 } }) : 1;
  return (
    <div
      style={{
        backgroundColor: RUI.inputBg,
        border: `1px solid ${RUI.border}`,
        borderRadius: s(24),
        padding: `${s(16)}px ${s(14)}px ${s(12)}px`,
        minHeight: s(96),
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxShadow: '0 12px 44px rgba(0,0,0,0.45)',
      }}
    >
      <div style={{ fontFamily: UI_FONT, fontWeight: 400, fontSize: s(15), lineHeight: 1.45, color: shown ? RUI.bubbleText : RUI.secondary, padding: `0 ${s(6)}px` }}>
        {shown || placeholder}
        {typing && <span style={{ opacity: frame % 16 < 8 ? 1 : 0 }}>|</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: s(14) }}>
        <div
          style={{
            width: s(34),
            height: s(34),
            borderRadius: '50%',
            backgroundColor: RUI.border,
            color: RUI.bubbleText,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: UI_FONT,
            fontWeight: 400,
            fontSize: s(18),
          }}
        >
          +
        </div>
        <div
          style={{
            width: s(36),
            height: s(36),
            borderRadius: '50%',
            backgroundColor: RUI.white,
            color: RUI.ink,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: s(17),
            transform: `scale(${sendPop})`,
          }}
        >
          →
        </div>
      </div>
    </div>
  );
}

/**
 * Brand badge: logo tile + "Runable" wordmark. `tone='light'` for dark/photo
 * scenes (white text), `tone='dark'` for light scenes (ink text). The logo
 * asset is light grey, so it sits in a small white tile and gets darkened.
 */
export function LogoBadge({
  logoUrl,
  width,
  tone = 'light',
  size = 0.032,
}: {
  logoUrl: string;
  width: number;
  tone?: 'light' | 'dark';
  size?: number;
}) {
  const h = width * size;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: h * 0.38 }}>
      <div
        style={{
          width: h * 1.15,
          height: h * 1.15,
          borderRadius: h * 0.32,
          backgroundColor: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: tone === 'light' ? '0 2px 12px rgba(0,0,0,0.35)' : '0 2px 10px rgba(30,20,5,0.15)',
        }}
      >
        <Img src={logoUrl} style={{ width: '74%', filter: 'brightness(0.35)' }} />
      </div>
      <span
        style={{
          fontFamily: 'RunableSans, InterUI, Inter, Helvetica, sans-serif',
          fontWeight: 700,
          fontSize: h,
          color: tone === 'light' ? '#ffffff' : RUI.pageBg,
          textShadow: tone === 'light' ? '0 1px 10px rgba(0,0,0,0.4)' : 'none',
          letterSpacing: '0.01em',
        }}
      >
        Runable
      </span>
    </div>
  );
}

/** Interpolate helper re-export spot (kept minimal). */
export { interpolate as uiInterpolate };
