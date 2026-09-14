import type { ClipReason, SegmentCandidate, Word } from "./types";
import { durationPenalty } from "./clip-rules";

/**
 * Viral scoring model.
 *
 * The score blends three independent evidence sources so that no single one can
 * dominate:
 *   1. semantic signals produced by the discourse analyser (LLM or local),
 *   2. acoustic/prosodic features measured from the word timings (pace, pauses),
 *   3. structural features (does the segment contain hook -> build -> peak -> ending).
 */

const WEIGHTS = {
  hook: 0.2,
  humor: 0.11,
  emotion: 0.12,
  curiosity: 0.14,
  surprise: 0.1,
  controversy: 0.06,
  education: 0.07,
  motivation: 0.05,
  storyCompleteness: 0.09,
  pace: 0.04,
  ending: 0.02,
} as const;

export type ProsodyFeatures = {
  /** words per minute across the segment */
  wpm: number;
  /** longest silent gap in seconds */
  maxGap: number;
  /** total silence seconds */
  silence: number;
  /** variance of local speaking rate — proxy for intonation change */
  paceVariance: number;
  /** ratio of the fastest 20% window to the slowest, > 1 means dynamic delivery */
  dynamics: number;
};

export function measureProsody(words: Word[], start: number, end: number): ProsodyFeatures {
  const inRange = words.filter((w) => w.e > start && w.s < end);
  const duration = Math.max(1, end - start);
  if (inRange.length < 4) {
    return { wpm: 0, maxGap: duration, silence: duration, paceVariance: 0, dynamics: 1 };
  }

  let maxGap = 0;
  let silence = 0;
  for (let i = 1; i < inRange.length; i++) {
    const gap = inRange[i].s - inRange[i - 1].e;
    if (gap > 0.25) silence += gap;
    if (gap > maxGap) maxGap = gap;
  }

  const wpm = (inRange.length / duration) * 60;

  // Local rate in 5s windows.
  const rates: number[] = [];
  for (let t = start; t < end; t += 5) {
    const n = inRange.filter((w) => w.s >= t && w.s < t + 5).length;
    rates.push((n / 5) * 60);
  }
  const mean = rates.reduce((a, b) => a + b, 0) / Math.max(1, rates.length);
  const variance =
    rates.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rates.length);
  const sorted = [...rates].sort((a, b) => a - b);
  const slow = sorted[Math.floor(sorted.length * 0.2)] || 1;
  const fast = sorted[Math.floor(sorted.length * 0.8)] || 1;

  return {
    wpm: Math.round(wpm),
    maxGap: Math.round(maxGap * 100) / 100,
    silence: Math.round(silence * 10) / 10,
    paceVariance: Math.round(variance),
    dynamics: Math.round((fast / Math.max(1, slow)) * 100) / 100,
  };
}

function prosodyBonus(p: ProsodyFeatures): number {
  let bonus = 0;
  // 140–200 wpm reads as energetic on short-form.
  if (p.wpm >= 140 && p.wpm <= 210) bonus += 5;
  else if (p.wpm >= 110 && p.wpm < 140) bonus += 2;
  else if (p.wpm > 230) bonus -= 3;
  else bonus -= 4;

  // A dramatic pause is good; dead air is not.
  if (p.maxGap >= 0.6 && p.maxGap <= 1.6) bonus += 3;
  if (p.maxGap > 3) bonus -= 6;

  // Dynamic delivery correlates with retention.
  if (p.dynamics >= 1.35) bonus += 4;
  else if (p.dynamics < 1.1) bonus -= 2;

  return bonus;
}

export type ScoredSegment = {
  segment: SegmentCandidate;
  score: number;
  retention: number;
  confidence: number;
  reasons: ClipReason[];
  prosody: ProsodyFeatures;
};

export function scoreSegment(segment: SegmentCandidate, words: Word[]): ScoredSegment {
  const s = segment.signals;
  const duration = segment.end - segment.start;
  const prosody = measureProsody(words, segment.start, segment.end);

  let weighted = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    weighted += (s[k as keyof typeof s] ?? 0) * w;
  }

  const raw = weighted * 100 + prosodyBonus(prosody) + durationPenalty(duration);
  const score = clamp(Math.round(raw), 1, 99);

  // Retention prediction: front-loaded hook matters more than anything else.
  const retention = clamp(
    Math.round(
      42 + s.hook * 34 + s.curiosity * 14 + s.storyCompleteness * 8 + (prosody.dynamics - 1) * 12,
    ),
    20,
    97,
  );

  // Confidence is high when signals agree and the transcript is dense.
  const values = Object.values(s);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const spread = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  const density = clamp(words.filter((w) => w.e > segment.start && w.s < segment.end).length / Math.max(1, duration) / 3, 0, 1);
  const confidence = clamp(Math.round((0.55 + density * 0.3 - spread * 0.35) * 100), 40, 98);

  return { segment, score, retention, confidence, reasons: buildReasons(segment, prosody), prosody };
}

function buildReasons(seg: SegmentCandidate, p: ProsodyFeatures): ClipReason[] {
  const s = seg.signals;
  const out: ClipReason[] = [];
  const push = (cond: boolean, label: string, detail: string, weight: number) => {
    if (cond) out.push({ label, detail, weight: Math.round(weight * 100) });
  };

  push(s.hook >= 0.7, "Strong Hook", "The first 3 seconds open a loop the viewer needs closed.", s.hook);
  push(s.humor >= 0.6, "Funny", "Contains a setup and a landed punchline.", s.humor);
  push(s.curiosity >= 0.65, "High Curiosity", "Poses a question the segment then answers.", s.curiosity);
  push(s.emotion >= 0.6, "High Emotion", "Clear emotional shift inside the segment.", s.emotion);
  push(s.surprise >= 0.6, "Surprising Fact", "States a counter-intuitive fact or number.", s.surprise);
  push(s.controversy >= 0.6, "Strong Opinion", "Takes a debatable stance that invites replies.", s.controversy);
  push(s.education >= 0.65, "Educational", "Delivers a self-contained, useful takeaway.", s.education);
  push(s.motivation >= 0.65, "Motivational", "Ends on an actionable, energising note.", s.motivation);
  push(s.storyCompleteness >= 0.7, "Story Complete", "Hook, context, build-up, peak and ending all present.", s.storyCompleteness);
  push(p.wpm >= 140, "Fast Pace", `${p.wpm} words per minute keeps momentum high.`, 0.8);
  push(p.maxGap >= 0.6 && p.maxGap <= 1.6, "Dramatic Pause", `A ${p.maxGap}s beat lands before the payoff.`, 0.7);
  push(s.ending >= 0.65, "Strong Ending", "Closes with a line worth re-watching.", s.ending);

  return out.sort((a, b) => b.weight - a.weight).slice(0, 6);
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
