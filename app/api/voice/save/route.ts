import { NextRequest, NextResponse } from 'next/server';
import { saveDesignedVoice } from '@/lib/elevenlabs';

export const dynamic = 'force-dynamic';

/**
 * POST /api/voice/save  { generatedVoiceId, name, description? }
 * Persists a designed voice preview to the ElevenLabs library. Returns { voiceId }.
 */
export async function POST(req: NextRequest) {
  try {
    const { generatedVoiceId, name, description } = await req.json();
    if (!generatedVoiceId || typeof generatedVoiceId !== 'string') {
      return NextResponse.json({ error: 'generatedVoiceId is required' }, { status: 400 });
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    const { voiceId } = await saveDesignedVoice({
      generatedVoiceId,
      name: name.trim(),
      description: (description as string)?.trim() || 'Designed in Ad-Studio',
    });
    return NextResponse.json({ voiceId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Saving voice failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
