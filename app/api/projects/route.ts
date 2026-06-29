import { NextRequest, NextResponse } from 'next/server';
import { Projects } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await Projects.list());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const row = await Projects.create({
    name: body?.name || 'Untitled project',
    status: 'draft',
    graph: body?.graph ?? null,
    outputs: [],
  });
  return NextResponse.json(row);
}
