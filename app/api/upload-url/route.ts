import { NextRequest, NextResponse } from 'next/server';
import { buildObjectPath, createPresignedUploadUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * POST /api/upload-url  { folder, filename } → { path, signedUrl, token }
 * Returns a presigned Supabase upload URL so the browser can PUT the file DIRECTLY to Storage,
 * bypassing the Next.js request-body size limit (needed for large videos like reference ads).
 */
export async function POST(req: NextRequest) {
  try {
    const { folder, filename } = await req.json();
    const objectPath = buildObjectPath(folder || 'misc', filename || 'upload.bin');
    const { signedUrl, token, path } = await createPresignedUploadUrl(objectPath);
    return NextResponse.json({ path, signedUrl, token });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create upload URL';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
