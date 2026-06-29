# Ad-Studio — APIs & Models in use

Every step that calls an external API or model, what it uses, and where. (Local ffmpeg steps cost
nothing and use no model.) Estimated $ comes from `lib/costs.ts` (placeholders — calibrate).

## AI / generation steps

| Step / feature | Provider | Model / endpoint | Where | Est. $ |
|---|---|---|---|---|
| **Motion-control swap** (full-frame A-roll/Hook) | FAL | `fal-ai/kling-video/v2.6/standard/motion-control` (Kling 2.6) | `lib/motionEngine.ts`, `/api/motion-control` | $0.50 |
| **PiP swap** (creator over app-demo) | FAL + ffmpeg | Kling 2.6 motion-control → `fal-ai/ben/v2/video` (bg-remove) → ffmpeg composite | `/api/motion-control/pip`, `lib/bgRemoval.ts` | $0.70 |
| **First frame** (face swap, fallback chain) | FAL | `fal-ai/nano-banana-pro/edit` → `fal-ai/nano-banana/edit` → `fal-ai/bytedance/seedream/v4/edit` | `/api/motion-control/first-frame` | $0.04 |
| **First-frame face verify** | Anthropic | `claude-opus-4-8` (vision) | `/api/motion-control/first-frame` | (incl.) |
| **PiP crop detection** | Anthropic (FAL fallback) | `claude-opus-4-8` vision → `fal-ai/any-llm/vision` (`gemini-flash-1.5`) if no key | `/api/motion-control/detect-crop` | — |
| **Background removal** | FAL | `fal-ai/ben/v2/video` (alpha webm) | `lib/bgRemoval.ts` | $0.10 |
| **Subtitles** (auto captions) | FAL | `fal-ai/whisper` (word-level) | `lib/transcribe.ts` → `lib/subtitlesBurn.ts`, `/api/subtitles` | $0.03 |
| **Hook naming** (by speech, else on-screen text) | FAL + Anthropic | `fal-ai/whisper` (speech) → `claude-opus-4-8` (first-frame OCR) | `lib/clipName.ts`, `/api/hooks` | — |
| **Combined-clip alignment** (split) | Anthropic (default) | `claude-opus-4-8` (selectable: Sonnet 4.6 / Gemini Flash) | `lib/combinedAlign.ts`, `/api/combined-clip/split` | — |
| **Reference-ad analysis** | Anthropic (default) | `claude-opus-4-8` (selectable: Sonnet 4.6 / Gemini Flash) + `fal-ai/whisper` | `lib/referenceAnalysis.ts`, `lib/analysisModels.ts` | — |
| **Voice / TTS** (Voice node) | ElevenLabs | `eleven_multilingual_v2` (+ `eleven_multilingual_ttv_v2`) | `lib/elevenlabs.ts` | $0.10 |
| **Model (persona) generation** | FAL | `fal-ai/flux/dev`, `flux/schnell`, `flux/dev/image-to-image`, `gpt-image-1/text-to-image`, `gpt-image-1/edit-image` | `/api/models/generate` | — |
| **Model alteration** (image-to-image) | FAL | `fal-ai/flux/dev/image-to-image` | `lib/alterModel.ts` | — |

## Local ffmpeg steps — no API, no cost

| Step | Tool |
|---|---|
| Transitions (xfade crossfade) | ffmpeg (`lib/ffmpegMediaOps.ts`) |
| Text / emoji overlay | ffmpeg + Pango/sharp + Twemoji PNGs (CDN) (`lib/textBurn.ts`) |
| Sequence / Export (concat) | ffmpeg (`lib/runPipeline.ts`) |
| Trim / Split / Cut | ffmpeg |
| PiP composite, retime, normalize | ffmpeg |
| Thumbnails (Clips, Scale review) | sharp (`/api/thumb`) |

## Engine switch & infra

- **Motion engine** is switchable via `MOTION_ENGINE` env: `fal` (default, Kling 2.6) or `higgsfield` (placeholder, not wired) — `lib/motionEngine.ts`.
- **Vision/LLM default** (FAL any-llm): `google/gemini-flash-1.5`; face/OCR-critical checks use Anthropic `claude-opus-4-8`.
- **Storage + DB**: Supabase Storage (bucket `ad-assets`) + PostgREST tables (`models`, `hooks`, `app_demos`, `music_tracks`, …). Projects + a-roll/b-roll/pip assets are local (`localStorage`).
