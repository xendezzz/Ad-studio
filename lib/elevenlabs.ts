import { config } from './config';

const API_BASE = 'https://api.elevenlabs.io/v1';

// Reasonable defaults for natural, conversational UGC-style speech.
const DEFAULT_MODEL = 'eleven_multilingual_v2';
const DEFAULT_OUTPUT_FORMAT = 'mp3_44100_128';

export type VoiceSettings = {
  stability?: number;        // 0..1 — lower = more expressive/variable
  similarity_boost?: number; // 0..1 — adherence to the original voice
  style?: number;            // 0..1 — style exaggeration
  use_speaker_boost?: boolean;
};

function getApiKey(): string {
  const apiKey = config.elevenLabsApiKey;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');
  return apiKey;
}

async function elevenFetch(path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'xi-api-key': getApiKey(),
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs ${path} failed (${res.status}): ${detail}`);
  }
  return res;
}

/**
 * Convert text to speech. Returns an MP3 audio Buffer.
 */
export async function textToSpeech(opts: {
  text: string;
  voiceId?: string;
  modelId?: string;
  outputFormat?: string;
  voiceSettings?: VoiceSettings;
}): Promise<Buffer> {
  const voiceId = opts.voiceId || config.elevenLabsDefaultVoiceId;
  if (!voiceId) throw new Error('No voiceId provided and ELEVENLABS_DEFAULT_VOICE_ID not configured');

  const outputFormat = opts.outputFormat || DEFAULT_OUTPUT_FORMAT;
  const res = await elevenFetch(
    `/text-to-speech/${voiceId}?output_format=${encodeURIComponent(outputFormat)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: opts.text,
        model_id: opts.modelId || DEFAULT_MODEL,
        voice_settings: opts.voiceSettings,
      }),
    },
  );

  return Buffer.from(await res.arrayBuffer());
}

export type VoicePreview = {
  audioBase64: string;       // base64-encoded MP3 preview
  generatedVoiceId: string;  // pass to saveDesignedVoice() to keep it
  mediaType: string;
};

/**
 * Design a brand-new voice from a text description (Voice Design).
 * Returns up to 3 previews; pick one and pass its generatedVoiceId to
 * saveDesignedVoice() to persist it to the account's voice library.
 */
export async function designVoice(opts: {
  description: string;
  text?: string;            // sample text the previews are spoken on (>=100 chars recommended)
  modelId?: string;
  outputFormat?: string;
}): Promise<VoicePreview[]> {
  const res = await elevenFetch('/text-to-voice/design', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      voice_description: opts.description,
      text: opts.text,
      model_id: opts.modelId || 'eleven_multilingual_ttv_v2',
      output_format: opts.outputFormat || DEFAULT_OUTPUT_FORMAT,
    }),
  });

  const data = (await res.json()) as {
    previews?: Array<{ audio_base_64: string; generated_voice_id: string; media_type: string }>;
  };
  return (data.previews || []).map((p) => ({
    audioBase64: p.audio_base_64,
    generatedVoiceId: p.generated_voice_id,
    mediaType: p.media_type,
  }));
}

/**
 * Persist a previously designed voice to the account library.
 * Returns the permanent voiceId usable with textToSpeech().
 */
export async function saveDesignedVoice(opts: {
  generatedVoiceId: string;
  name: string;
  description: string;
}): Promise<{ voiceId: string }> {
  const res = await elevenFetch('/text-to-voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      generated_voice_id: opts.generatedVoiceId,
      voice_name: opts.name,
      voice_description: opts.description,
    }),
  });

  const data = (await res.json()) as { voice_id: string };
  return { voiceId: data.voice_id };
}

/**
 * List voices available to the account.
 */
export async function listVoices(): Promise<Array<{ voiceId: string; name: string; category?: string }>> {
  const res = await elevenFetch('/voices', { method: 'GET' });
  const data = (await res.json()) as {
    voices?: Array<{ voice_id: string; name: string; category?: string }>;
  };
  return (data.voices || []).map((v) => ({ voiceId: v.voice_id, name: v.name, category: v.category }));
}
