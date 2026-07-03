'use client';

/**
 * Upload a file to Supabase Storage from the browser. Large videos (reference ads etc.) exceed
 * the Next.js route body limit, so we upload DIRECTLY to Storage via a presigned URL:
 *   1. ask the server for a presigned upload URL (tiny JSON request)
 *   2. PUT the file straight to Supabase (no size limit through our server)
 * Falls back to the small /api/upload route if presigning isn't available.
 * Returns the Storage object path.
 */
export async function uploadAsset(file: File, folder: string): Promise<string> {
  // 1. presigned URL
  const r = await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder, filename: file.name }),
  });
  if (r.ok) {
    const { path, signedUrl } = await r.json();
    // 2. PUT directly to Supabase Storage
    const put = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' },
      body: file,
    });
    if (put.ok) return path as string;
    throw new Error(`Upload failed (${put.status})`);
  }

  // fallback: small files via the server route
  const fd = new FormData();
  fd.append('file', file);
  fd.append('folder', folder);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await res.json();
  if (res.ok && data.path) return data.path as string;
  throw new Error(data.error || 'Upload failed');
}
