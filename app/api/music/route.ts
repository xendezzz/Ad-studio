import { NextRequest, NextResponse } from 'next/server';
import { Music } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await Music.list());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.name || !body?.audioPath) {
    return NextResponse.json({ error: 'name and audioPath required' }, { status: 400 });
  }
  const existing = (await Music.list()).find((m) => m.audioPath === body.audioPath);
  if (existing) return NextResponse.json(existing); // already in the library — don't duplicate
  const row = await Music.create({
    name: body.name,
    audioPath: body.audioPath,
    durationSec: body.durationSec ?? null,
    source: body.source ?? 'upload',
  });
  return NextResponse.json(row);
}
