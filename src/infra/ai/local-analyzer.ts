import "server-only";
import type { AnalysisResult, SegmentCandidate, Word } from "@/core/domain/types";
import { CLIP_RULES, snapToSpeech } from "@/core/domain/clip-rules";
import { measureProsody } from "@/core/domain/scoring";

/**
 * Local discourse analyser.
 *
 * This is a real algorithm, not a random generator. It runs over whatever
 * transcript we obtained (YouTube timed-text, Whisper, or synthesised) and:
 *
 *  1. rebuilds sentences from word timings + punctuation + pause length,
 *  2. finds topic boundaries with a TextTiling-style lexical-cohesion valley
 *     search over sliding windows of content words,
 *  3. proposes candidate clips anchored on boundaries and on local peaks of
 *     rhetorical cues (questions, contrast markers, numbers, laughter),
 *  4. derives eleven semantic signals per candidate from cue density, position
 *     within the discourse, and measured prosody.
 *
 * When ANTHROPIC_API_KEY is configured the LLM analyser runs instead and this
 * module becomes the fallback + the sanity check on the LLM's ranges.
 */

type Sentence = {
  text: string;
  words: Word[];
  start: number;
  end: number;
  tokens: string[];
};

const STOP = new Set([
  "the","a","an","and","or","but","of","to","in","on","for","with","is","are","was","were",
  "be","been","it","that","this","as","at","by","from","i","you","we","they","he","she","my",
  "your","our","their","so","if","then","than","not","no","do","does","did","just","really",
  "very","can","will","would","could","should","have","has","had","what","when","where","how",
  "yang","dan","di","ke","dari","itu","ini","untuk","dengan","adalah","saya","kamu","kita",
]);

const CUES = {
  question: /\b(how|why|what|which|who|when|apa|kenapa|bagaimana|gimana)\b|[?]/i,
  hook: /\b(nobody|everyone|never|always|secret|truth|stop|listen|imagine|here is the thing|let me|watch this|rahasia|jangan|ternyata)\b/i,
  contrast: /\b(but|however|actually|turns out|instead|although|padahal|tapi|justru)\b/i,
  surprise: /\b(crazy|insane|shocking|unbelievable|wild|blew my mind|i could not believe|gila|kaget|ngeri)\b/i,
  // Transcripts mark reactions as "(Laughter)" or "[Applause]" — both forms count.
  humor: /\b(funny|hilarious|joke|lol|haha|lucu|ngakak)\b|[([](laughter|laughs|laughing)[)\]]/i,
  applause: /[([](applause|cheers|cheering|clapping)[)\]]/i,
  emotion: /\b(love|hate|scared|afraid|proud|ashamed|cried|heartbroken|amazing|terrible|takut|sedih|bangga)\b/i,
  controversy: /\b(wrong|disagree|overrated|scam|lie|myth|controversial|unpopular|salah|bohong)\b/i,
  education: /\b(step|first|second|third|because|reason|means|therefore|how to|the way to|caranya|langkah)\b/i,
  motivation: /\b(you can|start today|do it|keep going|never give up|worth it|mulai|semangat|bisa)\b/i,
  number: /\b\d[\d.,]*\s?(percent|%|x|k|m|million|billion|dollars|juta|miliar|ribu)?\b/i,
  money: /[$€£¥]\s?\d|\brp\s?\d|\b\d+\s?(dollars|juta|miliar)\b/i,
  closing: /\b(so if you|that is the|remember|the point is|in the end|bottom line|intinya|kesimpulannya)\b/i,
};

export function analyzeLocally(
  words: Word[],
  meta: { title: string; description: string; durationSec: number },
  maxClips = 8,
): AnalysisResult {
  const sentences = buildSentences(words);
  if (sentences.length < 4) {
    return { engine: "local", language: "en", overview: "Transcript too short to analyse.", segments: [] };
  }

  const boundaries = findTopicBoundaries(sentences);
  const candidates = proposeCandidates(sentences, boundaries, words, meta.durationSec);

  // Keep the strongest, non-overlapping proposals.
  const chosen: SegmentCandidate[] = [];
  for (const cand of candidates.sort((a, b) => rank(b) - rank(a))) {
    if (chosen.some((c) => overlaps(c, cand))) continue;
    chosen.push(cand);
    if (chosen.length >= maxClips) break;
  }

  chosen.sort((a, b) => a.start - b.start);

  return {
    engine: "local",
    language: "en",
    overview: buildOverview(sentences, chosen, meta.title),
    segments: chosen,
  };
}

/* -------------------------------------------------------------- sentences */

function buildSentences(words: Word[]): Sentence[] {
  const out: Sentence[] = [];
  let bucket: Word[] = [];

  for (let i = 0; i < words.length; i++) {
    bucket.push(words[i]);
    const next = words[i + 1];
    const gap = next ? next.s - words[i].e : Infinity;
    const terminal = /[.!?…]$/.test(words[i].w);
    const long = bucket.length >= 26;

    if (terminal || gap > 0.7 || long || !next) {
      if (bucket.length >= 2) out.push(toSentence(bucket));
      bucket = [];
    }
  }
  if (bucket.length >= 2) out.push(toSentence(bucket));
  return out;
}

function toSentence(words: Word[]): Sentence {
  const text = words.map((w) => w.w).join(" ");
  return {
    text,
    words,
    start: words[0].s,
    end: words[words.length - 1].e,
    tokens: tokenize(text),
  };
}

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));

/* ------------------------------------------------------------- tiling */

/**
 * TextTiling: slide two adjacent windows over the sentence stream, measure
 * cosine similarity of their content-word vectors, and treat local minima as
 * topic shifts.
 */
function findTopicBoundaries(sentences: Sentence[]): number[] {
  const W = Math.max(2, Math.min(6, Math.floor(sentences.length / 12)));
  if (sentences.length < W * 2 + 2) return [0, sentences.length - 1];

  const scores: number[] = [];
  for (let i = W; i <= sentences.length - W; i++) {
    const left = bag(sentences.slice(i - W, i));
    const right = bag(sentences.slice(i, i + W));
    scores.push(cosine(left, right));
  }

  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
  const threshold = mean - sd * 0.5;

  const boundaries: number[] = [0];
  for (let i = 1; i < scores.length - 1; i++) {
    const isValley = scores[i] < scores[i - 1] && scores[i] <= scores[i + 1];
    if (isValley && scores[i] < threshold) {
      const idx = i + W;
      if (idx - boundaries[boundaries.length - 1] >= 3) boundaries.push(idx);
    }
  }
  boundaries.push(sentences.length - 1);
  return boundaries;
}

function bag(sentences: Sentence[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sentences) for (const t of s.tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  for (const [k, v] of a) dot += v * (b.get(k) ?? 0);
  const na = Math.sqrt([...a.values()].reduce((s, v) => s + v * v, 0));
  const nb = Math.sqrt([...b.values()].reduce((s, v) => s + v * v, 0));
  return na && nb ? dot / (na * nb) : 0;
}

/* --------------------------------------------------------- candidates */

function proposeCandidates(
  sentences: Sentence[],
  boundaries: number[],
  words: Word[],
  duration: number,
): SegmentCandidate[] {
  const out: SegmentCandidate[] = [];

  // 1. One candidate per detected topic block, trimmed to clip length rules.
  for (let b = 0; b < boundaries.length - 1; b++) {
    const from = boundaries[b];
    const to = boundaries[b + 1];
    const block = sentences.slice(from, to + 1);
    if (block.length < 2) continue;

    // Inside a block, anchor on the sentence with the densest rhetorical cues.
    let anchor = from;
    let best = -1;
    for (let i = from; i <= to; i++) {
      const v = cueScore(sentences[i]);
      if (v > best) {
        best = v;
        anchor = i;
      }
    }
    out.push(makeCandidate(sentences, anchor, words, duration));
  }

  // 2. Extra candidates on standalone rhetorical peaks the tiler may have missed.
  const cueScores = sentences.map(cueScore);
  const mean = cueScores.reduce((a, b) => a + b, 0) / cueScores.length;
  for (let i = 1; i < sentences.length - 1; i++) {
    if (cueScores[i] > mean * 1.9 && cueScores[i] >= cueScores[i - 1] && cueScores[i] >= cueScores[i + 1]) {
      out.push(makeCandidate(sentences, i, words, duration));
    }
  }

  return dedupeCandidates(out);
}

/**
 * Smart Clip: grow outwards from the anchor sentence until the clip is in the
 * recommended band, keeping enough lead-in for the payoff to make sense.
 */
function makeCandidate(
  sentences: Sentence[],
  anchor: number,
  words: Word[],
  duration: number,
): SegmentCandidate {
  let lo = anchor;
  let hi = anchor;

  // Lead-in first — context matters more than tail for comprehension.
  while (lo > 0 && sentences[anchor].end - sentences[lo - 1].start < 26) lo -= 1;

  // Grow forwards, but stop at the first clean ending once we are inside the
  // recommended band. A clip that ends on a completed thought at 55s beats one
  // padded to 90s to fill the window.
  while (
    hi < sentences.length - 1 &&
    sentences[hi + 1].end - sentences[lo].start <= CLIP_RULES.IDEAL_MAX
  ) {
    const span = sentences[hi].end - sentences[lo].start;
    const endsCleanly = /[.!?]$/.test(sentences[hi].text.trim());
    if (span >= 42 && endsCleanly && CUES.closing.test(sentences[hi].text)) break;
    if (span >= 62 && endsCleanly) break;
    hi += 1;
  }
  // Guarantee the minimum duration even at the very end of the video.
  while (sentences[hi].end - sentences[lo].start < CLIP_RULES.IDEAL_MIN && lo > 0) lo -= 1;

  const snapped = snapToSpeech(words, sentences[lo].start, sentences[hi].end);
  const start = Math.max(0, snapped.start);
  const end = Math.min(duration || snapped.end, snapped.end);

  const block = sentences.slice(lo, hi + 1);
  const text = block.map((s) => s.text).join(" ");
  const prosody = measureProsody(words, start, end);

  const density = (re: RegExp) =>
    Math.min(1, block.filter((s) => re.test(s.text)).length / Math.max(2, block.length * 0.45));

  const firstThree = block[0]?.text ?? "";
  const lastOne = block[block.length - 1]?.text ?? "";

  const signals: SegmentCandidate["signals"] = {
    hook: clamp01(
      (CUES.hook.test(firstThree) ? 0.45 : 0) +
        (CUES.question.test(firstThree) ? 0.3 : 0) +
        (CUES.number.test(firstThree) ? 0.15 : 0) +
        density(CUES.hook) * 0.35 +
        0.15,
    ),
    humor: clamp01(density(CUES.humor) * 0.9 + (CUES.applause.test(text) ? 0.15 : 0) + 0.08),
    emotion: clamp01(density(CUES.emotion) * 0.85 + (prosody.dynamics - 1) * 0.35 + 0.1),
    curiosity: clamp01(density(CUES.question) * 0.7 + density(CUES.contrast) * 0.35 + 0.12),
    surprise: clamp01(density(CUES.surprise) * 0.8 + density(CUES.number) * 0.3 + 0.08),
    controversy: clamp01(density(CUES.controversy) * 0.95 + 0.05),
    education: clamp01(density(CUES.education) * 0.8 + 0.12),
    motivation: clamp01(density(CUES.motivation) * 0.85 + 0.08),
    storyCompleteness: clamp01(
      0.32 +
        (block.length >= 4 ? 0.22 : 0) +
        (CUES.closing.test(lastOne) ? 0.26 : 0) +
        (/[.!?]$/.test(lastOne.trim()) ? 0.12 : 0) +
        (CUES.hook.test(firstThree) ? 0.14 : 0),
    ),
    pace: clamp01(prosody.wpm / 220),
    ending: clamp01((CUES.closing.test(lastOne) ? 0.6 : 0.2) + (CUES.question.test(lastOne) ? 0.25 : 0)),
  };

  return {
    start,
    end,
    title: titleFor(block),
    hook: truncate(stripMarkers(firstThree) || stripMarkers(text), 90),
    summary: truncate(stripMarkers(text), 220),
    topics: topTokens(block, 4),
    signals,
  };
}

function cueScore(s: Sentence): number {
  let v = 0;
  if (CUES.hook.test(s.text)) v += 3;
  if (CUES.question.test(s.text)) v += 2;
  if (CUES.surprise.test(s.text)) v += 2.5;
  if (CUES.humor.test(s.text)) v += 2.5;
  if (CUES.applause.test(s.text)) v += 2;
  if (CUES.controversy.test(s.text)) v += 2;
  if (CUES.money.test(s.text)) v += 1.8;
  if (CUES.number.test(s.text)) v += 1.2;
  if (CUES.contrast.test(s.text)) v += 1;
  if (CUES.closing.test(s.text)) v += 1;
  return v;
}

/**
 * Strips non-speech markers and leading punctuation so titles and hooks read
 * as actual dialogue. Punctuation-free ASR tracks frequently leave a stray
 * comma or dash at a pause boundary.
 */
const stripMarkers = (text: string) =>
  text
    .replace(/[([][^)\]]{0,24}[)\]]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:.\-–—'"]+/, "")
    .trim();

function titleFor(block: Sentence[]): string {
  // Prefer a sentence with real words in it, not just a reaction marker.
  const speech = block.filter((s) => stripMarkers(s.text).split(/\s+/).length >= 4);
  const pool = speech.length ? speech : block;
  const best = pool.reduce((a, b) => (cueScore(b) > cueScore(a) ? b : a), pool[0]);

  const words = stripMarkers(best.text).split(/\s+/).slice(0, 9).join(" ");
  const cleaned = words.replace(/[,;:]$/, "").trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Untitled moment";
}

function topTokens(block: Sentence[], n: number): string[] {
  const counts = bag(block);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t);
}

function rank(c: SegmentCandidate): number {
  const s = c.signals;
  return s.hook * 3 + s.curiosity * 2 + s.humor * 1.6 + s.emotion * 1.6 + s.surprise * 1.5 + s.storyCompleteness * 2;
}

function overlaps(a: SegmentCandidate, b: SegmentCandidate): boolean {
  const inter = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  return inter / Math.min(a.end - a.start, b.end - b.start) > 0.3;
}

function dedupeCandidates(list: SegmentCandidate[]): SegmentCandidate[] {
  const out: SegmentCandidate[] = [];
  for (const c of list) {
    if (c.end - c.start < CLIP_RULES.MIN_SEC) continue;
    if (out.some((o) => Math.abs(o.start - c.start) < 4)) continue;
    out.push(c);
  }
  return out;
}

function buildOverview(sentences: Sentence[], chosen: SegmentCandidate[], title: string): string {
  const topics = topTokens(sentences, 6).join(", ");
  return `Analysed ${sentences.length} spoken segments across "${title}". Dominant themes: ${topics}. ${chosen.length} self-contained story units met the clip rules.`;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const truncate = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
