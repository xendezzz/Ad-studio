/**
 * Supabase Storage wrapper for Ad-Studio.
 *
 * Reimplements the interface ai-ugc used for R2 (uploadImage/uploadVideo/uploadBuffer/
 * uploadFile/downloadToBuffer/downloadToPath/deleteFile/getSignedUrl/createPresignedUploadUrl)
 * so copied libs/routes keep the same call sites.
 *
 * Convention: functions store and return an object PATH (key) within the bucket.
 * Use `getSignedUrl(path)` to produce a time-limited fetchable URL (e.g. to hand to FAL).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import { config } from './config';

let _client: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (!_client) {
    _client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

function bucket() {
  return client().storage.from(config.storageBucket);
}

function sanitize(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** Build a unique object path inside a folder, preserving the extension. */
export function buildObjectPath(folder: string, originalFilename?: string): string {
  const ext = originalFilename ? path.extname(originalFilename) : '';
  const base = originalFilename
    ? sanitize(path.basename(originalFilename, ext))
    : 'file';
  return `${folder}/${Date.now()}-${randomUUID().slice(0, 8)}-${base}${ext}`;
}

function guessContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
  };
  return map[ext] ?? 'application/octet-stream';
}

/** Upload an arbitrary buffer to a folder. Returns the object path. */
export async function uploadBuffer(
  buffer: Buffer,
  filename: string,
  options?: { folder?: string; contentType?: string },
): Promise<string> {
  const folder = options?.folder ?? 'misc';
  const objectPath = buildObjectPath(folder, filename);
  const contentType = options?.contentType ?? guessContentType(filename);
  const { error } = await bucket().upload(objectPath, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Supabase upload failed: ${error.message}`);
  return objectPath;
}

/** Upload an image buffer (optionally folder). Returns { path, contentType }. */
export async function uploadImage(
  buffer: Buffer,
  originalFilename: string,
  folder = 'images',
): Promise<{ path: string; contentType: string }> {
  const contentType = guessContentType(originalFilename) || 'image/png';
  const objectPath = await uploadBuffer(buffer, originalFilename, { folder, contentType });
  return { path: objectPath, contentType };
}

/** Upload a video buffer. Returns { path, contentType }. */
export async function uploadVideo(
  buffer: Buffer,
  originalFilename: string,
  folder = 'videos',
): Promise<{ path: string; contentType: string }> {
  const contentType = guessContentType(originalFilename) || 'video/mp4';
  const objectPath = await uploadBuffer(buffer, originalFilename, { folder, contentType });
  return { path: objectPath, contentType };
}

/** Upload a local file from disk. Returns the object path. */
export async function uploadFile(
  localPath: string,
  options?: { folder?: string; filename?: string; contentType?: string },
): Promise<string> {
  const buffer = await fs.readFile(localPath);
  const filename = options?.filename ?? path.basename(localPath);
  return uploadBuffer(buffer, filename, {
    folder: options?.folder ?? 'misc',
    contentType: options?.contentType,
  });
}

/** Download an object (by path) to a Buffer. */
export async function downloadToBuffer(objectPath: string): Promise<Buffer> {
  const { data, error } = await bucket().download(objectPath);
  if (error || !data) throw new Error(`Supabase download failed: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Download an object (by path) to a local file. Returns the local path. */
export async function downloadToPath(objectPath: string, localPath: string): Promise<string> {
  const buffer = await downloadToBuffer(objectPath);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, buffer);
  return localPath;
}

/** Delete an object by path. */
export async function deleteFile(objectPath: string): Promise<boolean> {
  const { error } = await bucket().remove([objectPath]);
  if (error) throw new Error(`Supabase delete failed: ${error.message}`);
  return true;
}

/** Create a time-limited signed URL for reading an object (e.g. to hand to FAL). */
export async function getSignedUrl(
  objectPath: string,
  expiresInSeconds = 3600,
  download?: boolean | string,
): Promise<string> {
  const { data, error } = await bucket().createSignedUrl(
    objectPath,
    expiresInSeconds,
    download ? { download } : undefined,
  );
  if (error || !data) throw new Error(`Supabase signed URL failed: ${error?.message}`);
  return data.signedUrl;
}

/** Create a signed UPLOAD URL so the browser can PUT a file directly. */
export async function createPresignedUploadUrl(
  objectPath: string,
): Promise<{ signedUrl: string; token: string; path: string }> {
  const { data, error } = await bucket().createSignedUploadUrl(objectPath);
  if (error || !data) throw new Error(`Supabase signed upload URL failed: ${error?.message}`);
  return { signedUrl: data.signedUrl, token: data.token, path: data.path };
}
