import { NextRequest, NextResponse } from 'next/server';
import { nameClip } from '@/lib/clipName';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/clip-name { video } → { name }
 * Names a clip by what's spoken in it, else the on-screen text on its first frame.
 */
export async function POST(req: NextRequest) {
  try {
    const { video } = await req.json();
    if (!video || typeof video !== 'string') return NextResponse.json({ error: 'video required' }, { status: 400 });
    return NextResponse.json({ name: await nameClip(video) });
  } catch {
    return NextResponse.json({ name: 'Hook' });
  }
}
