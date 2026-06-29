'use client';

/** Custom (user-created) model categories, stored locally. Combined with the
 *  categories already present on models to build the full category list. */
const KEY = 'adstudio-categories';

function read(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}
function write(list: string[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export const categoriesStore = {
  list: read,
  add(name: string) {
    const n = name.trim();
    if (!n) return;
    const list = read();
    if (!list.includes(n)) write([...list, n]);
  },
  remove(name: string) {
    write(read().filter((c) => c !== name));
  },
};
