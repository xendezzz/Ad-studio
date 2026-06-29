import { NextRequest, NextResponse } from 'next/server';
import { Hooks } from '@/lib/db';
import { nameClip } from '@/lib/clipName';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET() {
  return NextResponse.json(await Hooks.list());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.name || !body?.videoPath) {
    return NextResponse.json({ error: 'name and videoPath required' }, { status: 400 });
  }
  const existing = (await Hooks.list()).find((h) => h.videoPath === body.videoPath);
  if (existing) return NextResponse.json(existing); // already in the library — don't duplicate
  // a hook is named by what's said in it, else the on-screen text on its first frame
  const name = await nameClip(body.videoPath, body.name);
  const row = await Hooks.create({
    name,
    videoPath: body.videoPath,
    durationSec: body.durationSec ?? null,
    width: body.width ?? null,
    height: body.height ?? null,
  });
  return NextResponse.json(row);
}
