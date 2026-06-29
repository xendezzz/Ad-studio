import { NextResponse } from 'next/server';
import { configStatus } from '@/lib/config';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(configStatus());
}
