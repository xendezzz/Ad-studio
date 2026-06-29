import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { execFileSync } from 'child_process';
import { getFfmpeg } from '@/lib/ffmpegBinaries';
import { createTempWorkspace, cleanupTempWorkspace } from '@/lib/tempWorkspace';
import { downloadToPath, uploadFile } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/motion-control/frame  { video }
 * Extracts the clip's opening frame (no vision) so the user can crop the creator
 * inset manually. Returns { frame: <storagePath> }.
 */
export async function POST(req: NextRequest) {
  try {
    const { video } = await req.json();
    if (!video || typeof video !== 'string') {
      return NextResponse.json({ error: 'video is required' }, { status: 400 });
    }
    const ws = createTempWorkspace('adstudio-frame');
    try {
      const local = path.join(ws, 'in.mp4');
      await downloadToPath(video, local);
      const framePath = path.join(ws, 'frame.jpg');
      execFileSync(
        getFfmpeg(),
        ['-ss', '0.1', '-i', local, '-frames:v', '1', '-q:v', '3', '-y', framePath],
        { stdio: 'ignore' },
      );
      const frame = await uploadFile(framePath, { folder: 'gen/pip-frames', contentType: 'image/jpeg' });
      return NextResponse.json({ frame });
    } finally {
      cleanupTempWorkspace(ws);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Frame extraction failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
