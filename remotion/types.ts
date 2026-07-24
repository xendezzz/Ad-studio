/**
 * Shared types for the "Remotion" emphasis node — the auto graphics + SFX layer.
 * An EmphasisEvent is one moment in the ad where an important spoken word gets
 * a graphic (keyword pop / emoji / star sparkles) and an optional sound effect.
 */

/** Runable brand palette (from the visual-identity handoff). */
export const RUNABLE_COLORS = {
  acidYellow: '#F5C842',
  deepTeal: '#0E9B8A',
  deepCobalt: '#1A3A8A',
  warmAmber: '#E8A830',
  coralRed: '#E8573A',
  warmIvory: '#FAE6C0',
  glowTeal: '#A8E4D8',
  burntOrange: '#C45E10',
} as const;

export type EmphasisKind = 'keyword' | 'emoji' | 'sparkle';

/** Vertical slots keep graphics off the speaker's face (center of frame). */
export type EmphasisSlot = 'top' | 'upper' | 'lower';

export interface EmphasisEvent {
  id: string;
  kind: EmphasisKind;
  /** seconds into the video */
  start: number;
  end: number;
  /** keyword: the (short) text to pop on screen */
  text?: string;
  /** emoji: the emoji character(s) */
  emoji?: string;
  /** keyword fill color — one of the Runable palette hexes */
  color?: string;
  slot: EmphasisSlot;
  /** URL of the sound effect to play at `start` (resolved by the renderer) */
  sfxUrl?: string | null;
}

export interface AdEmphasisData {
  /** URL of the source video (served locally during render) */
  src: string;
  /** URL of the display font (Anton) — loaded via FontFace before render */
  fontUrl?: string | null;
  events: EmphasisEvent[];
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}

/** Remotion input-props compatibility (needs Record<string, unknown>). */
export type AdEmphasisProps = AdEmphasisData & { [key: string]: unknown };
