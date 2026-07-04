/**
 * Pipeline run orchestrator.
 *
 * Takes the canvas graph (nodes + edges), topologically executes it, and produces a
 * final ad. Each node's status is tracked in gen_jobs so the UI can poll live.
 *
 * Engine steps (motion-control, bg-remove) run through the cloud adapters and return
 * Storage paths. ffmpeg steps (combine, text, transition) download inputs to a temp
 * workspace, run locally, and re-upload. Unimplemented steps pass their input through.
 */
import path from 'path';
import { promises as fs } from 'fs';
import { execFileSync } from 'child_process';
import type { PipelineNodeKind } from './pipeline';
import { getMotionEngine } from './motionEngine';
import { removeVideoBackground } from './bgRemoval';
import { getFfmpeg } from './ffmpegBinaries';
import { addTextOverlay } from './ffmpegTextOverlay';
import { applyTextOverlays, type TextItem } from './textBurn';
import { applyAssetOverlays, type AssetItem } from './assetBurn';
import { applySubtitles } from './subtitlesBurn';
import { mixAudio, concatVideos, xfadeVideos } from './ffmpegMediaOps';
import { applyVoice } from './voiceApply';
import { createTempWorkspace, cleanupTempWorkspace } from './tempWorkspace';
import { downloadToPath, uploadFile } from './storage';
import { GenJobs, PipelineRuns, Ads } from './db';

export interface RunNode {
  id: string;
  kind: PipelineNodeKind;
  params?: Record<string, string>;
  /** Vertical canvas position — parts feeding an export are concatenated top→bottom by this. */
  y?: number;
}
export interface RunEdge {
  source: string;
  target: string;
}
export interface RunGraph {
  nodes: RunNode[];
  edges: RunEdge[];
}

interface NodeOutput {
  kind: PipelineNodeKind;
  videoPath?: string;
  imagePath?: string;
  audioPath?: string;
  // a transition node is a MARKER (no video): it tells the sequence to crossfade the clip
  // above it into the clip below it (by Y position) instead of a hard cut.
  transition?: { type: string; duration: number };
}

function topoSort(nodes: RunNode[], edges: RunEdge[]): RunNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  }
  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order: RunNode[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(byId.get(id)!);
    for (const next of adj.get(id) ?? []) {
      indeg.set(next, (indeg.get(next) ?? 0) - 1);
      if (indeg.get(next) === 0) queue.push(next);
    }
  }
  // any leftover (cycle) appended so they still run
  if (order.length < nodes.length) {
    for (const n of nodes) if (!order.includes(n)) order.push(n);
  }
  return order;
}

async function dl(workspace: string, storagePath: string, suffix: string): Promise<string> {
  const ext = path.extname(storagePath) || suffix;
  const local = path.join(workspace, `${Math.random().toString(36).slice(2)}${ext}`);
  await downloadToPath(storagePath, local);
  return local;
}

/**
 * PiP composite: app-demo background (full 1080x1920) + creator alpha cutout
 * (bottom-left, ~half width). CRITICAL: the alpha webm MUST be decoded with the
 * libvpx-vp9 decoder (`-c:v libvpx-vp9` BEFORE the input) — ffmpeg's default vp9
 * decoder silently drops the alpha layer, which makes the cutout opaque (room shows).
 * Audio comes from the creator clip (the spoken VO).
 */
function composePiP(bgLocal: string, alphaLocal: string, outLocal: string): void {
  const CANVAS_W = 1080;
  const CANVAS_H = 1920;
  const PIP_W = 540; // half width, 9:16 box -> no letterbox bars
  const PIP_H = 960;
  const PIP_X = 0; // bottom-left
  const PIP_Y = CANVAS_H - PIP_H;

  const args = [
    '-y',
    '-i', bgLocal,
    '-c:v', 'libvpx-vp9', '-i', alphaLocal, // force alpha-capable decoder
    '-filter_complex',
    `[0:v]scale=${CANVAS_W}:${CANVAS_H}:force_original_aspect_ratio=increase,crop=${CANVAS_W}:${CANVAS_H},setsar=1[bg];` +
      `[1:v]scale=${PIP_W}:${PIP_H}:force_original_aspect_ratio=increase,crop=${PIP_W}:${PIP_H}[fg];` +
      `[bg][fg]overlay=${PIP_X}:${PIP_Y}:shortest=1[v]`,
    '-map', '[v]',
    '-map', '1:a?', // creator VO if present
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast',
    '-c:a', 'aac',
    '-shortest',
    outLocal,
  ];
  execFileSync(getFfmpeg(), args, { timeout: 300000, maxBuffer: 50 * 1024 * 1024 });
}

/** Cut [start,end] out of a local video (re-encode for accurate boundaries). */
function cutRange(inLocal: string, start: number, end: number, outLocal: string): void {
  execFileSync(
    getFfmpeg(),
    ['-ss', start.toFixed(2), '-to', end.toFixed(2), '-i', inLocal, '-c:v', 'libx264', '-c:a', 'aac', '-y', outLocal],
    { timeout: 300000, maxBuffer: 50 * 1024 * 1024 },
  );
}


/**
 * Join Y-ordered inputs into one clip. Videos are concatenated end-to-end, but a transition
 * marker sitting between two videos crossfades them (ffmpeg xfade) instead of a hard cut.
 * Returns a LOCAL path in the workspace.
 */
async function stitchTimeline(ins: NodeOutput[], workspace: string): Promise<string> {
  let result: string | null = null;
  let pending: { type: string; duration: number } | null = null;
  for (const it of ins) {
    if (it.transition) { pending = it.transition; continue; } // marker → crossfade the next join
    if (!it.videoPath) continue;
    const next = await dl(workspace, it.videoPath, '.mp4');
    if (!result) { result = next; pending = null; continue; }
    const out = path.join(workspace, `stitch-${Math.random().toString(36).slice(2)}.mp4`);
    if (pending) xfadeVideos(result, next, out, pending.type, pending.duration);
    else concatVideos([result, next], out);
    result = out;
    pending = null;
  }
  if (!result) throw new Error('no input videos to join');
  return result;
}

/** Execute a graph. Returns the final ad's Storage path (if an export node ran). */
export async function runPipeline(runId: string, graph: RunGraph): Promise<{ adPath?: string }> {
  const workspace = createTempWorkspace('adstudio-run');
  const outputs = new Map<string, NodeOutput>();
  const yOf = new Map(graph.nodes.map((n) => [n.id, n.y ?? 0]));
  // sources of a node, ordered by their vertical (top→bottom) canvas position
  const incoming = (id: string) =>
    graph.edges
      .filter((e) => e.target === id)
      .map((e) => e.source)
      .sort((a, b) => (yOf.get(a) ?? 0) - (yOf.get(b) ?? 0));
  let finalAdPath: string | undefined;

  try {
    await PipelineRuns.update(runId, { status: 'running' });

    for (const node of topoSort(graph.nodes, graph.edges)) {
      const job = await GenJobs.create({
        kind: node.kind,
        status: 'processing',
        pipelineRunId: runId,
        inputRefs: { nodeId: node.id },
      });
      try {
        const ins = incoming(node.id).map((sid) => outputs.get(sid)).filter(Boolean) as NodeOutput[];
        const inVideo = ins.find((o) => o.videoPath)?.videoPath;
        const out = await executeNode(node, ins, workspace);
        outputs.set(node.id, out);
        // export OR sequence produces the final ad (last one in topo order wins)
        if ((node.kind === 'export' || node.kind === 'sequence') && out.videoPath) finalAdPath = out.videoPath;
        await GenJobs.update(job.id, {
          status: 'completed',
          outputPath: out.videoPath ?? out.imagePath ?? null,
          completedAt: new Date().toISOString(),
          inputRefs: { nodeId: node.id, inVideo: inVideo ?? null },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'step failed';
        await GenJobs.update(job.id, { status: 'failed', error: message });
        throw err;
      }
    }

    if (finalAdPath) {
      await Ads.create({ name: `Ad ${runId.slice(0, 8)}`, outputPath: finalAdPath, status: 'ready' });
    }
    await PipelineRuns.update(runId, { status: 'completed' });
    return { adPath: finalAdPath };
  } catch (err) {
    await PipelineRuns.update(runId, { status: 'failed' });
    throw err;
  } finally {
    cleanupTempWorkspace(workspace);
    await fs.rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

async function executeNode(
  node: RunNode,
  ins: NodeOutput[],
  workspace: string,
): Promise<NodeOutput> {
  const p = node.params ?? {};
  const inVideo = ins.find((o) => o.videoPath)?.videoPath;
  const inImage = ins.find((o) => o.imagePath)?.imagePath;

  switch (node.kind) {
    // --- sources: surface their uploaded asset path (swapped clip wins if present) ---
    case 'reference-ad':
    case 'app-demo':
      return { kind: node.kind, videoPath: p.clip };
    case 'hook':
      return { kind: node.kind, videoPath: p.swapped || p.clip };
    case 'model':
      return { kind: node.kind, imagePath: p.persona };
    case 'music':
      return { kind: node.kind, audioPath: p.track };
    // swap output node — carries the already-swapped clip; pass it through
    case 'swap-output':
      return { kind: node.kind, videoPath: p.clip };

    // --- combined-clip + its parts: swapped clip wins, else assigned clip, else cut srcClip ---
    case 'combined-clip':
    case 'cc-hook':
    case 'cc-pip':
    case 'cc-aroll':
    case 'cc-broll':
    case 'cc-cta': {
      if (p.swapped) return { kind: node.kind, videoPath: p.swapped };
      if (p.clip) return { kind: node.kind, videoPath: p.clip };
      if (p.srcClip && p.start && p.end) {
        const src = await dl(workspace, p.srcClip, '.mp4');
        const out = path.join(workspace, `part-${Date.now()}.mp4`);
        cutRange(src, parseFloat(p.start), parseFloat(p.end), out);
        return { kind: node.kind, videoPath: await uploadFile(out, { folder: 'gen/parts' }) };
      }
      return { kind: node.kind };
    }

    // --- generate ---
    case 'motion-control': {
      // already applied live on the canvas (Apply Motion Control) → reuse it
      if (p.clip) return { kind: node.kind, videoPath: p.clip };
      // persona comes from the node itself (picked on canvas) or a wired-in Model node
      const image = p.persona || inImage;
      if (!image || !inVideo)
        throw new Error('motion-control needs a model (image) and a driver clip');
      const engine = getMotionEngine();
      const r = await engine.motionControl({
        imagePath: image,
        driverVideoPath: inVideo,
        keepOriginalSound: (p.audio ?? 'Keep original') === 'Keep original',
        prompt: p.prompt || undefined,
      });
      return { kind: node.kind, videoPath: r.outputPath };
    }
    case 'bg-remove': {
      if (!inVideo) throw new Error('bg-remove needs an input clip');
      const r = await removeVideoBackground(inVideo);
      return { kind: node.kind, videoPath: r.outputPath };
    }

    // --- compose: PiP composite (app-demo bg + creator alpha) ---
    case 'combine': {
      const bg = ins.find((o) => o.kind === 'app-demo')?.videoPath;
      const creator = ins.find((o) => o.kind !== 'app-demo' && o.videoPath)?.videoPath;
      if (!bg || !creator) throw new Error('combine needs an app-demo and a creator clip');
      const bgLocal = await dl(workspace, bg, '.mp4');
      const pipLocal = await dl(workspace, creator, '.webm');
      const outLocal = path.join(workspace, `combine-${Date.now()}.mp4`);
      composePiP(bgLocal, pipLocal, outLocal);
      const outPath = await uploadFile(outLocal, { folder: 'gen/combined' });
      return { kind: node.kind, videoPath: outPath };
    }

    // --- post: text overlay ---
    case 'text': {
      // re-burn the editor's overlays onto the live upstream clip (so a swapped/scaled clip
      // gets the same text), using the exact same engine as the live Text editor.
      let items: TextItem[] | null = null;
      try { items = p.texts ? (JSON.parse(p.texts) as TextItem[]) : null; } catch { items = null; }
      if (items?.length && inVideo) return { kind: node.kind, videoPath: await applyTextOverlays(inVideo, items) };
      if (p.clip) return { kind: node.kind, videoPath: p.clip }; // editor already burned, nothing wired in
      if (!inVideo) throw new Error('text needs an input clip');
      const local = await dl(workspace, inVideo, '.mp4');
      const outLocal = path.join(workspace, `text-${Date.now()}.mp4`);
      await addTextOverlay(
        local,
        outLocal,
        {
          text: (p.content || 'RUNABLE').toUpperCase(),
          position: 'bottom',
          fontSize: 64,
          fontColor: '#ffffff',
          fontFamily: 'Inter, sans-serif',
          outlineColor: '#000000',
          outlineWidth: 6,
          entireVideo: true,
        },
        workspace,
      );
      const outPath = await uploadFile(outLocal, { folder: 'gen/text' });
      return { kind: node.kind, videoPath: outPath };
    }

    // --- post: asset overlays (image / gif / video), positioned + timed ---
    case 'asset': {
      let items: AssetItem[] | null = null;
      try { items = p.assets ? (JSON.parse(p.assets) as AssetItem[]) : null; } catch { items = null; }
      // re-burn onto the live upstream clip so a swapped/scaled clip gets the same assets
      if (items?.length && inVideo) return { kind: node.kind, videoPath: await applyAssetOverlays(inVideo, items) };
      if (p.clip) return { kind: node.kind, videoPath: p.clip };
      return { kind: node.kind, videoPath: inVideo };
    }

    // --- transition: a MARKER between two clips. Wire it to the sequence/export between the two
    // video layers (by Y); the sequence crossfades across it instead of a hard cut. ---
    case 'transition': {
      // "Dissolve" = a smooth cross-dissolve → ffmpeg 'fade' (its 'dissolve' is a noisy pixel dissolve)
      const STYLE: Record<string, string> = {
        Dissolve: 'fade', 'Wipe left': 'wipeleft', 'Slide up': 'slideup',
        'Circle open': 'circleopen', Pixelize: 'pixelize',
      };
      const type = STYLE[p.style ?? 'Dissolve'] ?? 'fade';
      const duration = parseFloat(p.duration ?? '0.5') || 0.5;
      return { kind: node.kind, transition: { type, duration } };
    }

    // --- subtitles: transcribe VO, burn timed captions with the node's chosen style ---
    case 'subtitles': {
      // recompute from the live upstream clip so a swapped/scaled clip gets its own captions,
      // using the same styling the user picked in the Subtitles panel (single source of truth).
      const src = inVideo ?? p.clip;
      if (!src) return { kind: node.kind, videoPath: inVideo };
      // full config (font size / stroke / custom position) is stored as subConfig by the editor
      let cfg: { style?: string; font?: string; fontSize?: number; stroke?: boolean; strokeWidth?: number; strokeColor?: string; position?: string; customX?: number; customY?: number } = {};
      try { cfg = p.subConfig ? JSON.parse(p.subConfig) : {}; } catch { cfg = {}; }
      const opts = cfg.style
        ? {
            style: cfg.style, font: cfg.font, fontSizePx: cfg.fontSize,
            stroke: cfg.stroke, strokeWidth: cfg.strokeWidth, strokeColor: cfg.strokeColor,
            position: cfg.position === 'custom' ? undefined : cfg.position,
            ...(cfg.position === 'custom' ? { customX: (cfg.customX ?? 0.5) * 100, customY: (cfg.customY ?? 0.85) * 100 } : {}),
          }
        : { style: p.style, font: p.font, size: p.size, position: p.position };
      const out = await applySubtitles(src, opts);
      return { kind: node.kind, videoPath: out };
    }

    // --- end-card: append the branded outro asset (assets/endcard.mp4) ---
    case 'end-card': {
      if (!inVideo) return { kind: node.kind, videoPath: inVideo };
      const local = await dl(workspace, inVideo, '.mp4');
      const card = await dl(workspace, p.endcard || 'assets/endcard.mp4', '.mp4');
      const out = path.join(workspace, `endcard-${Date.now()}.mp4`);
      concatVideos([local, card], out);
      return { kind: node.kind, videoPath: await uploadFile(out, { folder: 'gen/endcard' }) };
    }

    // --- music-mix: bed a connected music track under the VO ---
    case 'music-mix': {
      if (!inVideo) return { kind: node.kind, videoPath: inVideo };
      const musicPath = ins.find((o) => o.kind === 'music')?.audioPath ?? p.track;
      if (!musicPath) return { kind: node.kind, videoPath: inVideo };
      const local = await dl(workspace, inVideo, '.mp4');
      const music = await dl(workspace, musicPath, '.mp3');
      const out = path.join(workspace, `music-${Date.now()}.mp4`);
      mixAudio(local, music, out, { volume: 14, fadeOut: 1, audioMode: 'mix' });
      return { kind: node.kind, videoPath: await uploadFile(out, { folder: 'gen/music' }) };
    }

    // --- voice: ElevenLabs speech-to-speech — converts the clip's own audio to the
    // chosen voice, keeping the original timing/performance (needs ELEVENLABS_API_KEY) ---
    case 'voice': {
      if (!inVideo || !p.voiceId) return { kind: node.kind, videoPath: inVideo };
      return { kind: node.kind, videoPath: await applyVoice(inVideo, { voiceId: p.voiceId }) };
    }

    // --- sequence / export: join incoming clips in top→bottom (Y) order. A transition node wired
    // in between two clips (by Y) crossfades them; otherwise it's a hard cut. ins is Y-sorted. ---
    case 'sequence':
    case 'export': {
      const videoCount = ins.filter((o) => o.videoPath).length;
      if (!videoCount) throw new Error(`${node.kind} has no input video`);
      // single clip and no transition → pass it through untouched
      if (videoCount === 1 && !ins.some((o) => o.transition)) {
        return { kind: node.kind, videoPath: ins.find((o) => o.videoPath)!.videoPath };
      }
      const local = await stitchTimeline(ins, workspace);
      const folder = node.kind === 'export' ? 'gen/export' : 'gen/sequence';
      return { kind: node.kind, videoPath: await uploadFile(local, { folder }) };
    }

    default:
      return { kind: node.kind, videoPath: inVideo, imagePath: inImage };
  }
}
