'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type NodeMouseHandler,
} from '@xyflow/react';
import { StepNode, type StepNodeData } from '@/components/studio/nodes/StepNode';
import { FrameNode } from '@/components/studio/nodes/FrameNode';
import { Topbar } from '@/components/studio/Topbar';
import { LeftToolbar } from '@/components/studio/LeftToolbar';
import { Inspector } from '@/components/studio/Inspector';
import { OutputPanel } from '@/components/studio/OutputPanel';
import { NodeContextMenu, type ContextMenuState } from '@/components/studio/NodeContextMenu';
import { ScalePanel } from '@/components/studio/ScalePanel';
import { ExportResultsPanel } from '@/components/studio/ExportResultsPanel';
import { ScaleReviewPanel, type ScaleReview, type ScaleFrame } from '@/components/studio/ScaleReviewPanel';
import { CostConfirmModal, type CostPrompt } from '@/components/studio/CostConfirmModal';
import { costLine, COST_USD } from '@/lib/costs';
import { recordAsset } from '@/lib/libraryAssets';
import { TrimSplitModal } from '@/components/studio/TrimSplitModal';
import { ModelPickerModal, type PickModel } from '@/components/studio/ModelPickerModal';
import { FirstFrameModal } from '@/components/studio/FirstFrameModal';
import { CropVerifyModal, type Box } from '@/components/studio/CropVerifyModal';
import { StudioActionsContext } from '@/components/studio/studioActions';
import { TextEditorModal, type TextItem } from '@/components/studio/TextEditorModal';
import { AssetEditorModal, type AssetItem } from '@/components/studio/AssetEditorModal';
import { SubtitlesEditorModal, type SubtitleConfig, DEFAULT_SUB_CONFIG } from '@/components/studio/SubtitlesEditorModal';
import { VoiceEditorModal, type VoiceApplyPayload } from '@/components/studio/VoiceEditorModal';
import { NODE_DEFS, type PipelineNodeKind } from '@/lib/pipeline';
import { projectsStore } from '@/lib/projectsStore';

const STORAGE_KEY = 'adstudio-pipeline';
// Runable branded outro — pre-filled when an End Card segment is added manually.
const END_CARD_PATH = 'assets/endcard.mp4';
// fallback creator-inset crop (bottom-left quadrant) if detection is unusable
const DEFAULT_CROP: Box = { x: 0, y: 0.5, w: 0.5, h: 0.5 };
// parse a crop box stored as a JSON string in node params (params values are strings)
function safeBox(s?: string): Box | null {
  if (!s) return null;
  try {
    const b = JSON.parse(s);
    return typeof b?.x === 'number' && typeof b?.w === 'number' ? (b as Box) : null;
  } catch {
    return null;
  }
}

// Computed/transform nodes whose cached output must be cleared when a pipeline is duplicated for
// Scale, so each step recomputes on the new model's swapped clip (sources keep their clip).
const SCALE_RECOMPUTE_KINDS = new Set<string>([
  'swap-output', 'motion-control', 'bg-remove', 'combine', 'text', 'subtitles',
  'transition', 'end-card', 'music-mix', 'voice', 'sequence', 'export',
]);

// Collect a node and all of its upstream ancestors (reverse edge walk) into `set`.
function ancestorsInto(id: string, set: Set<string>, edges: Edge[]) {
  if (set.has(id)) return;
  set.add(id);
  for (const e of edges) if (e.target === id) ancestorsInto(e.source, set, edges);
}

// Splice a swap-output node INTO the data path: re-point every downstream edge that left the
// part so it now leaves the swap-output instead. Data flows left→right through wires, so the
// swapped clip — not the part's original — is what reaches the sequence/export. Idempotent.
function spliceSwapIntoChain(edges: Edge[], partId: string, swapOutId: string): Edge[] {
  const seen = new Set<string>();
  const out: Edge[] = [];
  for (const e of edges) {
    const edge =
      e.source === partId && e.target !== swapOutId
        ? { ...e, source: swapOutId, id: `e-${swapOutId}-${e.target}` }
        : e;
    const key = `${edge.source}->${edge.target}`;
    if (seen.has(key)) continue; // collapse any duplicate that the re-point would create
    seen.add(key);
    out.push(edge);
  }
  return out;
}

// generate a swapped first frame for one part (used by both the single-part gate and batch Scale)
async function requestFirstFrame(persona: string, video: string, crop?: Box): Promise<{ image?: string; error?: string }> {
  try {
    const res = await fetch('/api/motion-control/first-frame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona, video, crop }),
    });
    const d = await res.json();
    if (res.ok && d.image) return { image: d.image as string };
    return { error: (d.error as string) || 'first-frame failed' };
  } catch {
    return { error: 'first-frame failed' };
  }
}

const nodeTypes: NodeTypes = { step: StepNode, frame: FrameNode };

// bounding box (with padding) around a set of nodes — used to draw pipeline frames
const FRAME_PAD = 48;
const NODE_W = 240;
const NODE_H = 230;
function boundsOf(nodes: { position: { x: number; y: number } }[]): { x: number; y: number; w: number; h: number } {
  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  const minX = Math.min(...xs) - FRAME_PAD;
  const minY = Math.min(...ys) - FRAME_PAD;
  const maxX = Math.max(...xs) + NODE_W + FRAME_PAD;
  const maxY = Math.max(...ys) + NODE_H + FRAME_PAD;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// segment node kind → the analyzed reference part it cuts from (cc-cta is the end card, not cut)
const NODE_TO_PART: Partial<Record<PipelineNodeKind, string>> = {
  'cc-hook': 'hook',
  'cc-pip': 'pip',
  'cc-aroll': 'a_roll',
  'cc-broll': 'b_roll',
};

// Segment node titles. Hook is unique; pip/a-roll/b-roll recur, so they carry an index.
function segLabel(kind: PipelineNodeKind, n: number): string {
  switch (kind) {
    case 'cc-hook':
      return 'Hook';
    case 'cc-pip':
      return `PiP ${n}`;
    case 'cc-aroll':
      return `A-roll ${n}`;
    case 'cc-broll':
      return `B-roll ${n}`;
    case 'cc-cta':
      return 'End Card';
    default:
      return NODE_DEFS[kind].label;
  }
}

function Inner({ projectId }: { projectId?: string }) {
  // A project opens with an EMPTY canvas; nodes come from its saved graph (if any).
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [projectName, setProjectName] = useState('Untitled project');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // ONE global model to swap into every part (chosen in the top bar)
  const [swapModel, setSwapModel] = useState<PickModel | null>(null);
  const [swapPickerOpen, setSwapPickerOpen] = useState(false);
  // per-part first-frame verify gate (targets the part node being swapped)
  const [firstFrameFor, setFirstFrameFor] = useState<string | null>(null);
  const [firstFrameSrc, setFirstFrameSrc] = useState<string | null>(null);
  const [ffStage, setFfStage] = useState<'image' | 'video' | 'idle'>('idle');
  // PiP face-swap crop: mark the creator inset before motion control
  const [swapCropFor, setSwapCropFor] = useState<string | null>(null);
  const [swapCrop, setSwapCrop] = useState<{ frame: string | null; box: Box } | null>(null);
  const [swapCropBox, setSwapCropBox] = useState<Box | null>(null);
  // the first approved swapped still — reused as the character reference for later parts
  const [swapReference, setSwapReference] = useState<string | null>(null);
  // --- Scale: duplicate the pipeline per model, then batch (approve all first frames → render all) ---
  const [scaling, setScaling] = useState(false);
  const [scaleReview, setScaleReview] = useState<ScaleReview | null>(null);
  const scaleNewIdsRef = useRef<Set<string>>(new Set()); // step-node ids added in the latest scale
  // credit-cost confirmation gate, shown before any step that spends credits
  const [costPrompt, setCostPrompt] = useState<CostPrompt | null>(null);
  // Export all: results of the multi-export run (one row per pipeline, named by model)
  const [exportResults, setExportResults] = useState<{ name: string; path: string }[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportAllRef = useRef(false);
  // Text node editor (multi-text + emoji timeline)
  const [textEditor, setTextEditor] = useState<{ nodeId: string; video: string; items: TextItem[] } | null>(null);
  const [textBusy, setTextBusy] = useState(false);
  // Asset node editor (image / gif / video overlays, timed + positioned)
  const [assetEditor, setAssetEditor] = useState<{ nodeId: string; video: string; items: AssetItem[] } | null>(null);
  const [assetBusy, setAssetBusy] = useState(false);
  // Subtitles editor (style / font / size / stroke / position)
  const [subtitlesEditor, setSubtitlesEditor] = useState<{ nodeId: string; video: string; cfg: SubtitleConfig } | null>(null);
  const [voiceEditor, setVoiceEditor] = useState<{ nodeId: string; video: string; voiceId: string | null } | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [subtitlesBusy, setSubtitlesBusy] = useState(false);
  // user-facing error/result surfaced in the OutputPanel
  const [error, setError] = useState<string | null>(null);
  const { screenToFlowPosition } = useReactFlow();
  const addCount = useRef(0);
  // track whether the user actually touched this canvas (so untouched new projects aren't saved)
  const dirty = useRef(false);
  const liveRef = useRef<{ nodes: Node[]; edges: Edge[] }>({ nodes, edges });
  liveRef.current = { nodes, edges };
  // in-canvas clipboard for Cmd+C / Cmd+V (selected nodes + the edges between them)
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const cleanupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- undo / redo history ---
  const past = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const future = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const snapshot = useCallback(() => {
    dirty.current = true;
    past.current.push({
      nodes: nodes.map((n) => ({ ...n, data: { ...n.data } })),
      edges: edges.map((e) => ({ ...e })),
    });
    if (past.current.length > 60) past.current.shift();
    future.current = [];
  }, [nodes, edges]);
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    dirty.current = true;
    future.current.push({ nodes, edges });
    setNodes(prev.nodes);
    setEdges(prev.edges);
  }, [nodes, edges, setNodes, setEdges]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    dirty.current = true;
    past.current.push({ nodes, edges });
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [nodes, edges, setNodes, setEdges]);

  // copy the current selection (nodes + edges wholly between them) into the in-canvas clipboard
  const copySelection = useCallback(() => {
    const sel = liveRef.current.nodes.filter((n) => n.selected);
    if (!sel.length) return;
    const ids = new Set(sel.map((n) => n.id));
    const edges = liveRef.current.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    // clone params so later canvas edits don't mutate what's on the clipboard
    clipboardRef.current = {
      nodes: sel.map((n) => ({ ...n, data: { ...n.data, params: { ...((n.data as StepNodeData).params ?? {}) } } })),
      edges: edges.map((e) => ({ ...e })),
    };
  }, []);

  // paste the clipboard: fresh ids, internal edges rewired, offset down-right, pasted = selected
  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip?.nodes.length) return;
    snapshot();
    const stamp = Date.now().toString(36);
    const idMap: Record<string, string> = {};
    clip.nodes.forEach((n, i) => (idMap[n.id] = `${(n.data as StepNodeData).kind}-${stamp}-${i}`));
    const pasted: Node[] = clip.nodes.map((n) => ({
      ...n,
      id: idMap[n.id],
      position: { x: n.position.x + 48, y: n.position.y + 48 },
      selected: true,
      data: { ...n.data, status: undefined, params: { ...((n.data as StepNodeData).params ?? {}) } },
    }));
    const pastedEdges: Edge[] = clip.edges
      .filter((e) => idMap[e.source] && idMap[e.target])
      .map((e) => ({ ...e, id: `e-${idMap[e.source]}-${idMap[e.target]}`, source: idMap[e.source], target: idMap[e.target] }));
    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...pasted]);
    setEdges((eds) => [...eds, ...pastedEdges]);
  }, [snapshot, setNodes, setEdges]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (el && el.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === 'c') {
        copySelection();
      } else if (mod && key === 'v') {
        e.preventDefault();
        pasteClipboard();
      } else if (mod && key === 'd') {
        // duplicate selection in place (copy + paste in one stroke)
        e.preventDefault();
        copySelection();
        pasteClipboard();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, copySelection, pasteClipboard]);

  // Prune a pipeline's boundary frame once its nodes are gone, so deleting a scaled pipeline fully
  // removes it (and its model drops out of the "used" list, which is derived from scaleGroup tags).
  useEffect(() => {
    const liveGroups = new Set(
      nodes
        .filter((n) => n.type === 'step')
        .map((n) => (n.data as StepNodeData).params?.scaleGroup)
        .filter(Boolean),
    );
    const hasReferenceSteps = nodes.some((n) => n.type === 'step' && !(n.data as StepNodeData).params?.scaleGroup);
    const isOrphan = (n: Node) =>
      n.type === 'frame' &&
      (n.id === 'frame-reference' ? !hasReferenceSteps : !liveGroups.has((n.data as { label?: string }).label));
    if (nodes.some(isOrphan)) setNodes((nds) => nds.filter((n) => !isOrphan(n)));
  }, [nodes, setNodes]);

  // wrap change handlers so deletions are undoable
  const onNodesChangeH = useCallback<typeof onNodesChange>(
    (changes) => {
      if (changes.some((c) => c.type === 'remove')) snapshot();
      onNodesChange(changes);
    },
    [onNodesChange, snapshot],
  );
  const onEdgesChangeH = useCallback<typeof onEdgesChange>(
    (changes) => {
      if (changes.some((c) => c.type === 'remove')) snapshot();
      onEdgesChange(changes);
    },
    [onEdgesChange, snapshot],
  );

  // When a Reference Ad is connected to a Combined Clip, "listen to" the combined clip,
  // split it into its real timeline of segments, and spawn ONE node per detected segment
  // (Hook, then PiP/A-roll/B-roll which can recur) stacked vertically in play order.
  const splitCombinedClip = useCallback(
    async (referenceId: string, combinedId: string, clipOverride?: string) => {
      const cur = liveRef.current.nodes;
      const liveEdges = liveRef.current.edges;
      const ref = cur.find((n) => n.id === referenceId);
      const combined = cur.find((n) => n.id === combinedId);
      if (!ref || !combined) return;
      if ((ref.data as StepNodeData).kind !== 'reference-ad') return;
      if ((combined.data as StepNodeData).kind !== 'combined-clip') return;
      // clipOverride covers the "clip just uploaded" path, where liveRef hasn't committed yet.
      const clip = clipOverride ?? (combined.data as StepNodeData).params?.clip;
      if (!clip) return;

      const setStatus = (id: string, status: StepNodeData['status']) =>
        setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, status } } : n)));

      // clear any segment nodes from a previous split of this combined clip
      const prevSegIds = new Set(
        liveEdges
          .filter((e) => e.source === combinedId)
          .map((e) => e.target)
          .filter((tid) => String((cur.find((n) => n.id === tid)?.data as StepNodeData)?.kind ?? '').startsWith('cc-')),
      );
      if (prevSegIds.size) {
        setNodes((nds) => nds.filter((n) => !prevSegIds.has(n.id)));
        setEdges((eds) => eds.filter((e) => !prevSegIds.has(e.target)));
      }
      setStatus(combinedId, 'processing');

      try {
        const refParams = (ref.data as StepNodeData).params ?? {};
        const refClip = refParams.clip;
        if (!refClip) {
          setStatus(combinedId, 'failed');
          return;
        }
        const res = await fetch('/api/combined-clip/split', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clip, refClip, model: refParams.analysisModel }),
        });
        const d = await res.json();
        const segs = (d?.segments ?? []) as { kind: PipelineNodeKind; clip: string; part: string; startSec?: number; endSec?: number }[];
        if (!res.ok || !segs.length) {
          setStatus(combinedId, 'failed');
          return;
        }

        // vertical timeline stack to the right of the combined clip — top = plays first
        const COL_X = combined.position.x + 300;
        const ROW_H = 150;
        const startY = combined.position.y - ((segs.length - 1) * ROW_H) / 2;
        const stamp = Date.now().toString(36);
        const counts: Record<string, number> = {};
        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];
        segs.forEach((s, i) => {
          counts[s.kind] = (counts[s.kind] ?? 0) + 1;
          const id = `${s.kind}-${stamp}-${i}`;
          // remember the source clip + the AI-cut range, so Trim/Split can show the FULL
          // source and let the user drag the handles to reclaim cut portions.
          const hasRange = typeof s.endSec === 'number' && (s.endSec ?? 0) > (s.startSec ?? 0);
          newNodes.push({
            id,
            type: 'step',
            position: { x: COL_X, y: startY + i * ROW_H },
            data: {
              kind: s.kind,
              title: segLabel(s.kind, counts[s.kind]),
              params: {
                clip: s.clip,
                ...(hasRange ? { srcClip: clip, srcStart: String(s.startSec), srcEnd: String(s.endSec) } : {}),
              },
              status: 'completed',
            } as StepNodeData,
            selected: false,
          });
          newEdges.push({ id: `e-${combinedId}-${id}`, source: combinedId, target: id });
        });
        setNodes((nds) => [...nds, ...newNodes]);
        setEdges((eds) => [...eds, ...newEdges]);
        setStatus(combinedId, 'completed');
      } catch {
        setStatus(combinedId, 'failed');
      }
    },
    [setNodes, setEdges],
  );

  // If a Combined Clip already has a Reference Ad wired in, (re)split as soon as it gets
  // a clip — so the upload-then-connect and connect-then-upload orders behave the same.
  const autoSplitOnClip = useCallback(
    (combinedId: string, clip: string) => {
      if (!clip) return;
      const refEdge = liveRef.current.edges.find((e) => {
        if (e.target !== combinedId) return false;
        const src = liveRef.current.nodes.find((n) => n.id === e.source);
        return src && (src.data as StepNodeData).kind === 'reference-ad';
      });
      if (refEdge) void splitCombinedClip(refEdge.source, combinedId, clip);
    },
    [splitCombinedClip],
  );

  // Reference Ad wired straight into a segment node (no combined clip): cut that part out
  // of the reference using its own analysis. One node per occurrence — extras spawn as
  // siblings below, also fed by the reference.
  const cutReferenceParts = useCallback(
    async (referenceId: string, segNodeId: string, kind: PipelineNodeKind) => {
      const cur = liveRef.current.nodes;
      const ref = cur.find((n) => n.id === referenceId);
      const seg = cur.find((n) => n.id === segNodeId);
      const part = NODE_TO_PART[kind];
      if (!ref || !seg || !part) return;
      const refData = ref.data as StepNodeData;
      const refClip = refData.params?.clip;
      if (!refClip) return;

      const setStatus = (id: string, status: StepNodeData['status']) =>
        setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, status } } : n)));

      let segments: { part: string; startSec: number; endSec: number }[] = [];
      try {
        segments = JSON.parse(refData.params?.analysis ?? '{}').segments ?? [];
      } catch {
        /* not analyzed */
      }
      const occ = segments
        .filter((s) => s.part === part)
        .sort((a, b) => a.startSec - b.startSec);
      if (!occ.length) {
        // reference isn't analyzed yet, or has no segment of this kind
        setStatus(segNodeId, 'failed');
        return;
      }

      setStatus(segNodeId, 'processing');

      // spawn sibling nodes for occurrences beyond the first, fed by the same reference
      const stamp = Date.now().toString(36);
      const siblingIds: string[] = [];
      if (occ.length > 1) {
        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];
        for (let i = 1; i < occ.length; i++) {
          const id = `${kind}-${stamp}-${i}`;
          siblingIds.push(id);
          newNodes.push({
            id,
            type: 'step',
            position: { x: seg.position.x, y: seg.position.y + i * 170 },
            data: { kind, title: segLabel(kind, i + 1), status: 'processing' } as StepNodeData,
            selected: false,
          });
          newEdges.push({ id: `e-${referenceId}-${id}`, source: referenceId, target: id });
        }
        setNodes((nds) => [...nds, ...newNodes]);
        setEdges((eds) => [...eds, ...newEdges]);
      }

      const targetIds = [segNodeId, ...siblingIds];
      await Promise.all(
        targetIds.map(async (tid, idx) => {
          const o = occ[idx];
          let clip: string | null = null;
          try {
            const res = await fetch('/api/clip/trim', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clip: refClip, start: o.startSec, end: o.endSec, folder: 'reference-parts' }),
            });
            const d = await res.json();
            if (res.ok && d.clip) clip = d.clip;
          } catch {
            /* falls through to failed status */
          }
          setNodes((nds) =>
            nds.map((n) =>
              n.id === tid
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      status: clip ? 'completed' : 'failed',
                      title: segLabel(kind, idx + 1),
                      // keep the reference source + cut range for reclaimable Trim/Split
                      params: { ...((n.data as StepNodeData).params ?? {}), ...(clip ? { clip, srcClip: refClip, srcStart: String(o.startSec), srcEnd: String(o.endSec) } : {}) },
                    },
                  }
                : n,
            ),
          );
        }),
      );
    },
    [setNodes, setEdges],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      snapshot();
      setEdges((eds) => addEdge(params, eds));
      if (params.source && params.target) {
        const src = nodes.find((n) => n.id === params.source);
        const tgt = nodes.find((n) => n.id === params.target);
        const srcKind = src && (src.data as StepNodeData).kind;
        const tgtKind = tgt && (tgt.data as StepNodeData).kind;
        if (srcKind === 'reference-ad' && tgtKind === 'combined-clip') {
          void splitCombinedClip(params.source, params.target);
        } else if (srcKind === 'reference-ad' && tgtKind && NODE_TO_PART[tgtKind]) {
          void cutReferenceParts(params.source, params.target, tgtKind);
        } else if (srcKind === 'app-demo' && tgtKind === 'cc-pip') {
          // App Demo → PiP clip: record it as the background. The bg-removed, face-swapped
          // creator gets composited over THIS when motion control runs on the PiP.
          const appDemo = (src!.data as StepNodeData).params?.clip;
          const tid = params.target;
          if (appDemo) {
            setNodes((nds) =>
              nds.map((n) =>
                n.id === tid
                  ? { ...n, data: { ...n.data, params: { ...((n.data as StepNodeData).params ?? {}), appDemo } } }
                  : n,
              ),
            );
          }
        }
      }
    },
    [setEdges, snapshot, nodes, splitCombinedClip, cutReferenceParts, setNodes],
  );

  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    if (node.type !== 'step') return; // frames are non-interactive boundaries
    setSelectedId(node.id);
  }, []);

  const setNodeStatus = useCallback(
    (id: string, status: StepNodeData['status']) => {
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, status } } : n)));
    },
    [setNodes],
  );

  const updateParam = useCallback(
    (id: string, key: string, value: string) => {
      dirty.current = true;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  params: { ...((n.data as StepNodeData).params ?? {}), [key]: value },
                },
              }
            : n,
        ),
      );
      if (key === 'clip' || key === 'track') {
        const n = liveRef.current.nodes.find((x) => x.id === id);
        const d = n?.data as StepNodeData | undefined;
        if (key === 'clip' && d?.kind === 'combined-clip') autoSplitOnClip(id, value);
        // only the reference pipeline feeds the library; scaled rows are duplicates (no dup files)
        if (!d?.params?.scaleGroup) recordAsset(d?.kind, d?.title ?? d?.kind ?? '', value);
      }
    },
    [setNodes, autoSplitOnClip],
  );

  const setNodeData = useCallback(
    (id: string, patch: { title?: string; params?: Record<string, string> }) => {
      snapshot();
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  ...(patch.title !== undefined ? { title: patch.title } : {}),
                  params: { ...((n.data as StepNodeData).params ?? {}), ...(patch.params ?? {}) },
                },
              }
            : n,
        ),
      );
      const asset = patch.params?.clip ?? patch.params?.track;
      if (asset) {
        const n = liveRef.current.nodes.find((x) => x.id === id);
        const d = n?.data as StepNodeData | undefined;
        if (patch.params?.clip && d?.kind === 'combined-clip') autoSplitOnClip(id, patch.params.clip);
        // only the reference pipeline feeds the library; scaled rows are duplicates (no dup files)
        if (!d?.params?.scaleGroup) recordAsset(d?.kind, patch.title ?? d?.title ?? d?.kind ?? '', asset);
      }
    },
    [setNodes, snapshot, autoSplitOnClip],
  );

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  // estimated $ to scale ONE more pipeline (reference's swap sites: first frames + swaps)
  const usdPerPipeline = (() => {
    const refParts = nodes.filter(
      (n) =>
        n.type === 'step' &&
        !(n.data as StepNodeData).params?.scaleGroup &&
        edges.some(
          (e) => e.source === n.id && (nodes.find((x) => x.id === e.target)?.data as StepNodeData | undefined)?.kind === 'swap-output',
        ),
    );
    const pip = refParts.filter((n) => (n.data as StepNodeData).kind === 'cc-pip').length;
    const motion = refParts.length - pip;
    const firstFrames = (refParts.some((n) => (n.data as StepNodeData).kind !== 'cc-pip') ? 1 : 0) + pip;
    return firstFrames * COST_USD.firstFrame + motion * COST_USD.motionSwap + pip * COST_USD.pipSwap;
  })();

  // --- run the pipeline ---
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const runScopeRef = useRef<Set<string> | null>(null); // node ids the active run may touch (null = all)
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [trimNodeId, setTrimNodeId] = useState<string | null>(null);
  const [trimBusy, setTrimBusy] = useState(false);

  const onRun = useCallback(async () => {
    // pre-flight: connected source nodes must have their asset
    const usedSources = new Set(edges.map((e) => e.source));
    const missing: string[] = [];
    for (const n of nodes) {
      if (!usedSources.has(n.id)) continue;
      const d = n.data as StepNodeData;
      const p = d.params ?? {};
      if (d.kind === 'model' && !p.persona) missing.push(`“${d.title ?? 'Model'}” needs a persona`);
      if ((d.kind === 'hook' || d.kind === 'app-demo' || d.kind === 'reference-ad') && !p.clip)
        missing.push(`“${d.title ?? d.kind}” needs a clip`);
    }
    if (missing.length) {
      setError(`Add assets first — ${missing.join('; ')}. Upload via the node’s inspector or pick from Libraries.`);
      return;
    }

    const graph = {
      nodes: nodes
        .filter((n) => n.type === 'step') // frames are visual-only, not pipeline steps
        .map((n) => ({
          id: n.id,
          kind: (n.data as StepNodeData).kind,
          params: (n.data as StepNodeData).params ?? {},
          y: n.position.y, // parts feeding export are concatenated in top→bottom order
        })),
      edges: edges.map((e) => ({ source: e.source, target: e.target })),
    };
    setRunning(true);
    setError(null);
    setResultUrl(null);
    runScopeRef.current = null; // full-canvas run touches every node
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, status: undefined } })));
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph }),
      });
      const data = await res.json();
      if (!res.ok || !data.runId) throw new Error(data.error || 'run failed');
      setRunId(data.runId);
    } catch (err) {
      setRunning(false);
      console.error('[run]', err);
    }
  }, [nodes, edges, setNodes]);

  // poll run status while a run is in flight
  useEffect(() => {
    if (!runId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await fetch(`/api/run/${runId}`);
        const data = await res.json();
        if (!active) return;
        // update each node's status AND surface its output clip as a preview as it finishes —
        // only for nodes in this run's scope, so finished/other pipelines aren't disturbed
        const outs = (data.nodeOutputs as Record<string, string> | undefined) ?? {};
        const scope = runScopeRef.current;
        setNodes((nds) =>
          nds.map((n) => {
            if (scope && !scope.has(n.id)) return n;
            const out = outs[n.id];
            const params = out
              ? { ...((n.data as StepNodeData).params ?? {}), clip: out }
              : (n.data as StepNodeData).params;
            return { ...n, data: { ...n.data, status: data.nodes?.[n.id], params } };
          }),
        );
        if (data.status === 'completed' || data.status === 'failed') {
          setRunning(false);
          setExporting(false);
          // attach EVERY export node's output to its own node (multi-pipeline canvases)
          const exps = (data.exports as { nodeId: string; path: string }[] | undefined) ?? [];
          if (exps.length) {
            setNodes((nds) =>
              nds.map((n) => {
                const hit = exps.find((e) => e.nodeId === n.id);
                return hit
                  ? { ...n, data: { ...n.data, status: 'completed', params: { ...((n.data as StepNodeData).params ?? {}), clip: hit.path } } }
                  : n;
              }),
            );
          }
          // download panel = ALL export nodes on the canvas (just-run ones via nodeOutputs,
          // already-finished ones via their stored clip) — finished pipelines aren't re-run.
          if (exportAllRef.current) {
            const live = liveRef.current.nodes;
            setExportResults(
              live
                .filter((n) => n.type === 'step' && (n.data as StepNodeData).kind === 'export')
                .map((n) => {
                  const p = (n.data as StepNodeData).params;
                  const path = outs[n.id] ?? p?.clip;
                  return { name: p?.scaleGroup ?? projectName ?? 'Ad', path: path ?? '' };
                })
                .filter((r) => r.path),
            );
          }
          exportAllRef.current = false;
          if (data.status === 'failed') {
            const e = data.error;
            setError(e ? `${e.kind} failed — ${e.message || 'see logs'}` : 'Run failed.');
          } else if (data.adPath) {
            const adPath = data.adPath as string;
            const finalId = data.finalNodeId as string | undefined;
            // show the rendered clip ON the node that produced it (the one you clicked Render on)
            setNodes((nds) =>
              nds.map((n) => {
                const isFinal = finalId
                  ? n.id === finalId
                  : (n.data as StepNodeData).kind === 'export' || (n.data as StepNodeData).kind === 'sequence';
                return isFinal
                  ? { ...n, data: { ...n.data, status: 'completed', params: { ...((n.data as StepNodeData).params ?? {}), clip: adPath } } }
                  : n;
              }),
            );
            if (projectId) {
              const modelNode = nodes.find((n) => (n.data as StepNodeData).kind === 'model');
              projectsStore.addOutput(projectId, {
                modelId: (modelNode?.data as StepNodeData)?.params?.persona ?? 'model',
                modelName: (modelNode?.data as StepNodeData)?.title ?? 'Model',
                adPath,
                createdAt: new Date().toISOString(),
              });
            }
          }
          return;
        }
      } catch {
        /* keep polling */
      }
      if (active) timer = setTimeout(tick, 1500);
    };
    timer = setTimeout(tick, 800);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [runId, setNodes]);

  const onAddNode = useCallback(
    (kind: PipelineNodeKind, init?: { title?: string; params?: Record<string, string> }) => {
      snapshot();
      const n = addCount.current++;
      const base = screenToFlowPosition({
        x: typeof window !== 'undefined' ? window.innerWidth / 2 : 700,
        y: typeof window !== 'undefined' ? window.innerHeight / 2 : 360,
      });
      const stamp = Date.now().toString(36);
      const id = `${kind}-${stamp}`;
      const pos = { x: base.x + ((n * 28) % 120) - 100, y: base.y + ((n * 28) % 120) - 100 };

      // Section nodes added by hand: number recurring kinds (PiP 1, PiP 2…) and
      // pre-fill the End Card with the Runable outro so it's ready to drop in.
      const isSegment = kind === 'cc-hook' || kind === 'cc-pip' || kind === 'cc-aroll' || kind === 'cc-broll' || kind === 'cc-cta';
      let title = init?.title ?? NODE_DEFS[kind].label;
      let params = init?.params;
      if (!init?.title && isSegment) {
        const count = liveRef.current.nodes.filter((x) => (x.data as StepNodeData).kind === kind).length + 1;
        title = segLabel(kind, count);
      }
      if (kind === 'cc-cta' && !params?.clip) {
        params = { ...(params ?? {}), clip: END_CARD_PATH };
      }

      const newNode: Node = {
        id,
        type: 'step',
        position: pos,
        data: { kind, title, params } as StepNodeData,
        selected: true,
      };

      // A Combined Clip starts bare — its segment nodes are spawned later by the split,
      // one per detected segment (see splitCombinedClip), once a Reference Ad is connected.
      setNodes((nds) => [...nds.map((nd) => ({ ...nd, selected: false })), newNode]);
    },
    [screenToFlowPosition, setNodes, snapshot],
  );

  // --- right-click menu + duplicate/delete ---
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const onNodeContextMenu = useCallback<NodeMouseHandler>((e, node) => {
    e.preventDefault();
    if (node.type !== 'step') return; // no context menu on boundary frames
    const me = e as React.MouseEvent;
    setMenu({ nodeId: node.id, x: me.clientX, y: me.clientY });
  }, []);
  const duplicateNode = useCallback(
    (id: string) => {
      snapshot();
      setNodes((nds) => {
        const n = nds.find((x) => x.id === id);
        if (!n) return nds;
        const copy: Node = {
          ...n,
          id: `${(n.data as StepNodeData).kind}-${Date.now().toString(36)}`,
          position: { x: n.position.x + 40, y: n.position.y + 40 },
          selected: true,
        };
        return [...nds.map((x) => ({ ...x, selected: false })), copy];
      });
      setMenu(null);
    },
    [setNodes, snapshot],
  );
  const deleteNode = useCallback(
    (id: string) => {
      snapshot();
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setMenu(null);
    },
    [setNodes, setEdges, snapshot],
  );
  const showDetails = useCallback((id: string) => {
    setSelectedId(id);
    setMenu(null);
  }, []);

  // --- trim / split a node's video ---
  const openTrim = useCallback((id: string) => {
    setTrimNodeId(id);
    setMenu(null);
  }, []);
  const trimClip = useCallback(
    async (clip: string, start: number, end: number): Promise<string | null> => {
      try {
        const res = await fetch('/api/clip/trim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clip, start, end }),
        });
        const d = await res.json();
        return res.ok && d.clip ? (d.clip as string) : null;
      } catch {
        return null;
      }
    },
    [],
  );
  // "Clip" — trim this node's video to [start,end], replacing its clip.
  const onClipNode = useCallback(
    async (start: number, end: number) => {
      const id = trimNodeId;
      const node = liveRef.current.nodes.find((n) => n.id === id);
      const params = (node?.data as StepNodeData | undefined)?.params;
      // cut from the FULL source when we have it (start/end are absolute source times), else the clip
      const source = params?.srcClip ?? params?.clip;
      if (!id || !source) return;
      setTrimBusy(true);
      const out = await trimClip(source, start, end);
      setTrimBusy(false);
      if (out) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id
              ? { ...n, data: { ...n.data, params: { ...((n.data as StepNodeData).params ?? {}), clip: out, ...(params?.srcClip ? { srcStart: String(start), srcEnd: String(end) } : {}) } } }
              : n,
          ),
        );
        setTrimNodeId(null);
      }
    },
    [trimNodeId, trimClip, setNodes],
  );
  // "Split here" — node keeps [start,mid]; a new sibling node (same kind) gets [mid,end].
  const onSplitNode = useCallback(
    async (start: number, mid: number, end: number) => {
      const id = trimNodeId;
      const node = liveRef.current.nodes.find((n) => n.id === id);
      const data = node?.data as StepNodeData | undefined;
      const source = data?.params?.srcClip ?? data?.params?.clip;
      if (!id || !node || !data || !source) return;
      setTrimBusy(true);
      // absolute source times when we have srcClip; else times within the clip
      const [c1, c2] = await Promise.all([trimClip(source, start, mid), trimClip(source, mid, end)]);
      setTrimBusy(false);
      if (!c1 || !c2) return;
      snapshot();
      const kind = data.kind;
      const isCc = kind === 'cc-hook' || kind === 'cc-pip' || kind === 'cc-aroll' || kind === 'cc-broll' || kind === 'cc-cta';
      const count = liveRef.current.nodes.filter((n) => (n.data as StepNodeData).kind === kind).length + 1;
      const newTitle = isCc ? segLabel(kind, count) : `${data.title ?? NODE_DEFS[kind].label} (2)`;
      const newId = `${kind}-${Date.now().toString(36)}`;
      const hasSrc = Boolean(data.params?.srcClip);
      const newNode: Node = {
        id: newId,
        type: 'step',
        position: { x: node.position.x, y: node.position.y + 170 },
        data: { kind, title: newTitle, params: { ...(data.params ?? {}), clip: c2, ...(hasSrc ? { srcStart: String(mid), srcEnd: String(end) } : {}) } } as StepNodeData,
        selected: true,
      };
      // part 1 stays on the original node; part 2 inherits the original's downstream links
      const outEdges = liveRef.current.edges
        .filter((e) => e.source === id)
        .map((e) => ({ ...e, id: `e-${newId}-${e.target}`, source: newId }));
      setNodes((nds) => [
        ...nds.map((n) =>
          n.id === id
            ? { ...n, selected: false, data: { ...n.data, params: { ...(data.params ?? {}), clip: c1, ...(hasSrc ? { srcStart: String(start), srcEnd: String(mid) } : {}) } } }
            : { ...n, selected: false },
        ),
        newNode,
      ]);
      setEdges((eds) => [...eds, ...outEdges]);
      setTrimNodeId(null);
    },
    [trimNodeId, trimClip, snapshot, setNodes, setEdges],
  );
  const trimNode = nodes.find((n) => n.id === trimNodeId) ?? null;

  // --- motion control: ONE global model (top bar) applied per part ---
  const onPickModel = useCallback((m: PickModel) => {
    setSwapModel(m);
    setSwapReference(null); // a new model invalidates the old swapped reference
    setSwapPickerOpen(false);
  }, []);

  // generate the swapped first frame for ONE part (optionally on a PiP crop, for verification)
  const runFirstFrame = useCallback(async (nodeId: string, video: string, persona: string, crop?: Box) => {
    setError(null);
    setFirstFrameFor(nodeId);
    setFirstFrameSrc(null);
    setFfStage('image');
    try {
      const res = await fetch('/api/motion-control/first-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona, video, crop }),
      });
      const d = await res.json();
      if (res.ok && d.image) {
        setFirstFrameSrc(d.image);
        setFfStage('idle');
      } else {
        setFirstFrameFor(null);
        setFfStage('idle');
        setError(d.error ? `First frame failed — ${d.error}` : 'First-frame generation failed.');
      }
    } catch {
      setFirstFrameFor(null);
      setFfStage('idle');
      setError('First-frame generation failed.');
    }
  }, []);

  // run the Kling video swap with a character `image` (a generated first frame OR the reused
  // ad reference) and put the result on a NEW connected swap-output node.
  const runVideoSwap = useCallback(
    async (nodeId: string, image: string, crop?: Box) => {
      const node = liveRef.current.nodes.find((n) => n.id === nodeId);
      const params = (node?.data as StepNodeData | undefined)?.params ?? {};
      const video = params.clip;
      if (!video) {
        setError('This part no longer has a clip.');
        return;
      }
      const keepOriginalSound = (params.audio ?? 'Keep original') === 'Keep original';
      setNodeStatus(nodeId, 'processing');
      try {
        const res = crop
          ? await fetch('/api/motion-control/pip', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              // pipUseOriginal → paste the swapped creator back into the clip (no external app demo)
              body: JSON.stringify({
                image, pipVideo: video, crop, keepOriginalSound, prompt: params.prompt,
                appDemo: params.pipUseOriginal === 'true' ? undefined : params.appDemo,
              }),
            })
          : await fetch('/api/motion-control', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image, video, keepOriginalSound, prompt: params.prompt }),
            });
        const d = await res.json();
        if (!res.ok || !d.clip) {
          setNodeStatus(nodeId, 'failed');
          setError(d.error ? `Motion control failed — ${d.error}` : 'Motion control failed.');
          return;
        }
        // put the swapped clip on a NEW node connected from this part (not the part itself)
        const ns = liveRef.current.nodes;
        const es = liveRef.current.edges;
        const srcNode = ns.find((n) => n.id === nodeId);
        const existingEdge = es.find(
          (e) => e.source === nodeId && (ns.find((n) => n.id === e.target)?.data as StepNodeData | undefined)?.kind === 'swap-output',
        );
        // in a scaled pipeline the model name is tagged on the part; else use the global model
        const title = `Swap · ${params.scaleGroup ?? swapModel?.name ?? 'model'}`;
        const tagSource = (n: Node) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  status: undefined,
                  params: { ...((n.data as StepNodeData).params ?? {}), firstFrame: image, ...(crop ? { cropBox: JSON.stringify(crop) } : {}) },
                },
              }
            : n;
        if (existingEdge) {
          const outId = existingEdge.target;
          setNodes((nds) =>
            nds.map((n) =>
              n.id === outId
                ? { ...n, data: { ...n.data, status: 'completed', title, params: { ...((n.data as StepNodeData).params ?? {}), clip: d.clip } } }
                : tagSource(n),
            ),
          );
          // ensure the swapped output (not the original part) feeds whatever the part fed
          setEdges((eds) => spliceSwapIntoChain(eds, nodeId, outId));
        } else if (srcNode) {
          const outId = `swap-output-${Date.now().toString(36)}`;
          const outNode: Node = {
            id: outId,
            type: 'step',
            position: { x: srcNode.position.x + 280, y: srcNode.position.y },
            data: { kind: 'swap-output', title, params: { clip: d.clip }, status: 'completed' } as StepNodeData,
            selected: true,
          };
          setNodes((nds) => [...nds.map((n) => ({ ...tagSource(n), selected: false })), outNode]);
          // insert swap-output between the part and its downstream: part → swap-output → (sequence…)
          setEdges((eds) =>
            spliceSwapIntoChain([...eds, { id: `e-${nodeId}-${outId}`, source: nodeId, target: outId }], nodeId, outId),
          );
        }
      } catch {
        setNodeStatus(nodeId, 'failed');
        setError('Motion control failed.');
      }
    },
    [swapModel, setNodes, setNodeStatus, setEdges],
  );

  // "Apply Motion Control" on a part → swap the global model onto that part's clip.
  // PiP parts crop the creator inset first (so the swap runs on the creator, not the whole frame).
  const applyPartSwap = useCallback(
    async (nodeId: string) => {
      const persona = swapModel?.imagePath;
      if (!persona) {
        setError('Pick a model to swap to in the top bar first.');
        return;
      }
      const node = liveRef.current.nodes.find((n) => n.id === nodeId);
      const data = node?.data as StepNodeData | undefined;
      const video = data?.params?.clip;
      if (!video) {
        setError('This part has no clip yet — add one before applying motion control.');
        return;
      }
      const isPiP = data?.kind === 'cc-pip';
      const pipUseOriginal = data?.params?.pipUseOriginal === 'true';
      if (isPiP && !pipUseOriginal && !data?.params?.appDemo) {
        setError('Connect an App Demo node to this PiP part, or turn on "Use app demo in clip" in the inspector to keep the demo already in the video.');
        return;
      }

      const proceed = async () => {
        if (isPiP) {
          // PiP: mark the creator inset first, then swap only that
          setError(null);
          setSwapCropFor(nodeId);
          setSwapCrop({ frame: null, box: (data?.params?.cropBox && safeBox(data.params.cropBox)) || DEFAULT_CROP });
          try {
            const res = await fetch('/api/motion-control/frame', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ video }),
            });
            const d = await res.json();
            if (res.ok && d.frame) {
              setSwapCrop((cur) => (cur ? { ...cur, frame: d.frame } : cur));
            } else {
              setSwapCropFor(null);
              setSwapCrop(null);
              setError(d.error ? `Couldn't load the frame — ${d.error}` : "Couldn't load the PiP frame.");
            }
          } catch {
            setSwapCropFor(null);
            setSwapCrop(null);
            setError("Couldn't load the PiP frame.");
          }
          return;
        }
        // reuse the approved reference if we have one; otherwise generate + verify a fresh first frame
        if (swapReference) void runVideoSwap(nodeId, swapReference);
        else void runFirstFrame(nodeId, video, persona);
      };

      // cost gate before any credits are spent
      setCostPrompt({
        title: 'Apply motion control',
        confirmLabel: 'Apply',
        note: 'Estimated — actual generation cost may vary with clip length.',
        lines: [
          costLine('First frame', swapReference ? 0 : 1, 'firstFrame'),
          costLine(isPiP ? 'PiP motion swap' : 'Motion swap', 1, isPiP ? 'pipSwap' : 'motionSwap'),
        ],
        onConfirm: () => void proceed(),
      });
    },
    [swapModel, swapReference, runFirstFrame, runVideoSwap],
  );

  // crop confirmed → first frame on the cropped creator (keeps the box for the video step)
  const confirmSwapCrop = useCallback(
    (box: Box) => {
      const nodeId = swapCropFor;
      const persona = swapModel?.imagePath;
      if (!nodeId || !persona) return;
      const node = liveRef.current.nodes.find((n) => n.id === nodeId);
      const video = (node?.data as StepNodeData | undefined)?.params?.clip;
      if (!video) return;
      setSwapCropFor(null);
      setSwapCrop(null);
      // reuse the approved reference (skip the fragile per-crop first frame) if we have one
      if (swapReference) {
        void runVideoSwap(nodeId, swapReference, box);
      } else {
        setSwapCropBox(box);
        void runFirstFrame(nodeId, video, persona, box);
      }
    },
    [swapCropFor, swapModel, swapReference, runFirstFrame, runVideoSwap],
  );
  const autoDetectSwapCrop = useCallback(async (): Promise<Box | null> => {
    const node = liveRef.current.nodes.find((n) => n.id === swapCropFor);
    const video = (node?.data as StepNodeData | undefined)?.params?.clip;
    if (!video) return null;
    try {
      const res = await fetch('/api/motion-control/detect-crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video }),
      });
      const d = await res.json();
      return res.ok && d.box ? (d.box as Box) : null;
    } catch {
      return null;
    }
  }, [swapCropFor]);
  const closeSwapCrop = useCallback(() => {
    setSwapCropFor(null);
    setSwapCrop(null);
  }, []);

  const regenerateFirstFrame = useCallback(() => {
    const nodeId = firstFrameFor;
    if (!nodeId) return;
    const node = liveRef.current.nodes.find((n) => n.id === nodeId);
    const video = (node?.data as StepNodeData | undefined)?.params?.clip;
    const persona = swapModel?.imagePath;
    if (!persona || !video) return;
    void runFirstFrame(nodeId, video, persona, swapCropBox ?? undefined);
  }, [firstFrameFor, swapModel, swapCropBox, runFirstFrame]);

  // approved first frame → store it as the ad reference (first time), then run the video swap
  // in the background: close the modal right away so the part shows "processing" on the canvas
  // and other parts can start their own motion-control jobs in parallel.
  const approveFirstFrame = useCallback(() => {
    const nodeId = firstFrameFor;
    const image = firstFrameSrc;
    if (!nodeId || !image) return;
    const crop = swapCropBox ?? undefined;
    setSwapReference((prev) => prev ?? image); // first approved swap becomes the reusable reference
    setFirstFrameFor(null);
    setFirstFrameSrc(null);
    setFfStage('idle');
    setSwapCropBox(null);
    void runVideoSwap(nodeId, image, crop);
  }, [firstFrameFor, firstFrameSrc, swapCropBox, runVideoSwap]);

  const closeFirstFrame = useCallback(() => {
    setFirstFrameFor(null);
    setFirstFrameSrc(null);
    setFfStage('idle');
    setSwapCropBox(null);
  }, []);

  // Generate the swapped first frame for every pending Scale frame, but keep ONE ad consistent:
  // per model, generate an anchor frame first, then generate that ad's other parts from the
  // anchor still so the character wears the same clothes across all segments.
  const generateScaleFrames = useCallback(async (frames: ScaleFrame[]) => {
    const patch = (taskId: string, p: Partial<ScaleFrame>) =>
      setScaleReview((r) => (r ? { ...r, frames: r.frames.map((f) => (f.taskId === taskId ? { ...f, ...p } : f)) } : r));
    // group by model — each ad (model row) gets its own consistent character reference
    const byModel = new Map<string, ScaleFrame[]>();
    for (const f of frames) {
      if (!byModel.has(f.persona)) byModel.set(f.persona, []);
      byModel.get(f.persona)!.push(f);
    }
    const genAd = async (group: ScaleFrame[]) => {
      // anchor = a full-frame (non-PiP) part if possible, so the outfit is fully visible
      const anchorIdx = group.findIndex((f) => !f.crop);
      const anchor = group[anchorIdx >= 0 ? anchorIdx : 0];
      patch(anchor.taskId, { status: 'generating' });
      const a = await requestFirstFrame(anchor.persona, anchor.clip, anchor.crop);
      const reference = a.image ?? anchor.persona; // anchor still drives the rest of this ad
      patch(anchor.taskId, { reference, ...(a.image ? { image: a.image, status: 'done' } : { status: 'failed', approved: false }) });
      for (const f of group) {
        if (f.taskId === anchor.taskId) continue;
        // full-frame parts (hook + a-roll) are the same talking-head shot — reuse the anchor's
        // frame directly so they're identical, no extra generation. PiP parts crop differently
        // so they generate their own frame from the anchor reference (same person + clothes).
        if (!f.crop && a.image) {
          patch(f.taskId, { reference, image: a.image, status: 'done' });
          continue;
        }
        patch(f.taskId, { status: 'generating', reference });
        const r = await requestFirstFrame(reference, f.clip, f.crop);
        patch(f.taskId, r.image ? { image: r.image, status: 'done' } : { status: 'failed', approved: false });
      }
    };
    const queue = [...byModel.values()];
    const worker = async () => {
      while (queue.length) await genAd(queue.shift()!);
    };
    await Promise.all([worker(), worker(), worker()]); // 3 ads at a time; each ad internally sequential
  }, []);

  const toggleScaleFrame = useCallback((taskId: string) => {
    setScaleReview((r) =>
      r ? { ...r, frames: r.frames.map((f) => (f.taskId === taskId && f.status === 'done' ? { ...f, approved: !f.approved } : f)) } : r,
    );
  }, []);

  const regenScaleFrame = useCallback((taskId: string) => {
    const f = scaleReview?.frames.find((x) => x.taskId === taskId);
    if (!f) return;
    // regenerate from the ad's anchor reference (keeps clothes consistent), not the bare model image
    const persona = f.reference ?? f.persona;
    setScaleReview((r) => (r ? { ...r, frames: r.frames.map((x) => (x.taskId === taskId ? { ...x, status: 'generating', image: undefined } : x)) } : r));
    void requestFirstFrame(persona, f.clip, f.crop).then(({ image }) =>
      setScaleReview((r) =>
        r ? { ...r, frames: r.frames.map((x) => (x.taskId === taskId ? { ...x, ...(image ? { image, status: 'done', approved: true } : { status: 'failed', approved: false }) } : x)) } : r,
      ),
    );
  }, [scaleReview]);

  // Run ONLY the given step nodes as a subgraph (edges between them). Used to scope runs to the
  // new pipelines so finished/reference pipelines are never re-rendered. isExportAll → show the
  // download panel on completion.
  const launchRun = useCallback(
    (stepNodes: Node[], isExportAll: boolean): boolean => {
      const run = stepNodes.filter((n) => n.type === 'step');
      if (!run.length) return false;
      const ids = new Set(run.map((n) => n.id));
      const es = liveRef.current.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
      const graph = {
        nodes: run.map((n) => ({
          id: n.id,
          kind: (n.data as StepNodeData).kind,
          params: (n.data as StepNodeData).params ?? {},
          y: n.position.y,
        })),
        edges: es.map((e) => ({ source: e.source, target: e.target })),
      };
      exportAllRef.current = isExportAll;
      runScopeRef.current = ids; // the poll only touches these nodes
      setExporting(true);
      setError(null);
      // reset status only on the nodes being run — leave finished pipelines as they are
      setNodes((nds) => nds.map((n) => (ids.has(n.id) ? { ...n, data: { ...n.data, status: undefined } } : n)));
      fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (!data.runId) throw new Error(data.error || 'run failed');
          setRunId(data.runId);
        })
        .catch((err) => {
          setExporting(false);
          exportAllRef.current = false;
          setError(err instanceof Error ? err.message : 'Run failed.');
        });
      return true;
    },
    [setNodes],
  );

  // "Export all": present downloads for every export node. Pipelines already rendered are left
  // untouched — only un-rendered exports (and their ancestors) are run.
  const onExportAll = useCallback(() => {
    const ns = liveRef.current.nodes.filter((n) => n.type === 'step');
    const exportNodes = ns.filter((n) => (n.data as StepNodeData).kind === 'export');
    if (!exportNodes.length) {
      setError('Add an Export node to each pipeline you want to export, then Export all.');
      return;
    }
    const missing = exportNodes.filter((n) => !(n.data as StepNodeData).params?.clip);
    if (!missing.length) {
      // everything already rendered → just present the downloads, no run
      setExportResults(
        exportNodes.map((n) => {
          const p = (n.data as StepNodeData).params;
          return { name: p?.scaleGroup ?? projectName ?? 'Ad', path: p!.clip! };
        }),
      );
      return;
    }
    const need = new Set<string>();
    for (const e of missing) ancestorsInto(e.id, need, liveRef.current.edges);
    const sub = ns.filter((n) => need.has(n.id));
    // only subtitles (Whisper) / bg-remove / voice cost credits on export; concat & text are local
    const subCount = sub.filter((n) => (n.data as StepNodeData).kind === 'subtitles').length;
    const bgCount = sub.filter((n) => (n.data as StepNodeData).kind === 'bg-remove').length;
    const ttsCount = sub.filter((n) => (n.data as StepNodeData).kind === 'voice').length;
    const run = () => {
      setExportResults(null);
      launchRun(sub, true);
    };
    if (subCount + bgCount + ttsCount === 0) {
      run(); // nothing billable to recompute — just stitch & export
      return;
    }
    setCostPrompt({
      title: `Export ${missing.length} ${missing.length === 1 ? 'pipeline' : 'pipelines'}`,
      confirmLabel: 'Export',
      note: 'Stitching & text are free; only transcription/bg-removal/voice have a cost.',
      lines: [
        costLine('Subtitles', subCount, 'subtitles'),
        costLine('Background removal', bgCount, 'bgRemove'),
        costLine('Voice', ttsCount, 'tts'),
      ],
      onConfirm: run,
    });
  }, [launchRun, projectName]);

  // Phase 2: render all approved first frames to video (limited concurrency), each onto its swap
  // node. Close the popup so the swaps populate on the canvas, then — once every input is ready —
  // automatically run the NEW pipelines through to their exports (finished/reference rows untouched).
  const runScaleVideos = useCallback(() => {
    const live = scaleReview;
    if (!live) return;
    const approved = live.frames.filter((f) => f.approved && f.status === 'done' && f.image);
    if (!approved.length) return;
    const pip = approved.filter((f) => f.crop).length;
    const motion = approved.length - pip;

    const doRender = async () => {
      setScaleReview(null); // close the popup → reveal the canvas as swaps render onto their nodes
      const queue = [...approved];
      const worker = async () => {
        while (queue.length) {
          const f = queue.shift()!;
          await runVideoSwap(f.partId, f.image!, f.crop);
        }
      };
      await Promise.all([worker(), worker()]); // 2 Kling jobs at a time
      setScaling(false);
      // all inputs are ready → auto-advance ONLY the just-added pipelines through to their exports
      await new Promise((r) => setTimeout(r, 150)); // let the swap nodes commit to liveRef
      const newIds = scaleNewIdsRef.current;
      launchRun(liveRef.current.nodes.filter((n) => newIds.has(n.id)), false);
    };

    // cost gate — Kling swaps are the largest spend
    setCostPrompt({
      title: `Render ${approved.length} ${approved.length === 1 ? 'swap' : 'swaps'}`,
      confirmLabel: 'Render',
      note: 'Kling motion-control. Downstream steps (subtitles, etc.) run automatically after.',
      lines: [
        costLine('Motion swaps', motion, 'motionSwap'),
        costLine('PiP swaps', pip, 'pipSwap'),
      ],
      onConfirm: () => void doRender(),
    });
  }, [scaleReview, runVideoSwap, launchRun]);

  // Scale: duplicate the whole pipeline once per selected model (stacked below as its own row),
  // tagged with the model, swap outputs cleared. Then batch-generate every first frame for review.
  const scaleAcross = useCallback(
    async (models: { id: string; name: string; imagePath: string | null; voiceId?: string }[]) => {
      const allNodes = liveRef.current.nodes;
      const es = liveRef.current.edges;
      if (!allNodes.length || !models.length) return;
      // The ORIGINAL hand-built pipeline is the permanent reference template: scaled rows are
      // tagged with scaleGroup, so the reference = everything WITHOUT that tag. Scaling again
      // always clones the reference, never a previously-scaled row.
      const ns = allNodes.filter((n) => n.type === 'step' && !(n.data as StepNodeData).params?.scaleGroup);
      const refIds = new Set(ns.map((n) => n.id));
      const refEdges = es.filter((e) => refIds.has(e.source) && refIds.has(e.target));
      const kindOf = (id: string) =>
        (ns.find((n) => n.id === id)?.data as StepNodeData | undefined)?.kind;
      // the "places applied" = reference parts that feed a swap-output
      const swapSiteIds = new Set(
        ns
          .filter((n) => refEdges.some((e) => e.source === n.id && kindOf(e.target) === 'swap-output'))
          .map((n) => n.id),
      );
      if (!swapSiteIds.size) {
        setError('Apply motion control on at least one part first — Scale replicates those swaps across the chosen models.');
        return;
      }

      // place each new row below ALL existing step nodes (so re-scaling doesn't overlap prior rows)
      const stepNodes = allNodes.filter((n) => n.type === 'step');
      const refMinY = Math.min(...ns.map((n) => n.position.y));
      const refHeight = Math.max(...ns.map((n) => n.position.y)) - refMinY + NODE_H;
      const allMaxY = Math.max(...stepNodes.map((n) => n.position.y)) + NODE_H;
      const gap = 240;

      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      const newFrames: Node[] = [];
      const frames: ScaleFrame[] = [];
      const stamp = Date.now().toString(36);
      const makeFrame = (id: string, label: string, b: { x: number; y: number; w: number; h: number }, locked: boolean, accent: string): Node => ({
        id, type: 'frame',
        position: { x: b.x, y: b.y },
        data: { label, locked, accent },
        style: { width: b.w, height: b.h, pointerEvents: 'none' }, // never block canvas clicks
        selectable: false, draggable: false, deletable: false, connectable: false,
        zIndex: -1,
      });
      // reference frame (locked) — created once, on the first scale
      if (!allNodes.some((n) => n.id === 'frame-reference')) {
        newFrames.push(makeFrame('frame-reference', 'Reference pipeline', boundsOf(ns), true, '#f5b14c'));
      }
      models.forEach((m, mi) => {
        const idMap: Record<string, string> = {};
        ns.forEach((n) => (idMap[n.id] = `${n.id}__s${mi}${stamp}`));
        const rowTop = allMaxY + gap + mi * (refHeight + gap);
        const dy = rowTop - refMinY; // shift this reference copy down to its row
        const rowNodes: Node[] = [];
        ns.forEach((n) => {
          const d = n.data as StepNodeData;
          const params = { ...(d.params ?? {}) };
          params.scaleGroup = m.name; // names the Export-all output meaningfully
          // transform/post nodes carry a cached output baked from the ORIGINAL model — drop it so
          // every further step (subtitles, text, sequence, export…) recomputes on the swapped clip.
          // Their config params (texts, style, font…) are kept so the recompute is faithful.
          if (SCALE_RECOMPUTE_KINDS.has(d.kind)) delete params.clip;
          const node: Node = {
            id: idMap[n.id],
            type: 'step',
            position: { x: n.position.x, y: n.position.y + dy },
            data: { ...d, status: undefined, params } as StepNodeData,
            selected: false,
          };
          newNodes.push(node);
          rowNodes.push(node);
          if (swapSiteIds.has(n.id) && params.clip && m.imagePath) {
            frames.push({
              taskId: idMap[n.id],
              partId: idMap[n.id],
              persona: m.imagePath,
              personaName: m.name,
              partLabel: d.title ?? d.kind,
              clip: params.clip,
              crop: safeBox(params.cropBox) ?? undefined, // PiP parts reuse the stored crop box
              status: 'pending',
              approved: true,
            });
          }
        });
        refEdges.forEach((e) => {
          if (idMap[e.source] && idMap[e.target])
            newEdges.push({ id: `${e.id}__s${mi}`, source: idMap[e.source], target: idMap[e.target] });
        });
        // per-model voice change: override the row's Voice node, or inject one if the
        // reference pipeline has none (auto-transcribes the swapped clip's speech).
        if (m.voiceId) {
          const rowVoice = rowNodes.find((n) => (n.data as StepNodeData).kind === 'voice');
          if (rowVoice) {
            const d = rowVoice.data as StepNodeData;
            d.params = { ...(d.params ?? {}), voiceId: m.voiceId };
          } else {
            const exportNode = rowNodes.find((n) => (n.data as StepNodeData).kind === 'export');
            const seqNode = rowNodes.find((n) => (n.data as StepNodeData).kind === 'sequence');
            const voiceId = `voice-${stamp}-${mi}`;
            const voiceData = {
              kind: 'voice',
              title: 'Voice',
              params: { scaleGroup: m.name, voiceId: m.voiceId },
            } as StepNodeData;
            if (exportNode) {
              // splice: <source> → Voice → Export
              const inIdx = newEdges.findIndex((e) => e.target === exportNode.id);
              const srcId = inIdx >= 0 ? newEdges[inIdx].source : null;
              const srcNode = srcId ? rowNodes.find((n) => n.id === srcId) : null;
              const vNode: Node = {
                id: voiceId, type: 'step', selected: false,
                position: {
                  x: srcNode ? (srcNode.position.x + exportNode.position.x) / 2 : exportNode.position.x - 320,
                  y: exportNode.position.y + NODE_H + 60,
                },
                data: voiceData,
              };
              newNodes.push(vNode);
              rowNodes.push(vNode);
              if (inIdx >= 0) {
                const inEdge = newEdges[inIdx];
                newEdges.splice(inIdx, 1);
                newEdges.push({ id: `${inEdge.id}-v`, source: inEdge.source, target: voiceId });
              }
              newEdges.push({ id: `e-${voiceId}-out`, source: voiceId, target: exportNode.id });
            } else if (seqNode) {
              // no export in the reference — hang the Voice step off the sequence output
              const vNode: Node = {
                id: voiceId, type: 'step', selected: false,
                position: { x: seqNode.position.x + 340, y: seqNode.position.y },
                data: voiceData,
              };
              newNodes.push(vNode);
              rowNodes.push(vNode);
              newEdges.push({ id: `e-${voiceId}-in`, source: seqNode.id, target: voiceId });
            }
          }
        }
        // labeled boundary around this model's row
        newFrames.push(makeFrame(`frame-${stamp}-${mi}`, m.name, boundsOf(rowNodes), false, '#8b7bf7'));
      });
      // estimate first-frame generations: hook + a-roll share an anchor, PiP parts generate their own
      const byModelCount = new Map<string, ScaleFrame[]>();
      for (const f of frames) {
        if (!byModelCount.has(f.persona)) byModelCount.set(f.persona, []);
        byModelCount.get(f.persona)!.push(f);
      }
      let firstFrameGen = 0;
      for (const group of byModelCount.values()) {
        const pip = group.filter((f) => f.crop).length;
        firstFrameGen += group.some((f) => !f.crop) ? 1 + pip : pip; // anchor (1) + each PiP
      }

      const build = () => {
        snapshot();
        // frames first (rendered behind); LOCK the reference step nodes so the template stays intact
        setNodes((nds) => [
          ...newFrames,
          ...nds.map((n) =>
            refIds.has(n.id)
              ? { ...n, selected: false, draggable: false, deletable: false, connectable: false }
              : { ...n, selected: false },
          ),
          ...newNodes,
        ]);
        setEdges((eds) => [...eds, ...newEdges]);
        // remember exactly which step nodes this scale added, so auto-advance/export only touch them
        scaleNewIdsRef.current = new Set(newNodes.map((n) => n.id));
        setScaling(true);
        setScaleReview({ phase: 'frames', frames, videoDone: 0 });
        void generateScaleFrames(frames);
      };

      // cost gate — first frames now; the (much larger) swap cost is confirmed at render time
      setCostPrompt({
        title: `Scale across ${models.length} ${models.length === 1 ? 'model' : 'models'}`,
        confirmLabel: 'Generate first frames',
        note: 'First frames only. Motion-control swaps — the larger cost — are confirmed when you render.',
        lines: [costLine('First frames', firstFrameGen, 'firstFrame')],
        onConfirm: build,
      });
    },
    [snapshot, setNodes, setEdges, generateScaleFrames],
  );

  const closeScaleReview = useCallback(() => {
    setScaleReview(null);
    setScaling(false);
  }, []);

  // per-node live "Apply" (currently: Subtitles). Reads the input clip from the wired-in source.
  const applyNode = useCallback(
    async (nodeId: string) => {
      const ns = liveRef.current.nodes;
      const es = liveRef.current.edges;
      const node = ns.find((n) => n.id === nodeId);
      const kind = (node?.data as StepNodeData | undefined)?.kind;
      const inEdge = es.find((e) => e.target === nodeId);
      const srcData = inEdge && (ns.find((n) => n.id === inEdge.source)?.data as StepNodeData | undefined);
      const inClip = srcData?.params?.swapped || srcData?.params?.clip;

      if (kind === 'text') {
        if (!inClip) {
          setError('Connect a video into the Text node first.');
          return;
        }
        let saved: TextItem[] = [];
        try {
          saved = JSON.parse((node?.data as StepNodeData | undefined)?.params?.texts ?? '[]');
        } catch {
          /* none yet */
        }
        setError(null);
        setTextEditor({ nodeId, video: inClip, items: Array.isArray(saved) ? saved : [] });
        return;
      }

      if (kind === 'asset') {
        if (!inClip) {
          setError('Connect a video into the Asset node first.');
          return;
        }
        let saved: AssetItem[] = [];
        try {
          saved = JSON.parse((node?.data as StepNodeData | undefined)?.params?.assets ?? '[]');
        } catch {
          /* none yet */
        }
        setError(null);
        setAssetEditor({ nodeId, video: inClip, items: Array.isArray(saved) ? saved : [] });
        return;
      }

      if (kind === 'subtitles') {
        if (!inClip) {
          setError('Connect a video into the Subtitles node first.');
          return;
        }
        // open the subtitles editor (style/font/size/stroke/position) — Apply runs the burn
        let cfg = DEFAULT_SUB_CONFIG;
        try {
          const saved = (node?.data as StepNodeData | undefined)?.params?.subConfig;
          if (saved) cfg = { ...DEFAULT_SUB_CONFIG, ...JSON.parse(saved) };
        } catch { /* default */ }
        setError(null);
        setSubtitlesEditor({ nodeId, video: inClip, cfg });
        return;
      }

      if (kind === 'voice') {
        if (!inClip) {
          setError('Connect a video into the Voice node first.');
          return;
        }
        const params = (node?.data as StepNodeData | undefined)?.params;
        setError(null);
        setVoiceEditor({ nodeId, video: inClip, voiceId: params?.voiceId ?? null });
        return;
      }
    },
    [setNodes, setNodeStatus],
  );

  // Voice editor "Apply" → TTS the script with the chosen/designed voice, mute the original audio
  const applyVoiceEditor = useCallback(
    async (payload: VoiceApplyPayload) => {
      const ctx = voiceEditor;
      if (!ctx) return;
      setVoiceBusy(true);
      setNodeStatus(ctx.nodeId, 'processing');
      try {
        const res = await fetch('/api/voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video: ctx.video, ...payload }),
        });
        const d = await res.json();
        if (res.ok && d.clip) {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === ctx.nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      status: 'completed',
                      params: {
                        ...((n.data as StepNodeData).params ?? {}),
                        clip: d.clip,
                        ...(d.voiceId ? { voiceId: d.voiceId } : {}),
                        ...(payload.voiceName ? { voiceName: payload.voiceName } : {}),
                      },
                    },
                  }
                : n,
            ),
          );
          setVoiceEditor(null);
        } else {
          setNodeStatus(ctx.nodeId, 'failed');
          setError(d.error ? `Voice failed — ${d.error}` : 'Voice apply failed.');
        }
      } catch {
        setNodeStatus(ctx.nodeId, 'failed');
        setError('Voice apply failed.');
      } finally {
        setVoiceBusy(false);
      }
    },
    [voiceEditor, setNodes, setNodeStatus],
  );

  // Text editor "Apply" → burn the text/emoji items onto the input clip
  const applyText = useCallback(
    async (texts: TextItem[]) => {
      const ctx = textEditor;
      if (!ctx) return;
      setTextBusy(true);
      setNodeStatus(ctx.nodeId, 'processing');
      try {
        const res = await fetch('/api/text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video: ctx.video, items: texts }),
        });
        const d = await res.json();
        if (res.ok && d.clip) {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === ctx.nodeId
                ? { ...n, data: { ...n.data, status: 'completed', params: { ...((n.data as StepNodeData).params ?? {}), clip: d.clip, texts: JSON.stringify(texts) } } }
                : n,
            ),
          );
          setTextEditor(null);
        } else {
          setNodeStatus(ctx.nodeId, 'failed');
          setError(d.error ? `Text failed — ${d.error}` : 'Text overlay failed.');
        }
      } catch {
        setNodeStatus(ctx.nodeId, 'failed');
        setError('Text overlay failed.');
      } finally {
        setTextBusy(false);
      }
    },
    [textEditor, setNodes, setNodeStatus],
  );

  // Asset editor "Apply" → burn the image/gif/video overlays onto the input clip
  const applyAsset = useCallback(
    async (assets: AssetItem[]) => {
      const ctx = assetEditor;
      if (!ctx) return;
      setAssetBusy(true);
      setNodeStatus(ctx.nodeId, 'processing');
      try {
        const items = assets.map(({ path, kind, x, y, w, h, startSec, endSec, cropX, cropY, cropW, cropH, trimStart, trimEnd, muted }) =>
          ({ path, kind, x, y, w, h, startSec, endSec, cropX, cropY, cropW, cropH, trimStart, trimEnd, muted }));
        const res = await fetch('/api/asset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video: ctx.video, items }),
        });
        const d = await res.json();
        if (res.ok && d.clip) {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === ctx.nodeId
                ? { ...n, data: { ...n.data, status: 'completed', params: { ...((n.data as StepNodeData).params ?? {}), clip: d.clip, assets: JSON.stringify(assets) } } }
                : n,
            ),
          );
          setAssetEditor(null);
        } else {
          setNodeStatus(ctx.nodeId, 'failed');
          setError(d.error ? `Asset failed — ${d.error}` : 'Asset overlay failed.');
        }
      } catch {
        setNodeStatus(ctx.nodeId, 'failed');
        setError('Asset overlay failed.');
      } finally {
        setAssetBusy(false);
      }
    },
    [assetEditor, setNodes, setNodeStatus],
  );

  // Subtitles editor "Apply" → transcribe + burn captions with the chosen style/stroke/position
  const applySubtitlesEditor = useCallback(
    async (cfg: SubtitleConfig) => {
      const ctx = subtitlesEditor;
      if (!ctx) return;
      setSubtitlesBusy(true);
      setNodeStatus(ctx.nodeId, 'processing');
      try {
        const res = await fetch('/api/subtitles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            video: ctx.video,
            style: cfg.style, font: cfg.font,
            fontSizePx: cfg.fontSize,
            stroke: cfg.stroke, strokeWidth: cfg.strokeWidth, strokeColor: cfg.strokeColor,
            position: cfg.position === 'custom' ? undefined : cfg.position,
            ...(cfg.position === 'custom' ? { customX: cfg.customX * 100, customY: cfg.customY * 100 } : {}),
          }),
        });
        const d = await res.json();
        if (res.ok && d.clip) {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === ctx.nodeId
                ? { ...n, data: { ...n.data, status: 'completed', params: { ...((n.data as StepNodeData).params ?? {}), clip: d.clip, subConfig: JSON.stringify(cfg), style: cfg.style, font: cfg.font } } }
                : n,
            ),
          );
          setSubtitlesEditor(null);
        } else {
          setNodeStatus(ctx.nodeId, 'failed');
          setError(d.error ? `Subtitles failed — ${d.error}` : 'Subtitles failed.');
        }
      } catch {
        setNodeStatus(ctx.nodeId, 'failed');
        setError('Subtitles failed.');
      } finally {
        setSubtitlesBusy(false);
      }
    },
    [subtitlesEditor, setNodes, setNodeStatus],
  );

  // --- cursor: arrow by default, grab while Space is held (Figma-style pan) ---
  const [spacePan, setSpacePan] = useState(false);
  useEffect(() => {
    const isTyping = (el: EventTarget | null) =>
      el instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e.target)) {
        e.preventDefault();
        setSpacePan(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePan(false);
    };
    const blur = () => setSpacePan(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // --- load this project's saved pipeline (local store); empty canvas if none ---
  useEffect(() => {
    if (projectId) {
      const p = projectsStore.get(projectId);
      if (!p) return;
      setProjectName(p.name);
      const g = p.graph;
      if (g && Array.isArray(g.nodes)) {
        setNodes((g.nodes as Node[]).map((n) => ({ ...n, data: { ...n.data, status: undefined } })));
        if (Array.isArray(g.edges)) setEdges(g.edges as Edge[]);
      }
      return;
    }
    // standalone canvas: restore last session if present
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const g = JSON.parse(raw) as { nodes?: Node[]; edges?: Edge[] };
      if (Array.isArray(g.nodes)) setNodes(g.nodes.map((n) => ({ ...n, data: { ...n.data, status: undefined } })));
      if (Array.isArray(g.edges)) setEdges(g.edges);
    } catch {
      /* ignore */
    }
  }, [projectId, setNodes, setEdges]);

  const onSave = useCallback(() => {
    dirty.current = true;
    const clean = nodes.map((n) => ({ ...n, data: { ...n.data, status: undefined } }));
    if (projectId) {
      projectsStore.update(projectId, { graph: { nodes: clean, edges } });
    } else {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes: clean, edges }));
      } catch {
        /* ignore */
      }
    }
  }, [nodes, edges, projectId]);

  const onRename = useCallback(
    (name: string) => {
      dirty.current = true;
      setProjectName(name);
      if (projectId) projectsStore.update(projectId, { name });
    },
    [projectId],
  );

  // On close: persist if the user touched the canvas; if an untouched, never-saved
  // project is left empty, discard it so it doesn't clutter the projects list.
  // (timer-guarded so React StrictMode's dev remount doesn't trigger it.)
  useEffect(() => {
    if (cleanupTimer.current) {
      clearTimeout(cleanupTimer.current);
      cleanupTimer.current = null;
    }
    return () => {
      cleanupTimer.current = setTimeout(() => {
        const { nodes: ns, edges: es } = liveRef.current;
        const clean = ns.map((n) => ({ ...n, data: { ...n.data, status: undefined } }));
        if (projectId) {
          if (dirty.current) {
            projectsStore.update(projectId, { graph: { nodes: clean, edges: es } });
          } else {
            const p = projectsStore.get(projectId);
            const hasGraph = !!(p?.graph && Array.isArray(p.graph.nodes) && p.graph.nodes.length);
            const hasOutputs = !!(p?.outputs && p.outputs.length);
            if (p && !hasGraph && !hasOutputs) projectsStore.remove(projectId);
          }
        } else if (dirty.current) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes: clean, edges: es }));
          } catch {
            /* ignore */
          }
        }
      }, 0);
    };
  }, [projectId]);

  return (
    <StudioActionsContext.Provider value={{ onGenerate: onRun, running, onApply: applyNode }}>
    <div className={`studio-canvas relative h-full w-full${spacePan ? ' space-pan' : ''}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChangeH}
        onEdgesChange={onEdgesChangeH}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDragStart={() => snapshot()}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={() => {
          setSelectedId(null);
          setMenu(null);
        }}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.3}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
        onlyRenderVisibleElements // only mount on-screen nodes — essential at 100s of pipelines
        // click an edge to select it, Backspace/Delete to remove it; wide hit area so thin wires are easy to click
        defaultEdgeOptions={{ type: 'default', interactionWidth: 24 }}
        deleteKeyCode={['Backspace', 'Delete']}
        connectOnClick // click a port → wire follows the cursor → click another port to connect
        edgesFocusable
        elementsSelectable
        // arrow by default; hold Space to grab/pan; pinch to zoom; 2-finger scroll to pan
        panOnDrag={false}
        panActivationKeyCode="Space"
        selectionOnDrag
        panOnScroll
        panOnScrollSpeed={1.6}
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>

      <Topbar
        onSave={onSave}
        projectName={projectName}
        onRename={onRename}
        onScale={() => setScaleOpen(true)}
        onExportAll={onExportAll}
        exporting={exporting}
        scaling={scaling}
        swapModelName={swapModel?.name ?? null}
        swapModelImage={swapModel?.imagePath ?? null}
        onPickSwapModel={() => setSwapPickerOpen(true)}
        referenceSet={Boolean(swapReference)}
        onResetReference={() => setSwapReference(null)}
      />
      <LeftToolbar onAddNode={onAddNode} />
      {selectedNode && (
        <Inspector
          node={selectedNode}
          onUpdateParam={updateParam}
          onSetNodeData={setNodeData}
          onSetStatus={setNodeStatus}
          onAddNode={onAddNode}
          onTrim={openTrim}
          onApplyMotion={applyPartSwap}
          swapModelName={swapModel?.name ?? null}
          onClose={() => setSelectedId(null)}
        />
      )}
      <OutputPanel
        running={running}
        resultUrl={resultUrl}
        error={error}
        onClose={() => {
          setResultUrl(null);
          setError(null);
        }}
      />
      {menu && (
        <NodeContextMenu
          menu={menu}
          canTrim={Boolean((nodes.find((n) => n.id === menu.nodeId)?.data as StepNodeData | undefined)?.params?.clip)}
          onDuplicate={duplicateNode}
          onDelete={deleteNode}
          onDetails={showDetails}
          onTrim={openTrim}
        />
      )}
      {scaleOpen && (
        <ScalePanel
          usedModels={new Set(
            nodes
              .map((n) => (n.data as StepNodeData).params?.scaleGroup)
              .filter((g): g is string => Boolean(g)),
          )}
          perPipelineUSD={usdPerPipeline}
          onScale={(models) => void scaleAcross(models)}
          onClose={() => setScaleOpen(false)}
        />
      )}
      {scaleReview && (
        <ScaleReviewPanel
          review={scaleReview}
          onToggle={toggleScaleFrame}
          onRegenerate={regenScaleFrame}
          onGenerateVideos={() => void runScaleVideos()}
          onClose={closeScaleReview}
        />
      )}
      {exportResults && (
        <ExportResultsPanel results={exportResults} projectName={projectName} onClose={() => setExportResults(null)} />
      )}
      {costPrompt && <CostConfirmModal prompt={costPrompt} onClose={() => setCostPrompt(null)} />}
      {trimNode && (trimNode.data as StepNodeData).params?.clip && (() => {
        const p = (trimNode.data as StepNodeData).params!;
        // AI-cut segment → show the FULL source with handles at the cut range; else the clip itself
        const useSrc = Boolean(p.srcClip);
        const srcIn = useSrc ? parseFloat(p.srcStart ?? '0') : undefined;
        const srcOut = useSrc ? parseFloat(p.srcEnd ?? '0') : undefined;
        return (
          <TrimSplitModal
            src={`/api/serve/${useSrc ? p.srcClip : p.clip}`}
            title={(trimNode.data as StepNodeData).title ?? NODE_DEFS[(trimNode.data as StepNodeData).kind].label}
            busy={trimBusy}
            onClip={onClipNode}
            onSplit={onSplitNode}
            onClose={() => !trimBusy && setTrimNodeId(null)}
            initialIn={srcIn}
            initialOut={srcOut}
          />
        );
      })()}
      {swapPickerOpen && (
        <ModelPickerModal onPick={onPickModel} onClose={() => setSwapPickerOpen(false)} />
      )}
      {textEditor && (
        <TextEditorModal
          src={`/api/serve/${textEditor.video}`}
          initial={textEditor.items}
          busy={textBusy}
          onApply={applyText}
          onClose={() => !textBusy && setTextEditor(null)}
        />
      )}
      {assetEditor && (
        <AssetEditorModal
          src={`/api/serve/${assetEditor.video}`}
          initial={assetEditor.items}
          busy={assetBusy}
          onApply={applyAsset}
          onClose={() => !assetBusy && setAssetEditor(null)}
        />
      )}
      {voiceEditor && (
        <VoiceEditorModal
          src={`/api/serve/${voiceEditor.video}`}
          initialVoiceId={voiceEditor.voiceId}
          busy={voiceBusy}
          onApply={applyVoiceEditor}
          onClose={() => !voiceBusy && setVoiceEditor(null)}
        />
      )}
      {subtitlesEditor && (
        <SubtitlesEditorModal
          src={`/api/serve/${subtitlesEditor.video}`}
          initial={subtitlesEditor.cfg}
          busy={subtitlesBusy}
          onApply={applySubtitlesEditor}
          onClose={() => !subtitlesBusy && setSubtitlesEditor(null)}
        />
      )}
      {swapCrop && swapCropFor && (
        <CropVerifyModal
          src={swapCrop.frame ? `/api/serve/${swapCrop.frame}` : null}
          initial={swapCrop.box}
          busy={false}
          onConfirm={confirmSwapCrop}
          onClose={closeSwapCrop}
          onAutoDetect={autoDetectSwapCrop}
        />
      )}
      {firstFrameFor && (() => {
        // the original clip being swapped (reference video's part) — shown for comparison
        const orig = (nodes.find((n) => n.id === firstFrameFor)?.data as StepNodeData | undefined)?.params?.clip;
        return (
          <FirstFrameModal
            src={firstFrameSrc ? `/api/serve/${firstFrameSrc}` : null}
            compareSrc={orig ? `/api/serve/${orig}` : null}
            stage={ffStage}
            onApprove={approveFirstFrame}
            onRegenerate={regenerateFirstFrame}
            onClose={closeFirstFrame}
          />
        );
      })()}
    </div>
    </StudioActionsContext.Provider>
  );
}

export function StudioCanvas({ projectId }: { projectId?: string }) {
  return (
    <ReactFlowProvider>
      <Inner projectId={projectId} />
    </ReactFlowProvider>
  );
}
