/**
 * Resolve the direct fbcdn video URL for a Meta Ads Library / Facebook / Instagram
 * link by loading it in a headless browser. The video URL is delivered inside a
 * GraphQL XHR response (not the initial HTML), and a plain server fetch hits Meta's
 * anti-bot challenge — so we drive the system-installed Chrome via playwright-core.
 */
import { chromium, type Browser } from 'playwright-core';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// HD first, then SD fallbacks.
const VIDEO_FIELDS = [
  'browser_native_hd_url',
  'playable_url_quality_hd',
  'video_hd_url',
  'browser_native_sd_url',
  'playable_url',
  'video_sd_url',
];

function decodeJsonUrl(raw: string): string {
  return raw
    .replace(/\\\//g, '/')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

/** Pick the highest-priority video URL present in a blob of JSON/text. */
function bestVideoIn(text: string): { url: string; rank: number } | null {
  for (let rank = 0; rank < VIDEO_FIELDS.length; rank++) {
    const re = new RegExp(`"${VIDEO_FIELDS[rank]}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)+)"`, 'i');
    const m = text.match(re);
    if (m?.[1] && m[1] !== 'null') {
      const url = decodeJsonUrl(m[1]);
      if (/^https?:\/\//.test(url)) return { url, rank };
    }
  }
  return null;
}

export function isMetaUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    return (
      /(^|\.)facebook\.com$/.test(h) ||
      h === 'fb.watch' ||
      /(^|\.)instagram\.com$/.test(h) ||
      /(^|\.)fb\.com$/.test(h)
    );
  } catch {
    return false;
  }
}

async function launchChrome(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return await chromium.launch({ headless: true });
  }
}

export class AdNotFoundError extends Error {}

/**
 * Returns the best (HD-preferred) direct video URL found on the page.
 * Throws AdNotFoundError if Meta reports the ad isn't in the library (expired).
 */
export async function resolveMetaVideo(pageUrl: string): Promise<string | null> {
  const browser = await launchChrome();
  try {
    const ctx = await browser.newContext({
      userAgent: UA,
      locale: 'en-US',
      viewport: { width: 1280, height: 1200 },
    });
    const page = await ctx.newPage();

    let best: { url: string; rank: number } | null = null;
    let mediaUrl: string | null = null; // fallback: the player's actual media request

    page.on('response', async (res) => {
      try {
        const u = res.url();
        const ct = res.headers()['content-type'] || '';
        if ((res.request().resourceType() === 'media' || ct.startsWith('video/')) && /fbcdn\.net/.test(u)) {
          mediaUrl = mediaUrl || u;
          return;
        }
        if (/graphql/.test(u) || /ads\/library/.test(u)) {
          const text = await res.text();
          const found = bestVideoIn(text);
          if (found && (!best || found.rank < best.rank)) best = found;
        }
      } catch {
        /* ignore */
      }
    });

    try {
      await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 45000 });
    } catch {
      /* networkidle can time out on a busy page; keep going */
    }

    // Give XHRs time; nudge lazy loading. Stop once we've captured a video so an
    // `?id=` (single-ad) page doesn't pull in other ads' videos as we scroll.
    for (let i = 0; i < 16; i++) {
      if (best) break;
      try {
        const gone = await page.evaluate(() =>
          /isn['’]t in the ad library/i.test(document.body?.innerText || ''),
        );
        if (gone) throw new AdNotFoundError('This ad is no longer in the Meta Ad Library (it may have expired).');
      } catch (e) {
        if (e instanceof AdNotFoundError) throw e;
      }
      try {
        await page.evaluate(() => window.scrollBy(0, 700));
      } catch {
        /* ignore */
      }
      await page.waitForTimeout(700);
    }

    if (best) return (best as { url: string }).url;
    return mediaUrl;
  } finally {
    await browser.close().catch(() => {});
  }
}
