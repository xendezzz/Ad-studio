import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { PipelineRuns } from '@/lib/db';
import { runPipeline, type RunGraph } from '@/lib/runPipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

/**
 * POST /api/run  { name?, graph: { nodes, edges } }
 * Creates a pipeline_run, kicks off execution in the background, returns { runId }.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const graph = body?.graph as RunGraph | undefined;
    if (!graph?.nodes?.length) {
      return NextResponse.json({ error: 'graph.nodes required' }, { status: 400 });
    }

    const run = await PipelineRuns.create({
      name: body.name || 'Untitled run',
      status: 'queued',
      config: graph,
    });

    after(async () => {
      try {
        await runPipeline(run.id, graph);
      } catch (err) {
        console.error('[run] pipeline failed', run.id, err);
      }
    });

    return NextResponse.json({ runId: run.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'run failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
