import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AnalysisResult, SegmentCandidate, Word } from "@/core/domain/types";
import { CLIP_RULES, snapToSpeech } from "@/core/domain/clip-rules";
import { config } from "@/core/config";
import { logger } from "@/infra/log/logger";

const log = logger("ai:llm");

const SignalSchema = z.object({
  hook: z.number().min(0).max(1),
  humor: z.number().min(0).max(1),
  emotion: z.number().min(0).max(1),
  curiosity: z.number().min(0).max(1),
  surprise: z.number().min(0).max(1),
  controversy: z.number().min(0).max(1),
  education: z.number().min(0).max(1),
  motivation: z.number().min(0).max(1),
  storyCompleteness: z.number().min(0).max(1),
  pace: z.number().min(0).max(1),
  ending: z.number().min(0).max(1),
});

const ResponseSchema = z.object({
  language: z.string().default("en"),
  overview: z.string().default(""),
  segments: z
    .array(
      z.object({
        start: z.number().min(0),
        end: z.number().min(0),
        title: z.string().min(1).max(120),
        hook: z.string().default(""),
        summary: z.string().default(""),
        topics: z.array(z.string()).default([]),
        signals: SignalSchema,
      }),
    )
    .default([]),
});

const SYSTEM = `You are the clip-discovery engine inside Clipper AI, a product that turns long-form video into short-form clips.

You will receive a timestamped transcript. Your job is DISCOURSE ANALYSIS, not keyword matching.

Read for:
- topic structure and where topics genuinely shift
- narrative arcs: hook, context, build-up, peak, ending
- emotional trajectory and where it changes
- humour: setup and the landing of the punchline
- surprising facts, concrete numbers, money figures
- conflict, contrarian or controversial opinions
- curiosity gaps: a question posed and later answered
- motivational or educational payoffs that stand alone
- laughter, applause, dramatic pauses (visible as gaps in the timings)

Rules for every segment you return:
- MUST be self-contained: a viewer with zero context understands it.
- MUST NOT start or end mid-sentence.
- MUST NOT cut off a punchline, a hook, or the answer to a question it raised.
- You MAY extend the start earlier than the interesting moment to include the context that makes it land. This is expected and encouraged.
- Duration between ${CLIP_RULES.MIN_SEC}s and ${CLIP_RULES.MAX_SEC}s; strongly prefer ${CLIP_RULES.IDEAL_MIN}-${CLIP_RULES.IDEAL_MAX}s.
- Segments must not overlap each other by more than 30%.
- Use timestamps that exist in the transcript.

Score each of the eleven signals from 0 to 1, calibrated honestly. A merely competent segment should score around 0.4-0.5. Reserve values above 0.85 for genuinely exceptional evidence you can point to in the transcript.

Respond with JSON only, matching exactly:
{"language":"<iso code>","overview":"<2 sentences on what the video is about and where the value is>","segments":[{"start":<sec>,"end":<sec>,"title":"<max 8 words, no clickbait fabrication>","hook":"<the actual opening line, quoted from the transcript>","summary":"<1-2 sentences>","topics":["..."],"signals":{"hook":0,"humor":0,"emotion":0,"curiosity":0,"surprise":0,"controversy":0,"education":0,"motivation":0,"storyCompleteness":0,"pace":0,"ending":0}}]}`;

export async function analyzeWithLLM(
  words: Word[],
  meta: { title: string; channel: string; description: string; durationSec: number },
  maxClips: number,
  onLog?: (line: string) => void,
): Promise<AnalysisResult> {
  const cfg = config();
  if (!cfg.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

  const client = new Anthropic({ apiKey: cfg.ANTHROPIC_API_KEY });
  const transcript = renderTranscript(words);

  onLog?.(`Sending ${transcript.length.toLocaleString()} chars of transcript to ${cfg.ANTHROPIC_MODEL}`);

  const message = await client.messages.create({
    model: cfg.ANTHROPIC_MODEL,
    max_tokens: 8000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `VIDEO: "${meta.title}" by ${meta.channel}
DURATION: ${Math.round(meta.durationSec)}s
DESCRIPTION: ${meta.description.slice(0, 600)}

Find the ${maxClips} strongest short-form clips.

TRANSCRIPT (format: [mm:ss] text):
${transcript}`,
      },
      { role: "assistant", content: "{" },
    ],
  });

  const text =
    "{" +
    message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

  const parsed = ResponseSchema.parse(JSON.parse(extractJson(text)));
  onLog?.(`Model proposed ${parsed.segments.length} segments`);

  // Never trust model timestamps blindly: snap them onto real speech boundaries
  // and enforce the hard clip rules locally.
  const segments: SegmentCandidate[] = [];
  for (const s of parsed.segments) {
    if (s.end <= s.start) continue;
    const snapped = snapToSpeech(words, s.start, s.end);
    const start = Math.max(0, snapped.start);
    const end = Math.min(meta.durationSec || snapped.end, snapped.end);
    const dur = end - start;
    if (dur < CLIP_RULES.MIN_SEC || dur > CLIP_RULES.MAX_SEC) {
      log.warn("dropping out-of-range LLM segment", { start, end, dur });
      continue;
    }
    if (segments.some((p) => overlapTooMuch(p, { start, end }))) continue;
    segments.push({ ...s, start, end });
  }

  log.info("llm analysis complete", { proposed: parsed.segments.length, kept: segments.length });

  return {
    engine: "llm",
    language: parsed.language,
    overview: parsed.overview,
    segments: segments.sort((a, b) => a.start - b.start),
  };
}

/** Compresses word timings into readable, token-efficient lines. */
function renderTranscript(words: Word[]): string {
  const lines: string[] = [];
  let bucket: Word[] = [];
  for (let i = 0; i < words.length; i++) {
    bucket.push(words[i]);
    const next = words[i + 1];
    const gap = next ? next.s - words[i].e : Infinity;
    if (/[.!?]$/.test(words[i].w) || gap > 0.7 || bucket.length >= 22 || !next) {
      const t = bucket[0].s;
      const mm = String(Math.floor(t / 60)).padStart(2, "0");
      const ss = String(Math.floor(t % 60)).padStart(2, "0");
      lines.push(`[${mm}:${ss}] ${bucket.map((w) => w.w).join(" ")}`);
      bucket = [];
    }
  }
  const joined = lines.join("\n");
  // Guard against pathological inputs blowing the context window.
  return joined.length > 260_000 ? `${joined.slice(0, 260_000)}\n[transcript truncated]` : joined;
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON");
  return text.slice(start, end + 1);
}

function overlapTooMuch(a: { start: number; end: number }, b: { start: number; end: number }) {
  const inter = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  return inter / Math.min(a.end - a.start, b.end - b.start) > 0.3;
}
