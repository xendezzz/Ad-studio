import { NextRequest, NextResponse } from 'next/server';
import { Models } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await Models.list();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const row = await Models.create({
    name: body.name,
    description: body.description ?? null,
    gender: body.gender ?? null,
    imagePath: body.imagePath ?? null,
    voiceProvider: body.voiceProvider ?? 'elevenlabs',
    voiceId: body.voiceId ?? null,
  });
  return NextResponse.json(row);
}
