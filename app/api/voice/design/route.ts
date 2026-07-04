import { NextRequest, NextResponse } from 'next/server';
import { designVoice } from '@/lib/elevenlabs';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Voice Design wants 100–1000 chars of sample text for the previews.
const FALLBACK_SAMPLE =
  'Okay so I have to tell you about this AI agent I found called Runable. ' +
  'You literally give it a task, walk away, and it just gets the whole thing done for you. ' +
  'I have never seen anything like it.';

/**
 * POST /api/voice/design  { description, sampleText? }
 * Generates up to 3 voice previews from a text description. Returns { previews }.
 */
export async function POST(req: NextRequest) {
  try {
    const { description, sampleText } = await req.json();
    if (!description || typeof description !== 'string' || !description.trim()) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 });
    }
    let text = typeof sampleText === 'string' ? sampleText.trim() : '';
    if (text.length < 100) text = FALLBACK_SAMPLE;
    if (text.length > 1000) text = text.slice(0, 1000);

    const previews = await designVoice({ description: description.trim(), text });
    return NextResponse.json({ previews });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Voice design failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
