'use client';

import Link from 'next/link';
import { StudioNav } from '@/components/StudioNav';

/** Placeholder library page — header + nav + an empty state. Content comes later. */
export function EmptyLibraryPage({ title, blurb }: { title: string; blurb: string }) {
  return (
    <main
      className="min-h-screen w-full text-zinc-200"
      style={{ background: 'radial-gradient(130% 80% at 50% -10%, #1a1d24 0%, #0c0d11 55%, #08090c 100%)' }}
    >
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-5">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Ad-Studio" className="h-6 w-auto" />
            <span className="text-[15px] font-semibold tracking-tight text-white/90">Ad-Studio</span>
          </Link>
          <StudioNav />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-8 pb-20">
        <div className="mb-5 mt-2">
          <h1 className="text-[26px] font-semibold tracking-tight text-white">{title}</h1>
          <p className="mt-1 text-[13px] text-white/45">{blurb}</p>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.015] py-28 text-center">
          <p className="text-[13px] font-medium text-white/45">Nothing here yet</p>
          <p className="text-[12px] text-white/30">This library is coming soon.</p>
        </div>
      </div>
    </main>
  );
}
