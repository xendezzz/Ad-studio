import { NextResponse } from 'next/server';
import { PipelineRuns, GenJobs } from '@/lib/db';
import { getSignedUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/run/[id] — run status + per-node job status (keyed by canvas node id).
 * Returns { status, nodes: { [nodeId]: 'processing'|'completed'|'failed' }, adUrl? }.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await PipelineRuns.get(id);
  if (!run) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const jobs = await GenJobs.byRun(id);
  const nodes: Record<string, string> = {};
  const nodeOutputs: Record<string, string> = {}; // nodeId → output clip, so every stage shows a preview
  let adPath: string | null = null;
  let finalNodeId: string | null = null; // the export/sequence node that produced the final ad
  let error: { kind: string; message: string } | null = null;
  const exports: { nodeId: string; path: string }[] = []; // every export node's output (for Export all)
  for (const j of jobs) {
    const nodeId = (j.inputRefs as { nodeId?: string } | null)?.nodeId;
    if (nodeId) nodes[nodeId] = j.status;
    if (nodeId && j.outputPath) nodeOutputs[nodeId] = j.outputPath;
    // export wins over sequence (it's downstream); last matching job's output is the final ad
    if (j.kind === 'export' && j.outputPath) {
      adPath = j.outputPath; finalNodeId = nodeId ?? finalNodeId;
      if (nodeId) exports.push({ nodeId, path: j.outputPath });
    } else if (j.kind === 'sequence' && j.outputPath && !adPath) { adPath = j.outputPath; finalNodeId = nodeId ?? finalNodeId; }
    if (j.status === 'failed' && !error) {
      error = { kind: j.kind, message: j.error || 'step failed' };
    }
  }

  let adUrl: string | null = null;
  if (adPath) {
    try {
      adUrl = await getSignedUrl(adPath, 3600);
    } catch {
      adUrl = null;
    }
  }

  return NextResponse.json({ status: run.status, nodes, nodeOutputs, adUrl, adPath, finalNodeId, exports, error });
}
