import { NextRequest, NextResponse } from 'next/server';
import { Projects, type Project } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await Projects.get(id);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Partial<Project>;
  const patch: Partial<Project> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.status !== undefined) patch.status = body.status;
  if (body.graph !== undefined) patch.graph = body.graph;
  if (body.outputs !== undefined) patch.outputs = body.outputs;
  if (body.thumbnail !== undefined) patch.thumbnail = body.thumbnail;
  const row = await Projects.update(id, patch);
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await Projects.remove(id);
  return NextResponse.json({ ok: true });
}
