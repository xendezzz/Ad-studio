/**
 * Render the RunableWorkAd composition from the staged assets in
 * .cache/runable-ad-assets (hook.png, logo.png, slide-*.png, music.mp3, inter-bold.ttf).
 *
 *   npx tsx scripts/render-runable-work-ad.ts [output mp4]
 */
import path from 'path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.join(process.cwd(), '.env') });

async function main() {
  const { promises: fs } = await import('fs');
  const { selectComposition, renderMedia } = await import('@remotion/renderer');
  const { getBundle, serveDir } = await import('../lib/remotionRender');

  const assetsDir = path.join(process.cwd(), '.cache', 'runable-ad-assets');
  const out = process.argv[2] ?? path.join(process.cwd(), '.cache', 'runable-work-ad.mp4');

  const slides = (await fs.readdir(assetsDir))
    .filter((f) => /^slide-\d+\.png$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)![0], 10) - parseInt(b.match(/\d+/)![0], 10));

  const serveUrl = await getBundle();
  const { baseUrl, close } = await serveDir(assetsDir);
  try {
    const u = (f: string) => `${baseUrl}/${encodeURIComponent(f)}`;
    const fps = 30;
    const inputProps = {
      hookUrl: u('hook.png'),
      logoUrl: u('logo.png'),
      slideUrls: slides.map(u),
      musicUrl: u('music.mp3'),
      fontUrl: u('inter-bold.ttf'),
      durationInFrames: Math.round(23.5 * fps),
      fps,
      width: 1080,
      height: 1920,
    };
    const composition = await selectComposition({ serveUrl, id: 'RunableWorkAd', inputProps });
    let last = 0;
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      audioCodec: 'aac',
      inputProps,
      outputLocation: out,
      onProgress: ({ progress }) => {
        const pct = Math.floor(progress * 10);
        if (pct > last) { last = pct; console.log(`render ${pct * 10}%`); }
      },
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
