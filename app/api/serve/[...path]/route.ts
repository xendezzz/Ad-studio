import { NextResponse } from 'next/server';
import { getSignedUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/serve/<object/path> — 307-redirects to a signed URL for the private
 * bucket object, so <img>/<video src> can load private assets directly.
 */
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const objectPath = path.map(decodeURIComponent).join('/');
  // ?download=1 (or ?download=name.mp4) forces the browser to download the file
  const dl = new URL(req.url).searchParams.get('download');
  const download = dl ? (dl === '1' ? objectPath.split('/').pop() || true : dl) : undefined;
  try {
    const url = await getSignedUrl(objectPath, 3600, download);
    return NextResponse.redirect(url, 307);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'not found';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
