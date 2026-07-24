'use client';

export const NAV_TABS = [
  { href: '/', label: 'Projects' },
  { href: '/models', label: 'Models' },
  { href: '/clips', label: 'Clips' },
  { href: '/script', label: 'Script' },
  { href: '/auto-script', label: 'Auto Script' },
  { href: '/non-ugc', label: 'Non UGC' },
] as const;

/**
 * Deprecated: navigation moved to the Runable-style left sidebar (AppShell).
 * Kept as a no-op so pages that still render <StudioNav /> show nothing
 * instead of a duplicate nav.
 */
export function StudioNav() {
  return null;
}
