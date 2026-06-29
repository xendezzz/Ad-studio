import { NextRequest, NextResponse } from 'next/server';
import { uploadBuffer } from '@/lib/storage';
import { isMetaUrl, resolveMetaVideo, AdNotFoundError } from '@/lib/metaScraper';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_BYTES = 300 * 1024 * 1024; // 300 MB
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const EXT_FOR_TYPE: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/wav': '.wav',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

function nameFromUrl(url: string, contentType: string): string {
  const ext = EXT_FOR_TYPE[contentType] ?? '';
  try {
    const u = new URL(url);
    if (/fbcdn\.net$/.test(u.hostname) || /fbcdn/.test(u.hostname)) return `meta-ad${ext || '.mp4'}`;
    const last = u.pathname.split('/').filter(Boolean).pop();
    if (last && /\.[a-z0-9]{2,4}$/i.test(last)) return decodeURIComponent(last);
    const host = u.hostname.replace(/^www\./, '');
    return `${host}${ext}` || 'remote-media';
  } catch {
    return `remote-media${ext}`;
  }
}

/** Decode a URL the way it appears inside inline JSON (\/ , \uXXXX , &amp;). */
function decodeJsonUrl(raw: string): string {
  return raw
    .replace(/\\u0025/gi, '%')
    .replace(/\\u002F/gi, '/')
    .replace(/\\u003D/gi, '=')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003F/gi, '?')
    .replace(/\\\//g, '/')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

/** Best-effort: pull a direct media URL out of an HTML page. Handles Meta/Facebook
 *  ad-library + video pages (inline JSON fields) and generic og:video pages. */
function extractMediaUrl(html: string, baseUrl: string): string | null {
  // Meta/Facebook embed the real fbcdn video URL in inline JSON. Prefer HD.
  const fbFields = [
    'browser_native_hd_url',
    'playable_url_quality_hd',
    'video_hd_url',
    'browser_native_sd_url',
    'playable_url',
    'video_sd_url',
  ];
  for (const field of fbFields) {
    const re = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)+)"`, 'i');
    const m = html.match(re);
    if (m?.[1] && m[1] !== 'null') {
      const url = decodeJsonUrl(m[1]);
      if (/^https?:\/\//.test(url)) return url;
    }
  }

  const patterns = [
    /<meta[^>]+property=["'](?:og:video:secure_url|og:video:url|og:video)["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["'](?:og:video:secure_url|og:video:url|og:video)["']/i,
    /<meta[^>]+name=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/i,
    /<video[^>]+src=["']([^"']+\.mp4[^"']*)["']/i,
    /["'](https?:\/\/[^"'\\]+\.mp4[^"'\\]*)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      try {
        return new URL(m[1].replace(/&amp;/g, '&'), baseUrl).toString();
      } catch {
        /* skip */
      }
    }
  }
  return null;
}

async function fetchBytes(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Source returned ${res.status}`);
  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const len = Number(res.headers.get('content-length') || 0);
  if (len && len > MAX_BYTES) throw new Error('File is larger than 300 MB');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) throw new Error('File is larger than 300 MB');
  return { buffer, contentType };
}

/**
 * POST /api/fetch-media  { url, folder }
 * Downloads a media file from a remote link into Supabase Storage.
 * Handles direct media URLs, and best-effort extracts og:video from a page URL.
 * Returns { path, name }.
 */
export async function POST(req: NextRequest) {
  try {
    const { url, folder } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'A link is required' }, { status: 400 });
    }
    let target: string;
    try {
      const u = new URL(url.trim());
      if (!/^https?:$/.test(u.protocol)) throw new Error('bad protocol');
      target = u.toString();
    } catch {
      return NextResponse.json({ error: 'That doesn’t look like a valid http(s) link' }, { status: 400 });
    }

    // Meta Ads Library / Facebook / Instagram links are JS-rendered behind an
    // anti-bot challenge — resolve the real fbcdn video URL with a headless browser.
    if (isMetaUrl(target)) {
      try {
        const resolved = await resolveMetaVideo(target);
        if (!resolved) {
          return NextResponse.json(
            { error: 'Couldn’t find a video on that ad. It may be an image-only ad, or paste the direct video URL.' },
            { status: 422 },
          );
        }
        target = resolved;
      } catch (e) {
        if (e instanceof AdNotFoundError) {
          return NextResponse.json({ error: e.message }, { status: 422 });
        }
        throw e;
      }
    }

    let { buffer, contentType } = await fetchBytes(target);

    // If we got an HTML page, try to find the real media URL inside it.
    if (contentType.startsWith('text/html') || contentType.startsWith('application/xhtml')) {
      const mediaUrl = extractMediaUrl(buffer.toString('utf8'), target);
      if (!mediaUrl) {
        return NextResponse.json(
          { error: 'No downloadable video found at that link. Paste a direct video URL or upload the file.' },
          { status: 422 },
        );
      }
      ({ buffer, contentType } = await fetchBytes(mediaUrl));
      target = mediaUrl;
    }

    if (!/^(video|audio|image)\//.test(contentType)) {
      return NextResponse.json(
        { error: `That link is not a media file (got ${contentType || 'unknown type'}).` },
        { status: 422 },
      );
    }

    const name = nameFromUrl(target, contentType);
    const path = await uploadBuffer(buffer, name, { folder: folder || 'misc', contentType });
    return NextResponse.json({ path, name });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch the link';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
