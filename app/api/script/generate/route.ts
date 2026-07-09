import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const SYSTEM = `You are a senior direct-response copywriter for Runable (runable.com).

Runable is a general AI agent: users chat with it and it builds full deliverables end to end — websites (built and published on a live link), reports, presentations, spreadsheets, videos, automations, research. It works like hiring a capable person, not like a chatbot: you describe the outcome, it does the work. Free to start, credit-based.

You will be given the transcript of someone else's video ad. Your job is to rewrite it as a UGC ad script for Runable that keeps what makes the original work — its hook structure, pacing, emotional beats, and CTA placement — while swapping the product story to Runable.

Rules:
- Preserve the skeleton of the original (hook type, number of beats, rough runtime), not its words. Never mention the original product.
- Spoken lines must sound like a real person talking to camera: contractions, short sentences, no marketing jargon.
- Ground claims in what Runable actually does (e.g. "I typed one prompt and it built and published my whole site"). Do not invent pricing or fake stats.
- Keep total VO within ±20% of the original transcript's word count.

Output exactly this markdown structure:

## Runable Ad Script
**Angle:** one line on the persuasion angle carried over from the original.
**Est. runtime:** Xs

### Script
For each beat, a block:
**[Beat name — ~Xs]**
VO: the spoken line(s)
Visual: what's on screen (talking head / screen recording of Runable / b-roll)

### Hook variants
3 alternative opening lines for A/B testing.

### Notes
2-3 bullets: what the original ad did well that you preserved, and anything to watch in the edit.`;

/** POST /api/script/generate  { transcript } — rewrite a competitor/reference ad transcript into a Runable ad script. Returns { script }. */
export async function POST(req: NextRequest) {
  try {
    const { transcript } = await req.json();
    if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 });
    }
    if (!config.anthropicApiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set — add it to .env.' }, { status: 500 });
    }

    const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    const resp = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Here is the transcript of the reference video ad:\n\n"""\n${transcript.trim()}\n"""\n\nRewrite it as a Runable ad script.`,
        },
      ],
    } as Parameters<typeof anthropic.messages.create>[0]);

    const blocks = (resp as { content: Array<{ type: string; text?: string }> }).content;
    const script = blocks
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!script) {
      return NextResponse.json({ error: 'Model returned no script — try again.' }, { status: 502 });
    }
    return NextResponse.json({ script });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Script generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
