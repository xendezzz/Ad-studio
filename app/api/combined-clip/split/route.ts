import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { execFileSync } from 'child_process';
import { getFfmpeg } from '@/lib/ffmpegBinaries';
import { createTempWorkspace, cleanupTempWorkspace } from '@/lib/tempWorkspace';
import { downloadToPath, uploadFile } from '@/lib/storage';
import { transcribeWords } from '@/lib/transcribe';
import { getVideoDuration } from '@/lib/serverUtils';
import { alignCombinedClip, type AlignablePart } from '@/lib/combinedAlign';
import { ReferenceAds } from '@/lib/db';
import type { AnalyzedSegment } from '@/lib/referenceAnalysis';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

type SegKind = 'cc-hook' | 'cc-pip' | 'cc-aroll' | 'cc-broll' | 'cc-cta';

// aligned reference part → the combined-clip segment node kind
const PART_TO_NODE: Record<AlignablePart, SegKind> = {
  hook: 'cc-hook',
  pip: 'cc-pip',
  a_roll: 'cc-aroll',
  b_roll: 'cc-broll',
};

// The CTA segment is always our own branded outro, not a cut from the creator's clip.
const RUNABLE_END_CARD = 'assets/endcard.mp4';

function cutRange(input: string, start: number, end: number, out: string) {
  execFileSync(
    getFfmpeg(),
    ['-ss', start.toFixed(2), '-to', end.toFixed(2), '-i', input, '-c:v', 'libx264', '-c:a', 'aac', '-y', out],
    { stdio: 'ignore' },
  );
}

/** One section, cut from the creator's combined clip + uploaded as its own clip. */
interface SplitSegment {
  kind: SegKind;
  part: AlignablePart | 'cta';
  clip: string;
  startSec: number;
  endSec: number;
}

/**
 * POST /api/combined-clip/split  { clip, refClip, model? }
 *
 * The creator's combined clip is a single talking-head recording of a script SIMILAR to
 * the reference ad. We use the reference ad's analysis (section order + per-section script)
 * to cut the creator's clip into the same sections:
 *   1. transcribe the creator's clip (word-level)
 *   2. LLM-align each reference section's script to the creator clip's timeline
 *   3. cut + upload one sub-clip per matched section, in order
 *   4. append the Runable end card if the reference ends on a CTA
 * Returns { segments: [...] } (ordered, ready for the canvas to spawn nodes).
 */
export async function POST(req: NextRequest) {
  try {
    const { clip, refClip, model } = await req.json();
    if (!clip || typeof clip !== 'string') {
      return NextResponse.json({ error: 'clip is required' }, { status: 400 });
    }
    if (!refClip || typeof refClip !== 'string') {
      return NextResponse.json({ error: 'refClip (the analyzed reference ad) is required' }, { status: 400 });
    }

    // Pull the reference ad's persisted analysis (transcript + segments).
    const ref = (await ReferenceAds.list()).find((r) => r.videoPath === refClip);
    const refSegments = (ref?.segments as AnalyzedSegment[] | undefined) ?? [];
    if (!ref || !refSegments.length) {
      return NextResponse.json(
        { error: 'Analyze the reference ad first — its sections drive the split.' },
        { status: 400 },
      );
    }
    const hasCta = refSegments.some((s) => s.part === 'cta');

    // Transcribe the creator's clip so we can align spoken content to reference sections.
    const creatorWords = await transcribeWords(clip);
    if (!creatorWords.length) {
      return NextResponse.json(
        { error: 'No speech detected in the combined clip — sections are aligned from the spoken script.' },
        { status: 400 },
      );
    }

    const ws = createTempWorkspace('adstudio-split');
    const segments: SplitSegment[] = [];
    try {
      const local = path.join(ws, 'combined.mp4');
      await downloadToPath(clip, local);
      const durationSec = getVideoDuration(local) || creatorWords[creatorWords.length - 1].end;

      const aligned = await alignCombinedClip({
        refSegments,
        refTranscript: ref.transcript ?? '',
        creatorWords,
        durationSec,
        modelId: model,
      });

      // cut + upload one clip per matched section, preserving order
      let i = 0;
      for (const sec of aligned) {
        if (!sec.matched) continue;
        const piece = path.join(ws, `seg-${i}.mp4`);
        try {
          cutRange(local, sec.startSec, sec.endSec, piece);
        } catch {
          continue; // skip a bad cut
        }
        const uploaded = await uploadFile(piece, { folder: 'combined-clips', contentType: 'video/mp4' });
        segments.push({
          kind: PART_TO_NODE[sec.part],
          part: sec.part,
          clip: uploaded,
          startSec: sec.startSec,
          endSec: sec.endSec,
        });
        i++;
      }
    } finally {
      cleanupTempWorkspace(ws);
    }

    // The CTA is our branded outro, not cut from the creator — append it last.
    if (hasCta) {
      segments.push({ kind: 'cc-cta', part: 'cta', clip: RUNABLE_END_CARD, startSec: 0, endSec: 0 });
    }

    if (!segments.length) {
      return NextResponse.json(
        { error: "Couldn't align any sections — check the combined clip matches the reference script." },
        { status: 422 },
      );
    }

    return NextResponse.json({ segments });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Split failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
