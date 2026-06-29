import { NextRequest, NextResponse } from 'next/server';
import { signToken, sha256, emailAllowed, allowedDomain, OTP_COOKIE, cookieOpts } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST { email } → emails a 6-digit code (Resend) and sets a short-lived signed OTP cookie. */
export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  if (!email || typeof email !== 'string' || !emailAllowed(email)) {
    return NextResponse.json({ error: `Only @${allowedDomain()} email addresses can sign in.` }, { status: 403 });
  }
  const secret = process.env.AUTH_SECRET;
  const resendKey = process.env.RESEND_API_KEY;
  if (!secret || !resendKey) return NextResponse.json({ error: 'Auth is not configured on the server.' }, { status: 500 });

  const to = email.trim().toLowerCase();
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.AUTH_EMAIL_FROM || 'Ad-Studio <onboarding@resend.dev>',
      to: [to],
      subject: `Your Ad-Studio login code: ${code}`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 8px;font-size:18px">Ad-Studio login</h2>
        <p style="color:#555;margin:0 0 20px">Enter this code to sign in. It expires in 10 minutes.</p>
        <div style="font-size:34px;font-weight:700;letter-spacing:8px;background:#f3f3f5;border-radius:12px;padding:16px;text-align:center">${code}</div>
        <p style="color:#999;font-size:12px;margin-top:20px">If you didn't request this, ignore this email.</p>
      </div>`,
    }),
  });
  if (!r.ok) {
    return NextResponse.json({ error: `Couldn't send the code (email error ${r.status}). Check the sender domain.` }, { status: 502 });
  }

  const otp = await signToken({ email: to, codeHash: await sha256(code), exp: Date.now() + 10 * 60 * 1000 }, secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OTP_COOKIE, otp, cookieOpts(600));
  return res;
}
