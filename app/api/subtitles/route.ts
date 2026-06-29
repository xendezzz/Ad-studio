import { NextRequest, NextResponse } from 'next/server';
import { applySubtitles } from '@/lib/subtitlesBurn';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/subtitles  { video, style?, font?, size?, position? }
 * Transcribes the clip and burns styled, timed captions. Returns { clip }.
 * Burning lives in lib/subtitlesBurn so runPipeline can re-apply it downstream (Scale).
 */
export async function POST(req: NextRequest) {
  try {
    const { video, style, font, size, position } = await req.json();
    if (!video || typeof video !== 'string') {
      return NextResponse.json({ error: 'video is required' }, { status: 400 });
    }
    const clip = await applySubtitles(video, { style, font, size, position });
    return NextResponse.json({ clip });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Subtitles failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
