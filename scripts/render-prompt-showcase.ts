/**
 * Render the PromptShowcase composition (prompt-overlay faceless format).
 *
 *   npx tsx scripts/render-prompt-showcase.ts [output mp4]
 */
import path from 'path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.join(process.cwd(), '.env') });

async function main() {
  const { selectComposition, renderMedia } = await import('@remotion/renderer');
  const { getBundle, serveDir } = await import('../lib/remotionRender');

  const assetsDir = path.join(process.cwd(), '.cache', 'runable-ad-assets');
  const out = process.argv[2] ?? path.join(process.cwd(), '.cache', 'runable-logo-showcase.mp4');

  const serveUrl = await getBundle();
  const { baseUrl, close } = await serveDir(assetsDir);
  try {
    const u = (f: string) => `${baseUrl}/${encodeURIComponent(f)}`;
    const fps = 30;
    const inputProps = {
      photoUrl: u('cup.png'),
      logoUrl: u('logo.png'),
      promptText: 'Turn my dog into a logo for my coffee shop.',
      headline: 'Your dog. Your logo. One sentence.',
      subline: 'Runable builds it — first month for $9',
      musicUrl: u('music.mp3'),
      fontUrl: u('inter-bold.ttf'),
      ui400Url: u('inter-400.woff2'),
      ui500Url: u('inter-500.woff2'),
      durationInFrames: 8 * fps,
      fps,
      width: 1080,
      height: 1920,
    };
    const composition = await selectComposition({ serveUrl, id: 'PromptShowcase', inputProps });
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
