/**
 * Word-level transcription via FAL Whisper, for burning subtitles.
 * Returns word chunks with start/end times. Brand mis-hearings are corrected to "Runable".
 */
import { fal } from '@fal-ai/client';
import { config } from './config';
import { getSignedUrl } from './storage';

export interface WordChunk {
  text: string;
  start: number;
  end: number;
}

let _configured = false;
function ensureFal() {
  if (!_configured) {
    fal.config({ credentials: config.falKey });
    _configured = true;
  }
}

const MISHEARD = /\b(man[ui]s|menace|manage|runeable|runnable|run able)\b/gi;
function fixBrand(text: string): string {
  return text.replace(MISHEARD, 'Runable');
}

export async function transcribeWords(videoStoragePath: string): Promise<WordChunk[]> {
  const audioUrl = await getSignedUrl(videoStoragePath, 3600);
  return transcribeWordsFromUrl(audioUrl);
}

/** Same as transcribeWords but for an already-reachable media URL (e.g. a local file uploaded to FAL storage). */
export async function transcribeWordsFromUrl(audioUrl: string): Promise<WordChunk[]> {
  ensureFal();
  const result = await fal.subscribe('fal-ai/whisper', {
    input: { audio_url: audioUrl, task: 'transcribe', chunk_level: 'word' },
    logs: false,
  });
  const chunks = (result.data as { chunks?: Array<{ timestamp: [number, number]; text: string }> })
    ?.chunks;
  if (!chunks?.length) return [];
  return chunks
    .filter((c) => Array.isArray(c.timestamp) && c.text?.trim())
    .map((c) => ({
      text: fixBrand(c.text.trim()),
      start: c.timestamp[0] ?? 0,
      end: c.timestamp[1] ?? (c.timestamp[0] ?? 0) + 0.4,
    }));
}

/** Group words into caption phrases of ~N words. */
export function groupWords(words: WordChunk[], perGroup = 3): WordChunk[] {
  const groups: WordChunk[] = [];
  for (let i = 0; i < words.length; i += perGroup) {
    const slice = words.slice(i, i + perGroup);
    if (!slice.length) continue;
    groups.push({
      text: slice.map((w) => w.text).join(' '),
      start: slice[0].start,
      end: slice[slice.length - 1].end,
    });
  }
  return groups;
}
