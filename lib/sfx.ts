/**
 * Bundled sound-effect pack for the Remotion emphasis node.
 * Each SFX is generated once via ElevenLabs Sound Generation and cached on disk
 * (.cache/sfx/<name>.mp3). If ELEVENLABS_API_KEY is missing or generation fails,
 * events simply render without sound — never fatal.
 */
import path from 'path';
import { promises as fs } from 'fs';
import { generateSoundEffect } from './elevenlabs';

export const SFX_PACK: Record<string, string> = {
  pop: 'single short cartoon bubble pop, clean, no reverb',
  whoosh: 'single quick soft air whoosh transition, short',
  ding: 'single bright gentle bell ding notification chime',
  chaching: 'single short cash register cha-ching',
  sparkle: 'single short magical sparkle shimmer chime, warm',
  boing: 'single short playful springy boing, cartoon',
};

export type SfxName = keyof typeof SFX_PACK;

const CACHE_DIR = path.join(process.cwd(), '.cache', 'sfx');

/**
 * Ensure the requested SFX exist locally; returns name → absolute file path for
 * the ones that are available. Missing/failed ones are simply omitted.
 */
export async function ensureSfx(names: string[]): Promise<Record<string, string>> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const out: Record<string, string> = {};
  for (const name of [...new Set(names)]) {
    const prompt = SFX_PACK[name];
    if (!prompt) continue;
    const file = path.join(CACHE_DIR, `${name}.mp3`);
    try {
      await fs.access(file);
      out[name] = file;
      continue;
    } catch {
      /* not cached yet */
    }
    try {
      const buf = await generateSoundEffect({ text: prompt, durationSeconds: 1.2 });
      await fs.writeFile(file, buf);
      out[name] = file;
    } catch (err) {
      console.warn(`[sfx] could not generate "${name}":`, err instanceof Error ? err.message : err);
    }
  }
  return out;
}
