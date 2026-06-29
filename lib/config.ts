/**
 * Typed access to environment variables for Ad-Studio.
 *
 * All secrets/config come from `.env` (never committed). Nothing is hardcoded so
 * the app stays deployable (Vercel, etc.) — just set the same vars in the host.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required environment variable: ${name}. Add it to .env (see .env.example).`,
    );
  }
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const config = {
  // --- Database (Supabase Postgres) ---
  get databaseUrl() {
    return required('DATABASE_URL');
  },

  // --- Supabase Storage ---
  get supabaseUrl() {
    return required('SUPABASE_URL');
  },
  get supabaseServiceRoleKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
  get storageBucket() {
    return optional('SUPABASE_BUCKET', 'ad-assets');
  },

  // --- Motion engine ---
  /** 'fal' (primary) | 'higgsfield' (switchable). Default fal. */
  get motionEngine(): 'fal' | 'higgsfield' {
    const v = optional('MOTION_ENGINE', 'fal').toLowerCase();
    return v === 'higgsfield' ? 'higgsfield' : 'fal';
  },
  get falKey() {
    return required('FAL_KEY');
  },
  get higgsfieldApiKey() {
    return optional('HIGGSFIELD_API_KEY');
  },
  // Higgsfield's API authenticates with key + secret (hf-api-key / hf-secret headers).
  get higgsfieldSecret() {
    return optional('HIGGSFIELD_SECRET');
  },

  // --- Voice (ElevenLabs) ---
  get elevenLabsApiKey() {
    return required('ELEVENLABS_API_KEY');
  },
  get elevenLabsDefaultVoiceId() {
    return optional('ELEVENLABS_DEFAULT_VOICE_ID');
  },

  // --- Optional: OpenAI (frame scoring during reference-ad ingest) ---
  get openaiApiKey() {
    return optional('OPENAI_API_KEY');
  },

  // --- Anthropic (reference-ad clip-by-clip analysis: Claude vision) ---
  get anthropicApiKey() {
    return optional('ANTHROPIC_API_KEY');
  },
} as const;

/** Returns which configured features are usable, without throwing. For a health/status route. */
export function configStatus() {
  const has = (n: string) => Boolean(process.env[n]);
  return {
    database: has('DATABASE_URL'),
    storage: has('SUPABASE_URL') && has('SUPABASE_SERVICE_ROLE_KEY'),
    fal: has('FAL_KEY'),
    higgsfield: has('HIGGSFIELD_API_KEY') && has('HIGGSFIELD_SECRET'), // needs both for the API
    elevenlabs: has('ELEVENLABS_API_KEY'),
    openai: has('OPENAI_API_KEY'),
    anthropic: has('ANTHROPIC_API_KEY'),
    motionEngine: (process.env.MOTION_ENGINE || 'fal').toLowerCase(),
  };
}
