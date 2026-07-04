import { NextRequest, NextResponse } from 'next/server';
import { applyVoice } from '@/lib/voiceApply';
import { saveDesignedVoice } from '@/lib/elevenlabs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/voice  { video, voiceId?, generatedVoiceId?, saveName? }
 * Speech-to-speech: converts the clip's own audio to the chosen voice — the original
 * performance (timing, pauses, duration) is preserved, only the voice changes.
 * If a designed-but-unsaved voice is used, it is saved to the library first
 * (ElevenLabs only accepts saved voice ids). Returns { clip, voiceId }.
 */
export async function POST(req: NextRequest) {
  try {
    const { video, voiceId, generatedVoiceId, saveName } = await req.json();
    if (!video || typeof video !== 'string') {
      return NextResponse.json({ error: 'video is required' }, { status: 400 });
    }

    let useVoiceId: string | undefined = voiceId || undefined;
    if (!useVoiceId && generatedVoiceId) {
      const name = (saveName as string)?.trim() || `Designed voice ${new Date().toISOString().slice(0, 10)}`;
      const saved = await saveDesignedVoice({ generatedVoiceId, name, description: 'Designed in Ad-Studio' });
      useVoiceId = saved.voiceId;
    }
    if (!useVoiceId) {
      return NextResponse.json({ error: 'voiceId (or a designed voice) is required' }, { status: 400 });
    }

    const clip = await applyVoice(video, { voiceId: useVoiceId });
    return NextResponse.json({ clip, voiceId: useVoiceId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Voice apply failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
