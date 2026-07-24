/**
 * Try the Remotion emphasis node on a local video, outside the studio pipeline.
 *
 *   npx tsx scripts/remotion-emphasis-demo.ts <input video> [output mp4]
 *
 * Prints the emphasis plan (or the no-speech warning) and writes the rendered file.
 */
import path from 'path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.join(process.cwd(), '.env') });

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('usage: npx tsx scripts/remotion-emphasis-demo.ts <input video> [output mp4]');
    process.exit(1);
  }
  const out =
    process.argv[3] ?? path.join(process.cwd(), '.cache', `remotion-demo-${Date.now()}.mp4`);

  // import AFTER dotenv so lib/config sees the env vars
  const { emphasizeLocalVideo } = await import('../lib/remotionEmphasis');

  console.log(`→ input:  ${input}`);
  const t0 = Date.now();
  const result = await emphasizeLocalVideo(input, out);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  if (!result.applied) {
    console.warn(`\n⚠️  ${result.warning}`);
    process.exit(0);
  }
  console.log(`\ntranscript: ${result.transcript}`);
  console.log('\nemphasis plan:');
  for (const ev of result.events ?? []) {
    const what = ev.kind === 'keyword' ? `"${ev.text}" (${ev.color})` : ev.kind === 'emoji' ? ev.emoji : '✦ sparkles';
    console.log(`  ${ev.start.toFixed(2)}s–${ev.end.toFixed(2)}s  ${ev.kind.padEnd(7)} ${what}  slot=${ev.slot}  sfx=${ev.sfxUrl ?? 'none'}`);
  }
  console.log(`\n✓ rendered in ${secs}s → ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
