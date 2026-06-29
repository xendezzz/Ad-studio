/**
 * Drizzle ORM client for Supabase Postgres.
 *
 * NOTE: Supabase is standard Postgres, so this uses the `postgres-js` driver
 * (NOT Neon's HTTP driver). `prepare: false` is required when connecting through
 * Supabase's transaction-mode connection pooler (pgbouncer).
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let _client: ReturnType<typeof postgres> | null = null;
let _db: DrizzleDb | null = null;

export function getDb(): DrizzleDb {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL environment variable is not set. Add it to .env (see .env.example).',
      );
    }
    _client = postgres(url, { prepare: false });
    _db = drizzle(_client, { schema });
  }
  return _db;
}

/** Lazy proxy so `import { db }` works without connecting until first query. */
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
