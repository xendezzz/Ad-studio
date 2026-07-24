/**
 * Non-UGC ad renderer — server-side render of the three faceless-ad Remotion
 * templates (PromptShowcase, CinematicStory, RunableWorkAd) with user-editable
 * copy. Assets (photos, clips, VO, music, fonts, logo) come from the staged
 * kit in .cache/runable-ad-assets; copy comes from the Non UGC page.
 *
 * Output is uploaded to Storage (gen/nonugc) and tracked in gen_jobs.
 */
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { selectComposition, renderMedia } from '@remotion/renderer';
import { getBundle, serveDir } from './remotionRender';

export type NonUgcFormat = 'showcase' | 'story' | 'kinetic';

export interface ShowcaseParams {
  promptText: string;
  headline: string;
  subline: string;
}

export interface StoryParams {
  hookText: string;
  promptEcho: string;
  statusText: string;
  headline: string;
  ctaLine: string;
}

export type NonUgcParams = Partial<ShowcaseParams & StoryParams>;

export const NONUGC_DEFAULTS: { showcase: ShowcaseParams; story: StoryParams } = {
  showcase: {
    promptText: 'Turn my dog into a logo for my coffee shop.',
    headline: 'Your dog. Your logo. One sentence.',
    subline: 'Runable builds it — first month for $9',
  },
  story: {
    hookText: 'Just say it. Runable builds it.',
    promptEcho: 'Build me a website for my bakery — menu, photos, and an order button.',
    statusText: 'Building Maya’s Oven…',
    headline: 'A whole website. Zero clicks.',
    ctaLine: 'Grab your first month — $9',
  },
};

const ASSETS_DIR = path.join(process.cwd(), '.cache', 'runable-ad-assets');

/**
 * Render the chosen format into public/nonugc/ (served statically by Next);
 * returns the browser URL. Local-first — no Supabase dependency.
 */
export async function renderNonUgcAd(format: NonUgcFormat, params: NonUgcParams): Promise<string> {
  const serveUrl = await getBundle();
  const { baseUrl, close } = await serveDir(ASSETS_DIR);
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nonugc-'));
  const outFile = path.join(outDir, `${format}.mp4`);
  try {
    const u = (f: string) => `${baseUrl}/${encodeURIComponent(f)}`;
    const fps = 30;
    const common = { fps, width: 1080, height: 1920 };

    let compositionId: string;
    let inputProps: Record<string, unknown>;

    if (format === 'showcase') {
      const p = { ...NONUGC_DEFAULTS.showcase, ...params };
      compositionId = 'PromptShowcase';
      inputProps = {
        ...common,
        photoUrl: u('cup.png'),
        logoUrl: u('logo.png'),
        musicUrl: u('music.mp3'),
        fontUrl: u('inter-bold.ttf'),
        ui400Url: u('inter-400.woff2'),
        ui500Url: u('inter-500.woff2'),
        promptText: p.promptText,
        headline: p.headline,
        subline: p.subline,
        durationInFrames: 8 * fps,
      };
    } else if (format === 'story') {
      const p = { ...NONUGC_DEFAULTS.story, ...params };
      compositionId = 'CinematicStory';
      inputProps = {
        ...common,
        clip1Url: u('kitchen.mp4'),
        clip2Url: u('street.mp4'),
        siteUrl: u('site.png'),
        voUserUrl: u('vo-maya.mp3'),
        voAgentUrl: u('vo-agent.mp3'),
        musicUrl: u('music.mp3'),
        fontUrl: u('inter-bold.ttf'),
        ui400Url: u('inter-400.woff2'),
        ui500Url: u('inter-500.woff2'),
        logoUrl: u('logo.png'),
        hookText: p.hookText,
        promptEcho: p.promptEcho,
        statusText: p.statusText,
        headline: p.headline,
        ctaLine: p.ctaLine,
        subtitles: [
          { text: 'Runable — build me a website for my bakery.', start: 1.5, end: 4.4 },
          { text: 'Menu, photos… and an order button.', start: 4.4, end: 7.2 },
          { text: 'Done. Maya’s Oven is live —', start: 11.2, end: 13.4 },
          { text: 'menu, gallery, and orders in one tap.', start: 13.4, end: 15.4 },
        ],
        voUserAt: 1.5,
        voAgentAt: 11.2,
        durationInFrames: 26 * fps,
      };
    } else {
      compositionId = 'RunableWorkAd';
      const slides = (await fs.readdir(ASSETS_DIR))
        .filter((f) => /^slide-\d+\.png$/.test(f))
        .sort((a, b) => parseInt(a.match(/\d+/)![0], 10) - parseInt(b.match(/\d+/)![0], 10));
      inputProps = {
        ...common,
        hookUrl: u('hook.png'),
        logoUrl: u('logo.png'),
        slideUrls: slides.map(u),
        musicUrl: u('music.mp3'),
        fontUrl: u('inter-bold.ttf'),
        durationInFrames: Math.round(23.5 * fps),
      };
    }

    const composition = await selectComposition({ serveUrl, id: compositionId, inputProps });
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      audioCodec: 'aac',
      inputProps,
      outputLocation: outFile,
    });
    const publicDir = path.join(process.cwd(), 'public', 'nonugc');
    await fs.mkdir(publicDir, { recursive: true });
    const name = `${format}-${Date.now()}.mp4`;
    await fs.copyFile(outFile, path.join(publicDir, name));
    return `/nonugc/${name}`;
  } finally {
    close();
    await fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
  }
}
