import React from 'react';
import { Composition } from 'remotion';
import { AdEmphasis } from './AdEmphasis';
import { RunableWorkAd, type RunableWorkAdProps } from './RunableWorkAd';
import { PromptShowcase, type PromptShowcaseProps } from './PromptShowcase';
import { CinematicStory, type CinematicStoryProps } from './CinematicStory';
import type { AdEmphasisProps } from './types';

const DEFAULTS: AdEmphasisProps = {
  src: '',
  fontUrl: null,
  events: [],
  durationInFrames: 300,
  fps: 30,
  width: 1080,
  height: 1920,
};

const WORK_AD_DEFAULTS: RunableWorkAdProps = {
  hookUrl: '',
  logoUrl: '',
  slideUrls: [],
  musicUrl: '',
  fontUrl: '',
  durationInFrames: 705,
  fps: 30,
  width: 1080,
  height: 1920,
};

const SHOWCASE_DEFAULTS: PromptShowcaseProps = {
  photoUrl: '',
  promptText: '',
  headline: '',
  subline: '',
  musicUrl: null,
  fontUrl: '',
  durationInFrames: 240,
  fps: 30,
  width: 1080,
  height: 1920,
};

const STORY_DEFAULTS: CinematicStoryProps = {
  clip1Url: '', clip2Url: '', siteUrl: '', voUserUrl: '', voAgentUrl: '',
  musicUrl: '', fontUrl: '', logoUrl: '',
  hookText: '', promptEcho: '', statusText: '', headline: '', ctaLine: '',
  subtitles: [], voUserAt: 1.5, voAgentAt: 12,
  durationInFrames: 720, fps: 30, width: 1080, height: 1920,
};

export const Root: React.FC = () => (
  <>
  <Composition
    id="CinematicStory"
    component={CinematicStory}
    durationInFrames={STORY_DEFAULTS.durationInFrames}
    fps={STORY_DEFAULTS.fps}
    width={STORY_DEFAULTS.width}
    height={STORY_DEFAULTS.height}
    defaultProps={STORY_DEFAULTS}
    calculateMetadata={({ props }) => ({
      durationInFrames: props.durationInFrames,
      fps: props.fps,
      width: props.width,
      height: props.height,
      props,
    })}
  />
  <Composition
    id="PromptShowcase"
    component={PromptShowcase}
    durationInFrames={SHOWCASE_DEFAULTS.durationInFrames}
    fps={SHOWCASE_DEFAULTS.fps}
    width={SHOWCASE_DEFAULTS.width}
    height={SHOWCASE_DEFAULTS.height}
    defaultProps={SHOWCASE_DEFAULTS}
    calculateMetadata={({ props }) => ({
      durationInFrames: props.durationInFrames,
      fps: props.fps,
      width: props.width,
      height: props.height,
      props,
    })}
  />
  <Composition
    id="RunableWorkAd"
    component={RunableWorkAd}
    durationInFrames={WORK_AD_DEFAULTS.durationInFrames}
    fps={WORK_AD_DEFAULTS.fps}
    width={WORK_AD_DEFAULTS.width}
    height={WORK_AD_DEFAULTS.height}
    defaultProps={WORK_AD_DEFAULTS}
    calculateMetadata={({ props }) => ({
      durationInFrames: props.durationInFrames,
      fps: props.fps,
      width: props.width,
      height: props.height,
      props,
    })}
  />
  <Composition
    id="AdEmphasis"
    component={AdEmphasis}
    durationInFrames={DEFAULTS.durationInFrames}
    fps={DEFAULTS.fps}
    width={DEFAULTS.width}
    height={DEFAULTS.height}
    defaultProps={DEFAULTS}
    calculateMetadata={({ props }) => ({
      durationInFrames: props.durationInFrames,
      fps: props.fps,
      width: props.width,
      height: props.height,
      props,
    })}
  />
  </>
);
