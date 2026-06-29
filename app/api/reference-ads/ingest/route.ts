import { NextRequest, NextResponse } from 'next/server';
import { ingestReferenceAd } from '@/lib/ingestReference';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/reference-ads/ingest  { videoPath, name? }
 * Probes + transcribes + detects segments, then stores the reference_ads row.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.videoPath) {
      return NextResponse.json({ error: 'videoPath required' }, { status: 400 });
    }
    const row = await ingestReferenceAd(body.videoPath, body.name || 'Reference ad');
    return NextResponse.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ingest failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
