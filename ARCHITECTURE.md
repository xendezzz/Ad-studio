# Ad-Studio Architecture

Ad-Studio clones and re-skins UGC video ads: ingest a reference ad, swap in a synthetic persona (face + voice), re-composite it, then **scale** the same ad across many personas. It is a single Next.js app — a node-graph editor on the front, an ffmpeg + AI-services pipeline on the back.

> An interactive version of the API map below lives at [`docs/api-map.html`](docs/api-map.html) — open it in a browser to trace which routes call which services.

```
┌─────────────────────────  Browser  ─────────────────────────┐
│  ProjectsLanding · ModelsPage · library pages                │
│  StudioCanvas (React Flow node editor)                       │
│    graph state in localStorage (projectsStore)               │
└───────────────┬─────────────────────────────────────────────┘
                │ fetch /api/*  (poll /api/run/[id] every ~1.5s)
┌───────────────▼─────────────  Next.js server  ──────────────┐
│  ~40 API routes (app/api/*)                                  │
│  runPipeline: topo-sort graph → execute nodes → upload       │
│  ffmpeg/ffprobe (static binaries, execFileSync)              │
└──┬──────────┬───────────┬──────────┬──────────┬─────────────┘
   │          │           │          │          │
 Supabase   fal.ai    Anthropic  ElevenLabs  Meta Ad Library
 (Postgres  (Kling,   (Claude     (voice      (playwright
 + Storage) Whisper,   vision)     design/STS)  scraping)
            BEN2,
            Demucs,
            image gen)
```

## Tech stack

- **Next.js 16** (App Router, Turbopack) + **React 19**, Tailwind 4
- **@xyflow/react** (React Flow) for the node-graph canvas
- **Supabase**: Postgres (via PostgREST + service-role key) and one private Storage bucket (`ad-assets`)
- **Drizzle ORM** for schema definition / migrations only (`db:push`); runtime reads/writes go through the Supabase JS client
- **ffmpeg-static / @ffprobe-installer** — all media ops run locally and synchronously (`execFileSync`)
- **sharp** — text-overlay PNG rendering, thumbnails, image normalization
- **playwright-core** — headless Chrome for Meta Ad Library scraping
- AI: **fal.ai** (primary), **Anthropic Claude**, **ElevenLabs**, **Higgsfield** (optional)

## Repository layout

| Path | What lives there |
|---|---|
| `app/` | App Router pages (`/`, `/project/[id]`, `/models`, library pages, `/login`) |
| `app/api/` | ~40 route handlers — the entire backend |
| `components/studio/` | StudioCanvas + Inspector + node components + ~15 modals |
| `components/projects/`, `components/models/` | Projects landing, Models library |
| `lib/` | Everything server-side: pipeline engine, ffmpeg ops, AI clients, stores, auth, config |
| `types/` | Shared types (compose configs etc.) |
| `supabase/` | Raw SQL mirrors of the schema (paste into Supabase SQL editor) |

---

## 1. The node-graph pipeline (core domain model)

`lib/pipeline.ts` is the single source of truth for node kinds. Categories: **source → segment → generate → compose → post → output**.

- **Sources**: `reference-ad`, `combined-clip`, `model` (persona + tied voice), `app-demo`, `music`, `hook` (hidden)
- **Segments** (auto-spawned from a combined clip): `cc-hook`, `cc-pip`, `cc-aroll`, `cc-broll`, `cc-cta`
- **Generate**: `bg-remove`, `voice`; `motion-control`/`swap-output` are hidden kinds — swapping happens per-part from the UI and the result lands on an auto-created `swap-output` node
- **Compose**: `combine` (PiP composite), `sequence` (join clips top→bottom), `transition` (a *marker* node — it outputs `{transition}` instead of video and turns the next join into an xfade)
- **Post**: `text`, `asset`, `subtitles`, `music-mix`, `end-card` (hidden, superseded by `cc-cta`)
- **Output**: `export` (with a Quality param: Source/High/Standard/Compressed → x264 CRF re-encode)

Per-kind editable params are declared in `lib/nodeParams.ts` (`PARAM_SCHEMAS`) — all params are strings; structured data (text overlays, assets, subtitle config) is JSON-encoded inside a param string.

### Run execution (`lib/runPipeline.ts`)

`POST /api/run` creates a `pipeline_runs` row and kicks off `runPipeline` in the background using Next's `after()` — the response returns `{ runId }` immediately; there are no websockets, the client polls `GET /api/run/[id]`.

1. A temp workspace is created under `os.tmpdir()` (stale artifacts >6h are pruned lazily).
2. Nodes are **topologically sorted** (Kahn's algorithm) and executed **strictly sequentially**.
3. A node's inputs are the outputs of its incoming edges, **sorted by canvas Y position** — Y-ordering is what determines concat/sequence order. Edges carry no port info.
4. Every node gets a `gen_jobs` row (`processing → completed/failed`) keyed by canvas `nodeId`, which is how the UI shows per-node live status and previews.
5. Media nodes download inputs from Storage into the workspace, run ffmpeg, and upload results back (`NodeOutput = { videoPath? | imagePath? | audioPath? | transition? }` — always Storage paths, never local ones, between nodes).
6. The last `export`/`sequence` output in topo order becomes the final ad → an `ads` row; the run flips to `completed`. `GET /api/run/[id]` signs the final path into a 1-hour URL.

### The ffmpeg layer

- `lib/ffmpegBinaries.ts` resolves the static binaries (chmod + tmp-copy fallbacks).
- `lib/ffmpegMediaOps.ts` — primitives: `concatVideos` (normalizes to first clip's WxH/30fps, injects silent audio), `xfadeVideos` (+ `acrossfade`), `mixAudio` (music bed), `stripAudio`, `encodeQuality` (CRF/preset).
- `lib/ffmpegTextOverlay.ts` — text is **not** drawn with ffmpeg `drawtext`: styled text renders to a transparent PNG via sharp/Pango (720px design-width scaled to the real resolution, 15+ styles, CJK fallback), then a single `overlay` filter burns it, optionally timed with `enable='between(...)'`.
- Higher-level "burn" modules are shared between the live editor endpoints and pipeline re-burns: `lib/textBurn.ts` (text + Twemoji emoji), `lib/assetBurn.ts` (timed image/gif/video overlays in one `filter_complex`), `lib/subtitlesBurn.ts` (Whisper words → 3-word groups → timed overlays).
- `lib/ffmpegCompose.ts` is a generic z-ordered multi-layer compositor; PiP in the pipeline uses its own inline `composePiP` (note: alpha webm decode requires an explicit `-c:v libvpx-vp9` *before* the input or the alpha channel silently drops).

---

## 2. Frontend

### Pages

- `/` → **ProjectsLanding** — project grid (localStorage-backed), hover-play previews, new/duplicate/rename/delete.
- `/project/[id]` → **StudioCanvas** — the editor, full screen.
- `/models` → **ModelsPage** — persona library grouped by category; generate a persona (fal image models / Higgsfield Soul) or upload one. Category is encoded in the model's description field (`gen:<cat>` vs `<cat>`).
- `/hooks`, `/app-demos`, `/b-rolls`, `/audios`, `/clips` — asset library pages; `/login` — OTP login.

### StudioCanvas (`components/studio/StudioCanvas.tsx`, ~2200 lines)

React Flow with Figma-style controls (space-to-pan, selection drag, pinch zoom, `onlyRenderVisibleElements`). Two node types: `step` (pipeline nodes) and `frame` (visual-only boundary rectangles used by the Scale flow, excluded from runs). Undo/redo history (capped 60), Cmd+C/V/D clipboard.

**Persistence is local-first**: the graph lives in `localStorage` via `lib/projectsStore.ts` — saved on the explicit Save button, on rename, and on unmount if dirty. There is *also* a server `projects` table + `/api/projects` routes, but the canvas currently reads/writes localStorage. Generated media always lives in Supabase Storage, served through `/api/serve/<path>` (307 → signed URL) and `/api/thumb/<path>` (sharp WebP, 1-year cache).

**Run loop**: `onRun` serializes step nodes (+ Y positions) and edges → `POST /api/run` → polls every ~1.5s, patching per-node status badges and live output previews from `nodeOutputs`. A `runScopeRef` scopes polling so parallel/finished pipelines aren't disturbed.

**Inspector** (`Inspector.tsx`) — floating panel anchored to the selected node; renders `PARAM_SCHEMAS[kind]` fields (select/text/upload + library pickers), the Apply-Motion-Control CTA, Trim/Split, and (for reference ads) the AnalyzePanel with cost estimate, Claude/FAL engine choice, and free manual cutting (`ManualCutModal`).

**Editors** open from node-body buttons via a small `StudioActionsContext`: TextEditorModal, AssetEditorModal, SubtitlesEditorModal, VoiceEditorModal — each posts to its `/api/*` endpoint and replaces the node's clip. `CostConfirmModal` gates every billable step.

### The model-swap flow (UI ↔ API)

1. Pick one global persona in the Topbar (**ModelPickerModal**) → `swapModel`.
2. Per part, "Apply Motion Control":
   - **PiP parts**: frame extract → **CropVerifyModal** (auto-detect via Claude vision, manual adjust) → the creator-inset box.
   - `POST /api/motion-control/first-frame` → **FirstFrameModal**: approve/regenerate the persona-swapped still. The first approved still becomes `swapReference`, reused for later parts so the character keeps consistent clothes/identity.
   - Approve → the modal closes immediately and the video swap runs in the background (`/api/motion-control` or `/api/motion-control/pip`).
3. The swapped clip lands on an auto-created `swap-output` node, and downstream edges are re-pointed through it (`spliceSwapIntoChain`), so the swap — not the original — reaches sequence/export.

### The Scale flow

- **ScalePanel**: pick N models (with optional per-model voice change), see total cost, confirm.
- `scaleAcross`: the hand-built pipeline (nodes without a `scaleGroup` param) is the permanent **reference template**. For each model it deep-clones the template into a stacked row below, tags nodes with `scaleGroup = model.name`, clears cached clips on recompute-kinds, draws boundary frames, and optionally injects a Voice node.
- First frames generate 3 ads concurrently, with an **anchor frame** per ad reused across its parts. **ScaleReviewPanel** shows the frame grid (approve/exclude/regenerate), then renders videos 2-at-a-time and auto-advances each new pipeline to its export.

---

## 3. Backend: data, storage, auth

### Database (Supabase Postgres)

Runtime access via the Supabase JS client with the **service-role key** (`lib/db.ts` — camelCase↔snake_case mapping, typed helpers). Drizzle (`lib/schema.ts`, `drizzle.config.ts`) defines the schema and powers `npm run db:push`; note `prepare: false` for Supabase's pgbouncer pooler.

| Table | Purpose |
|---|---|
| `models` | Persona library — `image_path`, `gender`, tied voice (`voice_provider`, `voice_id`) |
| `hooks`, `app_demos`, `music_tracks` | Asset libraries (paths + dims; POST dedupes by path) |
| `reference_ads` | Ingested ads — `video_path`, `transcript`, `segments` (jsonb) |
| `pipeline_runs` | One run — `status`, `config` (the serialized graph) |
| `gen_jobs` | One per executed node — `kind`, `status`, `input_refs.nodeId`, `output_path`, `error` |
| `ads` | Finished outputs |
| `projects` | Server-side project store (graph + outputs jsonb) — exists but the canvas is localStorage-first |

A-rolls/B-rolls/PiP assets are client-side only (`lib/assetsStore.ts`, localStorage), routed by `lib/libraryAssets.ts`; hooks/app-demos/music go to the server tables.

### Storage

One private bucket (`SUPABASE_BUCKET`, default `ad-assets`). DB rows store object **paths**, never bytes or URLs.

- `POST /api/upload` — small multipart uploads.
- `POST /api/upload-url` — presigned upload for large files (browser PUTs straight to Storage, bypassing Next's body limit).
- `GET /api/serve/<path>` — 307 to a 1-hour signed URL; `GET /api/thumb/<path>?w=` — sharp WebP thumbnail.
- Signed URLs are also what get handed to fal.ai/ElevenLabs as inputs.

### Auth

Self-contained OTP-over-email, no external provider (`lib/auth.ts`):

1. `POST /api/auth/send-code` — domain-allowlisted email (`@runable.com` by default), 6-digit code sent via **Resend**, code hash stored in a short-lived signed `as_otp` cookie.
2. `POST /api/auth/verify` — hash check → 7-day HMAC-signed `as_session` cookie (Web Crypto, so it verifies in both Edge middleware and Node).
3. `middleware.ts` gates every route except login/auth/static. Dev escape hatches: `AUTH_DISABLED`, `AUTH_DEV_CODE`.

Caveat: individual API routes don't re-check auth (they trust the middleware), and all DB access uses the service-role key — there is no per-user RLS or multi-tenancy.

---

## 4. External AI services

| Service | Used for |
|---|---|
| **fal.ai** (required) | Kling 2.6 motion-control (persona video swap); nano-banana-pro → nano-banana → seedream fallback chain (first-frame face swap); flux/gpt-image-1 (persona generation); BEN2 (video bg removal → alpha webm); Demucs (stem separation); Whisper (all transcription); Gemini Flash via any-llm (cheap vision fallback) |
| **Anthropic Claude** (optional) | Reference-ad segmentation (Fable 5 / Opus 4.8 / Sonnet 4.6), combined-clip script alignment, first-frame face-match verification, PiP crop-box detection, clip auto-naming — all structured-output vision calls; falls back to FAL Gemini when no key |
| **ElevenLabs** (required) | Voice design (3 previews from a description), save/list voices, TTS, speech-to-speech re-voicing, audio isolation |
| **Higgsfield** (optional) | Soul text-to-image as an alternate persona generator; registered as an alt `MOTION_ENGINE` but that path is an unimplemented placeholder |
| **Meta Ad Library** | `lib/metaScraper.ts` — playwright-core drives headless Chrome, sniffs GraphQL/XHR for the fbcdn video URL (`/api/fetch-media`) |
| **Resend** | Login-code emails |

### Notable flows

**Motion control** (`lib/motionEngine.ts`): drivers shorter than 5s are slowed to exactly 5s (Kling's minimum) and the output is sped back up afterward; "upper body" rejections auto-retry with `character_orientation: 'image'`; the result is normalized back to the driver's exact pixel dimensions.

**PiP reconstruction** (`/api/motion-control/pip`): crop the creator inset → pad into ~62% of a 720×1280 frame (so Kling sees a full upper body) → motion-control → either composite the swapped rectangle back over the original video, or BEN2-cutout the creator and composite the alpha webm over a new app-demo background.

**Voice change** (`lib/voiceApply.ts`): extract audio → Demucs 4-stem separation → convert **only the vocals stem** with ElevenLabs speech-to-speech (timing-preserving) → remix over the untouched music/SFX stems → remux. Falls back to converting the full mix if separation fails.

**Reference analysis** (`lib/referenceAnalysis.ts`): sample ~1 frame per 2s + ffmpeg scene-cut detection + Whisper transcript → vision LLM labels contiguous parts (`hook / pip / a_roll / b_roll / cta / other`). Engine is user-selectable (Claude models vs FAL montage); `estimateOnly` returns cost with no LLM call; `manualSegments` persists hand cuts for free.

### Cost model

`lib/costs.ts` is a static USD table per step (motion swap $0.50, PiP swap $0.70, first frame $0.04, …) used by every `CostConfirmModal`. Analysis costs are computed per model/duration in `lib/analysisModels.ts` (token-based for Claude, flat for FAL). Persona image costs live in `lib/imageModels.ts`. All flagged as "calibrate to your real rates."

---

## 5. Configuration

Typed env access in `lib/config.ts`; `GET /api/config-status` reports which features are available without leaking secrets.

**Required**: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FAL_KEY`, `ELEVENLABS_API_KEY`, `AUTH_SECRET`
**Optional**: `SUPABASE_BUCKET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MOTION_ENGINE` + `HIGGSFIELD_API_KEY`/`HIGGSFIELD_SECRET`, `ELEVENLABS_DEFAULT_VOICE_ID`, `RESEND_API_KEY` + `AUTH_EMAIL_FROM`, `ALLOWED_EMAIL_DOMAIN`, `AUTH_DISABLED`, `AUTH_DEV_CODE`

---

## 6. Quirks worth knowing

- **Projects are localStorage-first.** The server `projects` table and API exist, but the canvas reads/writes `projectsStore` (localStorage). Clearing browser storage loses project graphs (not the media, which is in Supabase).
- **Input order = canvas Y order.** Multi-input nodes (sequence, export, combine) order their inputs by node Y position, not by edge/port. Moving a node vertically changes the output.
- **Transition nodes are markers**, not processors — they emit `{transition}` and mutate how the *next* join in the timeline is stitched.
- **Node execution is sequential**, one node at a time per run, all ffmpeg synchronous (`execFileSync`). Long runs live inside a single `after()` background task (`maxDuration 800`).
- **Hidden node kinds** (`hook`, `motion-control`, `swap-output`, `end-card`) exist for back-compat/programmatic spawning and don't appear in the palette.
- **Params are stringly-typed** — complex configs are JSON strings inside `params`, parsed at execution time.
- **`gen_jobs.input_refs.nodeId`** is the join key between canvas nodes and run progress — that's how per-node badges and previews work.
- **Alpha video gotcha**: decoding BEN2's alpha webm in ffmpeg requires `-c:v libvpx-vp9` placed before the input, or transparency silently drops.
