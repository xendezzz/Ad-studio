import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { createNonUgcJob, getNonUgcJob, updateNonUgcJob } from '@/lib/nonugcJobs';
import { renderNonUgcAd, type NonUgcFormat, type NonUgcParams } from '@/lib/nonugcRender';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

const FORMATS: NonUgcFormat[] = ['showcase', 'story', 'kinetic'];

/**
 * POST /api/nonugc  { format, params }
 * Starts a background render of a Non-UGC ad template, returns { jobId }.
 * Local-first: jobs are in-memory, output lands in public/nonugc/.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const format = body?.format as NonUgcFormat;
    if (!FORMATS.includes(format)) {
      return NextResponse.json({ error: `format must be one of ${FORMATS.join(', ')}` }, { status: 400 });
    }
    const params = (body?.params ?? {}) as NonUgcParams;

    const job = createNonUgcJob();
    after(async () => {
      try {
        const url = await renderNonUgcAd(format, params);
        updateNonUgcJob(job.id, { status: 'completed', url });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'render failed';
        console.error('[nonugc] render failed', job.id, message);
        updateNonUgcJob(job.id, { status: 'failed', error: message });
      }
    });

    return NextResponse.json({ jobId: job.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'request failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET /api/nonugc?id=<jobId> → { status, url?, error? } */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const job = getNonUgcJob(id);
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ status: job.status, url: job.url ?? null, error: job.error ?? null });
}
