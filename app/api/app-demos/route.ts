import { NextRequest, NextResponse } from 'next/server';
import { AppDemos } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await AppDemos.list());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.name || !body?.videoPath) {
    return NextResponse.json({ error: 'name and videoPath required' }, { status: 400 });
  }
  const existing = (await AppDemos.list()).find((a) => a.videoPath === body.videoPath);
  if (existing) return NextResponse.json(existing); // already in the library — don't duplicate
  const row = await AppDemos.create({
    name: body.name,
    videoPath: body.videoPath,
    durationSec: body.durationSec ?? null,
    width: body.width ?? null,
    height: body.height ?? null,
  });
  return NextResponse.json(row);
}
