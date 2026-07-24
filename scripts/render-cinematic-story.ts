/**
 * Render the CinematicStory composition (voice-first story faceless format).
 *
 *   npx tsx scripts/render-cinematic-story.ts [output mp4]
 */
import path from 'path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.join(process.cwd(), '.env') });

async function main() {
  const { selectComposition, renderMedia } = await import('@remotion/renderer');
  const { getBundle, serveDir } = await import('../lib/remotionRender');

  const assetsDir = path.join(process.cwd(), '.cache', 'runable-ad-assets');
  const out = process.argv[2] ?? path.join(process.cwd(), '.cache', 'runable-story-ad.mp4');

  const serveUrl = await getBundle();
  const { baseUrl, close } = await serveDir(assetsDir);
  try {
    const u = (f: string) => `${baseUrl}/${encodeURIComponent(f)}`;
    const fps = 30;
    const inputProps = {
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
      hookText: 'Just say it. Runable builds it.',
      promptEcho: 'Build me a website for my bakery — menu, photos, and an order button.',
      statusText: 'Building Maya’s Oven…',
      headline: 'A whole website. Zero clicks.',
      ctaLine: 'Grab your first month — $9',
      subtitles: [
        { text: 'Runable — build me a website for my bakery.', start: 1.5, end: 4.4 },
        { text: 'Menu, photos… and an order button.', start: 4.4, end: 7.2 },
        { text: 'Done. Maya’s Oven is live —', start: 11.2, end: 13.4 },
        { text: 'menu, gallery, and orders in one tap.', start: 13.4, end: 15.4 },
      ],
      voUserAt: 1.5,
      voAgentAt: 11.2,
      durationInFrames: 26 * fps,
      fps,
      width: 1080,
      height: 1920,
    };
    const composition = await selectComposition({ serveUrl, id: 'CinematicStory', inputProps });
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      audioCodec: 'aac',
      inputProps,
      outputLocation: out,
    });
    console.log(`✓ rendered → ${out}`);
  } finally {
    close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
