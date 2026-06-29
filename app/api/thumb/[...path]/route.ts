import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { downloadToBuffer } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/thumb/<storage-path>?w=320 — a downscaled WebP thumbnail of an image, for low-load
 * grids (e.g. the Scale review of 100s of first frames). Aggressively cached so each unique
 * image is downscaled once; the browser reuses it. Falls back to /api/serve on any failure.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const objectPath = path.join('/');
  const w = Math.max(64, Math.min(640, Number(req.nextUrl.searchParams.get('w')) || 320));
  try {
    const src = await downloadToBuffer(objectPath);
    const out = await sharp(src).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 55 }).toBuffer();
    return new NextResponse(new Uint8Array(out), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    // fall back to the full-res signed-URL serve route
    return NextResponse.redirect(new URL(`/api/serve/${objectPath}`, req.url), 307);
  }
}
