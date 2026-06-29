/**
 * Name a clip by its content: what's spoken in it (transcript); if there's no speech, the
 * on-screen caption/hook text on the first frame (Opus 4.8 vision). Falls back to a default.
 */
import path from 'path';
import { promises as fs } from 'fs';
import { execFileSync } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config';
import { transcribeWords } from './transcribe';
import { getFfmpeg } from './ffmpegBinaries';
import { createTempWorkspace, cleanupTempWorkspace } from './tempWorkspace';
import { downloadToPath } from './storage';

/** First ~8 words → a clean, capped name. */
function toName(text: string): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 8);
  let name = words.join(' ');
  if (name.length > 64) name = name.slice(0, 61).trim() + '…';
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
}

/** Opus 4.8 vision: read the big on-screen caption/title on the clip's first frame. */
async function readOnScreenText(video: string): Promise<string | null> {
  if (!config.anthropicApiKey) return null;
  const ws = createTempWorkspace('clip-name');
  try {
    const local = path.join(ws, 'in.mp4');
    await downloadToPath(video, local);
    const frame = path.join(ws, 'frame.jpg');
    execFileSync(getFfmpeg(), ['-y', '-ss', '0.2', '-i', local, '-frames:v', '1', '-q:v', '3', frame], { timeout: 60000 });
    const buf = await fs.readFile(frame);
    const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    const resp = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 200,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } },
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') } },
            { type: 'text', text: 'Read the main large on-screen caption/hook text in this video frame. Ignore watermarks, logos and tiny UI text. Respond JSON {"text": "<the on-screen text, or empty if there is none>"}.' },
          ],
        },
      ],
    } as Parameters<typeof anthropic.messages.create>[0]);
    const blocks = (resp as { content: Array<{ type: string; text?: string }> }).content;
    const m = (blocks.find((b) => b.type === 'text')?.text ?? '').match(/\{[\s\S]*\}/);
    return m ? ((JSON.parse(m[0]) as { text?: string }).text || '').trim() || null : null;
  } catch (e) {
    console.warn('[clipName] OCR failed:', e instanceof Error ? e.message : e);
    return null;
  } finally {
    cleanupTempWorkspace(ws);
  }
}

/** Derive a clip name from speech, else on-screen text. `fallback` used when neither yields text. */
export async function nameClip(video: string, fallback = 'Hook'): Promise<string> {
  let name = '';
  try {
    const words = await transcribeWords(video);
    name = toName(words.map((w) => w.text).join(' '));
  } catch {
    /* no speech / transcription failed → fall through to OCR */
  }
  if (!name) {
    const ocr = await readOnScreenText(video);
    if (ocr) name = toName(ocr);
  }
  return name || fallback;
}
