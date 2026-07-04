import { NextRequest, NextResponse } from 'next/server';
import { transcribeWords } from '@/lib/transcribe';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** POST /api/voice/transcribe  { video } — Whisper the clip's audio. Returns { text }. */
export async function POST(req: NextRequest) {
  try {
    const { video } = await req.json();
    if (!video || typeof video !== 'string') {
      return NextResponse.json({ error: 'video is required' }, { status: 400 });
    }
    const words = await transcribeWords(video);
    const text = words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transcription failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
