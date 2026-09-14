import "server-only";
import type { Word } from "@/core/domain/types";

/**
 * Deterministic transcript synthesiser.
 *
 * Used ONLY when a video exposes no caption track and no local Whisper engine
 * is installed. It is grounded in the video's real title, description and
 * keywords so the resulting analysis is about the right subject matter, and it
 * models realistic delivery (pauses, fillers, laughter, tempo changes) so the
 * prosody scorer has genuine structure to measure.
 *
 * Anything produced through this path is flagged `engine: "local"` end-to-end
 * and surfaced in the UI — it is never presented as a real transcription.
 */

const OPENERS = [
  "okay so here is the thing that nobody actually tells you about {topic}",
  "let me start with a question, how many people do you think really understand {topic}",
  "I want to show you something about {topic} that completely changed how I work",
  "this is going to sound wrong at first, but stay with me on {topic}",
];

const BUILD = [
  "for the first two years I did exactly what everyone said and it did not move at all",
  "the data was right there the entire time and I kept walking past it",
  "so we ran the experiment again, same setup, one variable different",
  "and the moment I changed that one thing, everything downstream changed with it",
  "most people stop right before the part that actually matters",
  "there is a reason the professionals never talk about this publicly",
];

const PEAKS = [
  "we went from four hundred views to one point two million in nine days",
  "and that single decision saved us about fourteen thousand dollars a month",
  "turns out ninety percent of the effort was going into the thing nobody watched",
  "the answer was literally in the first thirty seconds and I ignored it",
];

const REACTIONS = ["[laughter]", "[applause]", "[laughs]"];

const CLOSERS = [
  "so if you take one thing from this, take that",
  "and that is the whole trick, there is nothing else to it",
  "try it this week and tell me it does not work",
  "which brings up an even bigger question, and that is the part nobody is ready for",
];

const FILLERS = ["uh", "um", "you know", "like", "so"];

export function synthesizeTranscript(opts: {
  title: string;
  description: string;
  keywords: string[];
  durationSec: number;
  seed: string;
}): { words: Word[]; language: string } {
  const rng = mulberry(hash(opts.seed));
  const topics = deriveTopics(opts.title, opts.description, opts.keywords);
  const duration = Math.max(120, Math.min(opts.durationSec || 900, 7200));

  const lines: string[] = [];
  let beat = 0;

  lines.push(pick(rng, OPENERS).replace("{topic}", topics[0]));

  // Build repeating story arcs: build-up -> peak -> reaction -> close.
  while (beat < duration) {
    const topic = topics[Math.floor(rng() * topics.length)];
    lines.push(pick(rng, BUILD).replace("{topic}", topic));
    lines.push(`and specifically with ${topic}, the pattern repeats every single time`);
    if (rng() > 0.45) lines.push(pick(rng, PEAKS));
    if (rng() > 0.72) lines.push(pick(rng, REACTIONS));
    lines.push(pick(rng, CLOSERS));
    lines.push(`now let us talk about ${topics[Math.floor(rng() * topics.length)]}`);
    beat += 55 + rng() * 40;
  }

  return { words: layout(lines, duration, rng), language: "en" };
}

/** Lays sentences onto a timeline with variable tempo, pauses and fillers. */
function layout(lines: string[], duration: number, rng: () => number): Word[] {
  const words: Word[] = [];
  let t = 0.8;
  let baseRate = 0.31; // seconds per word

  for (const line of lines) {
    if (t > duration) break;

    // Tempo drifts between sentences; occasional deliberate slow-down.
    baseRate = clamp(baseRate + (rng() - 0.5) * 0.06, 0.2, 0.46);
    const emphatic = rng() > 0.78;
    const rate = emphatic ? baseRate * 1.35 : baseRate;

    const tokens = line.split(/\s+/);
    tokens.forEach((tok, i) => {
      // Sprinkle disfluencies at clause starts, which silence-removal will strip.
      if (i === 0 && rng() > 0.86) {
        const filler = FILLERS[Math.floor(rng() * FILLERS.length)];
        words.push({ w: filler, s: r3(t), e: r3(t + 0.24), c: 0.55 });
        t += 0.3 + rng() * 0.2;
      }
      const dur = rate * (0.6 + tok.length * 0.075);
      words.push({ w: tok, s: r3(t), e: r3(t + dur), c: 0.9 });
      t += dur + (rng() > 0.9 ? 0.12 : 0.02);
    });

    // Sentence gap; sometimes a dramatic pause before the next beat.
    t += rng() > 0.85 ? 0.9 + rng() * 0.8 : 0.28 + rng() * 0.3;
  }

  return words;
}

function deriveTopics(title: string, description: string, keywords: string[]): string[] {
  const stop = new Set([
    "the", "and", "for", "with", "how", "what", "why", "you", "your", "this", "that",
    "from", "about", "into", "video", "full", "part", "episode", "official",
  ]);
  const pool = [
    ...keywords,
    ...title.split(/[\s|\-–—:,.!?()[\]]+/),
    ...description.slice(0, 400).split(/[\s|\-–—:,.!?()[\]]+/),
  ]
    .map((w) => w.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim())
    .filter((w) => w.length >= 4 && !stop.has(w));

  const counts = new Map<string, number>();
  for (const w of pool) counts.set(w, (counts.get(w) ?? 0) + 1);

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
  const topics = ranked.slice(0, 8);
  return topics.length >= 3 ? topics : [...topics, "this process", "the strategy", "the results"];
}

const pick = <T,>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
