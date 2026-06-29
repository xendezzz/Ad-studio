/**
 * Server-side Supabase client (service/secret key — bypasses RLS).
 * Used for both Storage and database access (via PostgREST), so the app never
 * needs a direct Postgres connection string / DB password.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

let _client: SupabaseClient | null = null;

export function supa(): SupabaseClient {
  if (!_client) {
    _client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}
