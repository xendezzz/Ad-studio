import { NextResponse } from 'next/server';
import { listVoices } from '@/lib/elevenlabs';

export const dynamic = 'force-dynamic';

/** GET /api/voice/voices — ElevenLabs voice library. Returns { voices }. */
export async function GET() {
  try {
    const voices = await listVoices();
    return NextResponse.json({ voices });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Listing voices failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
