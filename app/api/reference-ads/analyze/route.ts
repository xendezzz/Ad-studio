import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { analyzeReferenceAd, estimateAnalysisCost } from '@/lib/referenceAnalysis';
import { getVideoDuration } from '@/lib/serverUtils';
import { downloadToPath } from '@/lib/storage';
import { createTempWorkspace, cleanupTempWorkspace } from '@/lib/tempWorkspace';
import { config } from '@/lib/config';
import { ReferenceAds } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

async function probeDuration(videoPath: string): Promise<number> {
  const ws = createTempWorkspace('adstudio-probe');
  try {
    const local = path.join(ws, 'ref.mp4');
    await downloadToPath(videoPath, local);
    return getVideoDuration(local) || 0;
  } finally {
    cleanupTempWorkspace(ws);
  }
}

/**
 * POST /api/reference-ads/analyze  { videoPath, name?, estimateOnly? }
 * estimateOnly → { durationSec, cost } (no Claude call).
 * else → runs analysis, persists on the reference_ads row, returns the analysis.
 */
export async function POST(req: NextRequest) {
  try {
    const { videoPath, name, estimateOnly, model } = await req.json();
    if (!videoPath || typeof videoPath !== 'string') {
      return NextResponse.json({ error: 'videoPath is required' }, { status: 400 });
    }

    if (estimateOnly) {
      const durationSec = await probeDuration(videoPath);
      return NextResponse.json({
        durationSec,
        cost: estimateAnalysisCost(durationSec, model),
        keys: { fal: Boolean(config.falKey), anthropic: Boolean(config.anthropicApiKey) },
      });
    }

    const analysis = await analyzeReferenceAd(videoPath, model);

    // Persist on the reference_ads row (transcript + segments) — reused later to split a combined clip.
    try {
      const existing = (await ReferenceAds.list()).find((r) => r.videoPath === videoPath);
      const payload = {
        transcript: analysis.transcript || null,
        segments: analysis.segments,
        durationSec: analysis.durationSec,
      };
      if (existing) await ReferenceAds.update(existing.id, payload);
      else await ReferenceAds.create({ name: name || 'Reference ad', videoPath, ...payload });
    } catch {
      /* persistence is best-effort; analysis still returns */
    }

    return NextResponse.json({ analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
