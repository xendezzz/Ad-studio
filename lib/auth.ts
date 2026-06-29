/**
 * Tiny self-contained auth: HMAC-signed tokens (Web Crypto, so they verify in Edge middleware
 * and Node routes alike), a domain allowlist, and the cookie config. No external auth provider.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

export const SESSION_COOKIE = 'as_session';
export const OTP_COOKIE = 'as_otp';

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** Sign a payload → `base64url(json).base64url(hmac)`. */
export async function signToken(payload: Record<string, unknown>, secret: string): Promise<string> {
  const data = bytesToB64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data));
  return `${data}.${bytesToB64url(new Uint8Array(sig))}`;
}

/** Verify signature + expiry. Returns the payload or null. */
export async function verifyToken<T = Record<string, unknown>>(token: string, secret: string): Promise<T | null> {
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64urlToBytes(sig), enc.encode(data));
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const payload = JSON.parse(dec.decode(b64urlToBytes(data))) as { exp?: number };
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload as T;
  } catch {
    return null;
  }
}

export async function sha256(s: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return bytesToB64url(new Uint8Array(h));
}

export function allowedDomain(): string {
  return (process.env.ALLOWED_EMAIL_DOMAIN || 'runable.com').toLowerCase();
}
export function emailAllowed(email: string): boolean {
  const e = email.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+$/.test(e) && e.endsWith('@' + allowedDomain());
}

export function cookieOpts(maxAgeSec: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSec,
  };
}
