'use client';

import { useRef, useState } from 'react';
import { Loader2, Mail, ArrowRight, KeyRound } from 'lucide-react';
import { AuroraBg } from '@/components/AuroraBg';

export default function LoginPage() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lensRef = useRef<HTMLDivElement>(null);

  // soft blur lens follows the cursor with a delay (CSS transition on transform)
  function onMove(e: React.MouseEvent) {
    const l = lensRef.current;
    if (l) l.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const d = await r.json();
      if (r.ok) setStep('code');
      else setError(d.error || 'Could not send the code.');
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const d = await r.json();
      if (r.ok) window.location.href = '/';
      else setError(d.error || 'Could not verify the code.');
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main onMouseMove={onMove} className="relative grid min-h-screen w-full place-items-center overflow-hidden bg-[#08090c] px-4 text-zinc-200">
      {/* aurora light-leak background (animated + grain) */}
      <AuroraBg />

      {/* giant glowing wordmark — anchored to the bottom */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 select-none whitespace-nowrap text-center font-serif italic leading-[0.82] text-white/90"
        style={{ fontSize: '295px', textShadow: '0 0 55px rgba(255,255,255,0.45), 0 0 150px rgba(255,255,255,0.22)' }}
      >
        Ad-Studio
      </div>

      {/* cursor blur lens — small radius, soft, with delay */}
      <div
        ref={lensRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-20 h-[200px] w-[200px] rounded-full"
        style={{
          backdropFilter: 'blur(7px)',
          WebkitBackdropFilter: 'blur(7px)',
          WebkitMaskImage: 'radial-gradient(circle, #000 25%, transparent 70%)',
          maskImage: 'radial-gradient(circle, #000 25%, transparent 70%)',
          transition: 'transform 1.3s cubic-bezier(0.22, 0.61, 0.36, 1)',
          willChange: 'transform',
        }}
      />

      {/* glass modal */}
      <div className="relative z-30 w-full max-w-[380px] -translate-y-16 rounded-2xl border border-white/15 bg-[#0c0d11]/55 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
        {step === 'email' ? (
          <form onSubmit={sendCode}>
            <h1 className="text-[30px] leading-tight text-white">Sign in</h1>
            <p className="mb-6 mt-1 text-[12.5px] text-white/55">Use your <span className="text-white/80">@runable.com</span> email — we&apos;ll send you a code.</p>

            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/45">Email</label>
            <div className="focus-rainbow flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3 transition-shadow">
              <Mail className="h-4 w-4 text-white/40" />
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@runable.com"
                className="w-full bg-transparent py-2.5 text-[13px] text-white outline-none placeholder:text-white/35"
              />
            </div>
            {error && <p className="mt-2.5 text-[12px] text-red-300">{error}</p>}
            <button type="submit" disabled={busy || !email} className="btn-rainbow mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] transition-all active:scale-95 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Send code <ArrowRight className="h-3.5 w-3.5" /></>}
            </button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <h1 className="text-[30px] leading-tight text-white">Enter your code</h1>
            <p className="mb-6 mt-1 text-[12.5px] text-white/55">Sent to <span className="text-white/80">{email}</span>. Expires in 10 minutes.</p>

            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/45">6-digit code</label>
            <div className="focus-rainbow flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3 transition-shadow">
              <KeyRound className="h-4 w-4 text-white/40" />
              <input
                inputMode="numeric"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                className="w-full bg-transparent py-2.5 text-[15px] tracking-[6px] text-white outline-none placeholder:text-[13px] placeholder:tracking-normal placeholder:text-white/35"
              />
            </div>
            {error && <p className="mt-2.5 text-[12px] text-red-300">{error}</p>}
            <button type="submit" disabled={busy || code.length < 6} className="btn-rainbow mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] transition-all active:scale-95 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Verify &amp; enter <ArrowRight className="h-3.5 w-3.5" /></>}
            </button>
            <button type="button" onClick={() => { setStep('email'); setCode(''); setError(null); }} className="mt-3.5 w-full text-center text-[12px] text-white/50 hover:text-white/80">
              ← Use a different email
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
