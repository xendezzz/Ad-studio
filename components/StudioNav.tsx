'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const NAV_TABS = [
  { href: '/', label: 'Projects' },
  { href: '/models', label: 'Models' },
  { href: '/clips', label: 'Clips' },
] as const;

export function StudioNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/[0.03] p-1">
      {NAV_TABS.map((t) => {
        const active = t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-lg px-3 py-1 text-[12.5px] font-medium transition-colors ${
              active ? 'bg-white/10 text-white/90' : 'text-white/45 hover:text-white/80'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
