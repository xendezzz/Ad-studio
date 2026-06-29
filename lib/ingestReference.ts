/**
 * Reference-ad ingest: probe + transcribe + naive segment division.
 * Stores a reference_ads row with transcript + detected segments.
 */
import path from 'path';
import { execFileSync } from 'child_process';
import { getFfprobe } from './ffmpegBinaries';
import { getVideoDuration } from './serverUtils';
import { transcribeWords } from './transcribe';
import { createTempWorkspace, cleanupTempWorkspace } from './tempWorkspace';
import { downloadToPath } from './storage';
import { ReferenceAds } from './db';

function probeSize(file: string): { width: number; height: number } {
  try {
    const out = execFileSync(
      getFfprobe(),
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file],
      { encoding: 'utf-8' },
    ).trim();
    const [w, h] = out.split('x').map(Number);
    return { width: w || 1080, height: h || 1920 };
  } catch {
    return { width: 1080, height: 1920 };
  }
}

export interface Segment {
  kind: 'hook' | 'pip' | 'app_demo';
  startSec: number;
  endSec: number;
}

export async function ingestReferenceAd(videoPath: string, name: string) {
  const ws = createTempWorkspace('adstudio-ingest');
  try {
    const local = path.join(ws, 'ref.mp4');
    await downloadToPath(videoPath, local);
    const duration = getVideoDuration(local) || 0;
    const { width, height } = probeSize(local);

    let transcript = '';
    try {
      const words = await transcribeWords(videoPath);
      transcript = words.map((w) => w.text).join(' ');
    } catch {
      /* transcription optional */
    }

    // Naive division: opening = hook, remainder = app-demo demo (creator as PiP throughout).
    const hookEnd = Math.min(3, duration || 3);
    const segments: Segment[] = [
      { kind: 'hook', startSec: 0, endSec: hookEnd },
      { kind: 'app_demo', startSec: hookEnd, endSec: duration || hookEnd },
    ];

    return ReferenceAds.create({
      name,
      videoPath,
      durationSec: duration,
      width,
      height,
      transcript: transcript || null,
      segments,
    });
  } finally {
    cleanupTempWorkspace(ws);
  }
}
