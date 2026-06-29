import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, signToken, sha256, SESSION_COOKIE, OTP_COOKIE, cookieOpts } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST { code } → checks it against the OTP cookie, then sets a 7-day session cookie. */
export async function POST(req: NextRequest) {
  const { code } = await req.json().catch(() => ({}));
  const secret = process.env.AUTH_SECRET;
  const otp = req.cookies.get(OTP_COOKIE)?.value;
  if (!secret) return NextResponse.json({ error: 'Auth is not configured.' }, { status: 500 });
  if (!otp) return NextResponse.json({ error: 'No code in progress — request a new one.' }, { status: 400 });

  const payload = await verifyToken<{ email: string; codeHash: string }>(otp, secret);
  if (!payload) return NextResponse.json({ error: 'Code expired — request a new one.' }, { status: 400 });
  if (!code || (await sha256(String(code).trim())) !== payload.codeHash) {
    return NextResponse.json({ error: 'Incorrect code.' }, { status: 400 });
  }

  const session = await signToken({ email: payload.email, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 }, secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, session, cookieOpts(7 * 24 * 60 * 60));
  res.cookies.set(OTP_COOKIE, '', cookieOpts(0)); // clear the OTP cookie
  return res;
}
