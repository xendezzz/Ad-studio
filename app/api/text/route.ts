import { NextRequest, NextResponse } from 'next/server';
import { applyTextOverlays, type TextItem } from '@/lib/textBurn';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/text  { video, items: [{type:'text'|'emoji', ...}] }
 * Burns timed text overlays (drag-anywhere) + emoji (Twemoji) onto the clip. Returns { clip }.
 * The actual burning lives in lib/textBurn so runPipeline can re-apply it downstream (Scale).
 */
export async function POST(req: NextRequest) {
  try {
    const { video, items } = await req.json();
    if (!video || typeof video !== 'string') {
      return NextResponse.json({ error: 'video is required' }, { status: 400 });
    }
    const list: TextItem[] = Array.isArray(items) ? items : [];
    if (!list.length) {
      return NextResponse.json({ error: 'add at least one text or emoji' }, { status: 400 });
    }
    const clip = await applyTextOverlays(video, list);
    return NextResponse.json({ clip });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Text overlay failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
