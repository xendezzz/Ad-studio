import { NextRequest, NextResponse } from 'next/server';
import { applyAssetOverlays, type AssetItem } from '@/lib/assetBurn';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/asset  { video, items: [{path, kind, x, y, w, h, startSec, endSec}] }
 * Overlays timed image/gif/video assets onto the clip at custom positions. Returns { clip }.
 * The burn lives in lib/assetBurn so runPipeline can re-apply it downstream (Scale/Export).
 */
export async function POST(req: NextRequest) {
  try {
    const { video, items } = await req.json();
    if (!video || typeof video !== 'string') {
      return NextResponse.json({ error: 'video is required' }, { status: 400 });
    }
    const list: AssetItem[] = Array.isArray(items) ? items : [];
    if (!list.length) {
      return NextResponse.json({ error: 'add at least one asset' }, { status: 400 });
    }
    const clip = await applyAssetOverlays(video, list);
    return NextResponse.json({ clip });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Asset overlay failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
