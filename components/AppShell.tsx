'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Clapperboard,
  Film,
  LayoutGrid,
  ScrollText,
  Sparkles,
  UserRound,
  Wand2,
} from 'lucide-react';

const NAV = [
  { href: '/', label: 'Projects', icon: LayoutGrid },
  { href: '/models', label: 'Models', icon: UserRound },
  { href: '/clips', label: 'Clips', icon: Film },
  { href: '/script', label: 'Script', icon: ScrollText },
  { href: '/auto-script', label: 'Auto Script', icon: Wand2 },
  { href: '/non-ugc', label: 'Non UGC', icon: Clapperboard },
] as const;

/**
 * App shell — Runable-style left sidebar (page #141414, surface #191919,
 * border #2a2a2a, white active pill) wrapping every page except /login.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/login') return <>{children}</>;
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-[212px] shrink-0 flex-col border-r border-[var(--rn-border)] bg-[var(--rn-page)]">
        <Link href="/" className="flex items-center gap-2.5 px-5 pb-5 pt-6">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-white">
            <Image src="/logo.svg" alt="" width={20} height={20} className="brightness-[0.35]" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[14px] font-semibold text-[var(--rn-text)]">Runable</span>
            <span className="text-[10.5px] text-[var(--rn-secondary)]">Ad Studio</span>
          </span>
        </Link>
        <nav className="flex flex-col gap-0.5 px-3">
          {NAV.map((t) => {
            const active = t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-colors ${
                  active
                    ? 'bg-white font-medium text-[#1a1a1a]'
                    : 'text-[var(--rn-secondary)] hover:bg-white/[0.05] hover:text-[var(--rn-text)]'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-5 pb-5">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--rn-secondary)]">
            <Sparkles className="h-3 w-3" /> Post-AGI mode
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
