import type { Word } from "./types";

export const CLIP_RULES = {
  MIN_SEC: 20,
  MAX_SEC: 300,
  IDEAL_MIN: 30,
  IDEAL_MAX: 90,
  /** how far AI may extend backwards to recover context */
  MAX_CONTEXT_LEAD_SEC: 45,
  /** how far AI may extend forwards to complete a thought */
  MAX_TAIL_SEC: 20,
} as const;

const SENTENCE_END = /[.!?…]["')\]]?$/;
const CLAUSE_END = /[,;:]["')\]]?$/;

/**
 * Snap an arbitrary time range onto sentence boundaries so a clip never cuts a
 * sentence, a punchline, or a hook in half. Implements the "Smart Clip" rule:
 * the boundary may move outward to keep the story intact, within the caps above.
 */
export function snapToSpeech(
  words: Word[],
  startSec: number,
  endSec: number,
): { start: number; end: number; snapped: { lead: number; tail: number } } {
  if (words.length === 0) {
    return { start: startSec, end: endSec, snapped: { lead: 0, tail: 0 } };
  }

  const firstIdx = nearestIndex(words, startSec);
  const lastIdx = nearestIndex(words, endSec);

  // Walk backwards to the start of the sentence containing `startSec`.
  let s = firstIdx;
  while (s > 0 && !SENTENCE_END.test(words[s - 1].w)) {
    if (words[firstIdx].s - words[s - 1].s > CLIP_RULES.MAX_CONTEXT_LEAD_SEC) break;
    s -= 1;
  }
  // If we only backed up a token or two, prefer a clause boundary for a tighter hook.
  if (firstIdx - s <= 1 && s > 0 && CLAUSE_END.test(words[s - 1].w)) s = Math.max(0, s);

  // Walk forwards until the sentence completes, so the punchline lands.
  let e = lastIdx;
  while (e < words.length - 1 && !SENTENCE_END.test(words[e].w)) {
    if (words[e].e - words[lastIdx].e > CLIP_RULES.MAX_TAIL_SEC) break;
    e += 1;
  }

  const start = Math.max(0, words[s].s - 0.18);
  const end = words[e].e + 0.32;

  return {
    start,
    end,
    snapped: {
      lead: Math.max(0, startSec - start),
      tail: Math.max(0, end - endSec),
    },
  };
}

function nearestIndex(words: Word[], t: number) {
  let lo = 0;
  let hi = words.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].e < t) lo = mid + 1;
    else hi = mid;
  }
  return Math.min(words.length - 1, Math.max(0, lo));
}

/** Clamp a clip to the hard duration rules, trimming from the tail first. */
export function clampDuration(start: number, end: number, sourceDuration: number) {
  let s = Math.max(0, start);
  let e = Math.min(sourceDuration || end, end);

  if (e - s > CLIP_RULES.MAX_SEC) e = s + CLIP_RULES.MAX_SEC;
  if (e - s < CLIP_RULES.MIN_SEC) {
    e = Math.min(sourceDuration || s + CLIP_RULES.MIN_SEC, s + CLIP_RULES.MIN_SEC);
    if (e - s < CLIP_RULES.MIN_SEC) s = Math.max(0, e - CLIP_RULES.MIN_SEC);
  }
  return { start: round2(s), end: round2(e) };
}

/** Reject clips that overlap an already-selected clip by more than 35%. */
export function overlapRatio(
  a: { start: number; end: number },
  b: { start: number; end: number },
) {
  const inter = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  const shortest = Math.min(a.end - a.start, b.end - b.start) || 1;
  return inter / shortest;
}

export function durationPenalty(seconds: number): number {
  if (seconds < CLIP_RULES.MIN_SEC || seconds > CLIP_RULES.MAX_SEC) return -40;
  if (seconds >= CLIP_RULES.IDEAL_MIN && seconds <= CLIP_RULES.IDEAL_MAX) return 6;
  if (seconds < CLIP_RULES.IDEAL_MIN) return -3;
  if (seconds <= 150) return -2;
  return -8;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function formatTimecode(sec: number, withMs = false): string {
  const total = Math.max(0, sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.floor((total % 1) * 100);
  const base = h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return withMs ? `${base}.${String(ms).padStart(2, "0")}` : base;
}
