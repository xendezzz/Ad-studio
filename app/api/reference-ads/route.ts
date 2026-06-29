import { NextRequest, NextResponse } from 'next/server';
import { ReferenceAds } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await ReferenceAds.list());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.name || !body?.videoPath) {
    return NextResponse.json({ error: 'name and videoPath required' }, { status: 400 });
  }
  const row = await ReferenceAds.create({
    name: body.name,
    videoPath: body.videoPath,
    durationSec: body.durationSec ?? null,
    width: body.width ?? null,
    height: body.height ?? null,
    transcript: body.transcript ?? null,
    segments: body.segments ?? null,
  });
  return NextResponse.json(row);
}
