import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { execFileSync } from 'child_process';
import { getFfmpeg } from '@/lib/ffmpegBinaries';
import { createTempWorkspace, cleanupTempWorkspace } from '@/lib/tempWorkspace';
import { downloadToPath, uploadFile } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

function cutRange(input: string, start: number, end: number, out: string) {
  execFileSync(
    getFfmpeg(),
    ['-ss', start.toFixed(2), '-to', end.toFixed(2), '-i', input, '-c:v', 'libx264', '-c:a', 'aac', '-y', out],
    { stdio: 'ignore' },
  );
}

/**
 * POST /api/clip/trim  { clip, start, end, folder? }
 * Cuts [start,end] out of a stored clip, uploads the result, returns { clip: <newPath> }.
 * Used by the node Trim / Split editor.
 */
export async function POST(req: NextRequest) {
  try {
    const { clip, start, end, folder } = await req.json();
    if (!clip || typeof clip !== 'string') {
      return NextResponse.json({ error: 'clip is required' }, { status: 400 });
    }
    const s = Number(start);
    const e = Number(end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) {
      return NextResponse.json({ error: 'invalid start/end' }, { status: 400 });
    }

    const ws = createTempWorkspace('adstudio-trim');
    try {
      const local = path.join(ws, 'in.mp4');
      await downloadToPath(clip, local);
      const out = path.join(ws, 'out.mp4');
      cutRange(local, s, e, out);
      const newPath = await uploadFile(out, {
        folder: typeof folder === 'string' && folder ? folder : 'combined-clips',
        contentType: 'video/mp4',
      });
      return NextResponse.json({ clip: newPath });
    } finally {
      cleanupTempWorkspace(ws);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Trim failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
