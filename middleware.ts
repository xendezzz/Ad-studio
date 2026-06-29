import { NextResponse, type NextRequest } from 'next/server';
import { verifyToken, SESSION_COOKIE } from '@/lib/auth';

// Protect everything except the login page, the auth API, Next internals, and public assets
// (logo, transition previews). Anything else needs a valid session or it redirects to /login.
export const config = {
  matcher: ['/((?!login|api/auth|_next|favicon.ico|logo.svg|transitions).*)'],
};

export async function middleware(req: NextRequest) {
  // local escape hatch: set AUTH_DISABLED=true in .env to preview without logging in.
  // NEVER set this in production (Vercel) — it turns off the login gate entirely.
  if (process.env.AUTH_DISABLED === 'true') return NextResponse.next();

  const secret = process.env.AUTH_SECRET;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = secret && token ? await verifyToken(token, secret) : null;
  if (session) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}
