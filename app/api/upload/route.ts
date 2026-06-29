import { NextRequest, NextResponse } from 'next/server';
import { uploadBuffer } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/upload  (multipart form-data)
 *   field "file"   — the file
 *   field "folder" — optional bucket folder (models | hooks | app-demos | music | reference-ads)
 * Returns { path } — the Supabase Storage object path.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    const folder = (form.get('folder') as string) || 'misc';

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const name = (file as File).name || 'upload.bin';
    const buffer = Buffer.from(await file.arrayBuffer());
    const path = await uploadBuffer(buffer, name, {
      folder,
      contentType: file.type || undefined,
    });

    return NextResponse.json({ path });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
