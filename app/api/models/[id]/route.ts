import { NextRequest, NextResponse } from 'next/server';
import { Models, type Model } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Partial<Model>;
  const patch: Partial<Model> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.voiceId !== undefined) patch.voiceId = body.voiceId;
  const row = await Models.update(id, patch);
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await Models.remove(id);
  return NextResponse.json({ ok: true });
}
