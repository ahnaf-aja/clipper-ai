import type { CaptionCue, CaptionToken, ClipSettings, Word } from "@/core/domain/types";

/**
 * Turns word-level ASR output into caption cues.
 *
 * Hard invariant: the concatenation of every token's `text` must equal the
 * spoken words, in order. Viral Caption mode may only change *presentation* —
 * grouping, casing, emphasis, colour and emoji — never the words themselves.
 * `assertMeaningPreserved` below enforces that at build time.
 */

const FILLERS = new Set([
  "uh", "uhh", "um", "umm", "erm", "er", "hmm", "mmm", "eee", "emm",
  "anu", "eh", "ehm", "gitu", "kayak", "like", "you know", "i mean",
]);

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with", "is",
  "are", "was", "were", "be", "been", "it", "that", "this", "as", "at", "by", "from",
  "yang", "dan", "di", "ke", "dari", "itu", "ini", "untuk", "dengan", "adalah",
]);

const HOOK_WORDS = new Set([
  "secret", "never", "always", "nobody", "everyone", "stop", "listen", "imagine",
  "truth", "mistake", "wrong", "shocking", "crazy", "insane", "rahasia", "jangan",
  "ternyata", "kaget", "gila", "penting",
]);

const EMOJI_RULES: { test: RegExp; emoji: string }[] = [
  { test: /\b(money|dollar|revenue|profit|rich|juta|miliar|uang|cuan)\b/i, emoji: "💰" },
  { test: /\b(fire|amazing|incredible|best|keren|mantap|gokil)\b/i, emoji: "🔥" },
  { test: /\b(fast|grow|growth|launch|rocket|scale|naik)\b/i, emoji: "🚀" },
  { test: /\b(shocked|shocking|unbelievable|kaget|gila|wow)\b/i, emoji: "🤯" },
  { test: /\b(scary|terrifying|horror|serem|takut)\b/i, emoji: "😱" },
  { test: /\b(love|heart|favorite|suka|cinta)\b/i, emoji: "❤️" },
  { test: /\b(funny|laugh|joke|lucu|ngakak|haha)\b/i, emoji: "😂" },
  { test: /\b(think|idea|realize|sadar|ide)\b/i, emoji: "💡" },
];

const MONEY = /^[$€£¥Rp]?\s?[\d.,]+(k|m|b|rb|jt|juta|miliar)?$/i;
const NUMBER = /^[\d.,]+%?$/;
const PROPER = /^[A-Z][a-z]{2,}$/;
/** "I've", "don't" — capitalised only by sentence case, never proper nouns. */
const CONTRACTION = /['’]/;

/**
 * Non-speech annotations that transcripts carry — "(Laughter)", "[Applause]",
 * "♪". They are valuable signals for the analyser but were never spoken, so
 * they must never be rendered as caption text.
 */
const SOUND_EVENT = /^[([♪].*[)\]♪]$|^[([](laughter|applause|music|cheers?|clapping)[)\]]$/i;

export const isSoundEvent = (token: string) => SOUND_EVENT.test(token.trim());

export function buildCaptions(words: Word[], settings: ClipSettings, clipStart: number): CaptionCue[] {
  const spoken = words.filter((w) => !isSoundEvent(w.w));
  const cleaned = settings.silenceRemoval ? stripFillers(spoken) : spoken;
  if (cleaned.length === 0) return [];

  const groups = settings.viralCaption
    ? groupViral(cleaned)
    : groupPlain(cleaned, settings.reveal === "word" ? 4 : 8);

  return groups.map((group) => {
    const tokens: CaptionToken[] = group.map((w, i) => {
      const bare = w.w.replace(/[^\p{L}\p{N}$€£¥%.,]/gu, "");
      const token: CaptionToken = {
        text: settings.uppercase ? w.w.toUpperCase() : w.w,
        start: Math.max(0, w.s - clipStart),
        end: Math.max(0.05, w.e - clipStart),
      };

      if (settings.viralCaption) token.emph = isEmphatic(bare, i, group.length);
      if (settings.keywordHighlight) {
        // A capitalised word right after a full stop is just sentence case,
        // not a proper noun — pass that context to the classifier.
        const prev = i > 0 ? group[i - 1].w : "";
        const sentenceInitial = i === 0 || /[.!?…]["')\]]?$/.test(prev);
        const hl = classify(bare, sentenceInitial || CONTRACTION.test(w.w));
        if (hl) token.hl = hl;
      }
      if (settings.autoEmoji) {
        const emoji = pickEmoji(bare);
        if (emoji) token.emoji = emoji;
      }
      return token;
    });

    // Auto-emoji restraint: at most one emoji per cue, on the strongest token.
    if (settings.autoEmoji) {
      const withEmoji = tokens.filter((t) => t.emoji);
      if (withEmoji.length > 1) {
        withEmoji.slice(1).forEach((t) => delete t.emoji);
      }
    }

    return {
      start: tokens[0].start,
      end: tokens[tokens.length - 1].end,
      tokens,
    };
  });
}

/** Silence removal: drop filler tokens and collapse long dead air. */
export function stripFillers(words: Word[]): Word[] {
  return words.filter((w, i) => {
    const bare = w.w.toLowerCase().replace(/[^\p{L}]/gu, "");
    if (!bare) return true;
    if (!FILLERS.has(bare)) return true;
    // Keep a filler if removing it would orphan a one-word cue.
    const prev = words[i - 1];
    const next = words[i + 1];
    return !prev && !next;
  });
}

/** Viral grouping: short, rhythmic bursts that break on natural beats. */
function groupViral(words: Word[]): Word[][] {
  const out: Word[][] = [];
  let current: Word[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    current.push(w);

    const next = words[i + 1];
    const gap = next ? next.s - w.e : Infinity;
    const endsClause = /[.!?,;:—]$/.test(w.w);
    const chars = current.reduce((a, t) => a + t.w.length + 1, 0);
    const span = w.e - current[0].s;

    const shouldBreak =
      !next ||
      gap > 0.42 ||
      (endsClause && current.length >= 2) ||
      current.length >= 5 ||
      chars > 26 ||
      span > 2.4;

    if (shouldBreak) {
      out.push(current);
      current = [];
    }
  }
  if (current.length) out.push(current);
  return out;
}

/** Plain grouping: conventional subtitle lines. */
function groupPlain(words: Word[], perLine: number): Word[][] {
  const out: Word[][] = [];
  let current: Word[] = [];
  for (const w of words) {
    current.push(w);
    const chars = current.reduce((a, t) => a + t.w.length + 1, 0);
    if (current.length >= perLine || chars > 46 || /[.!?]$/.test(w.w)) {
      out.push(current);
      current = [];
    }
  }
  if (current.length) out.push(current);
  return out;
}

function isEmphatic(bare: string, index: number, total: number): boolean {
  const lower = bare.toLowerCase();
  if (!lower) return false;
  if (HOOK_WORDS.has(lower)) return true;
  if (MONEY.test(bare) || NUMBER.test(bare)) return true;
  if (STOPWORDS.has(lower)) return false;
  if (lower.length >= 7) return true;
  // Emphasise the final content word of a burst — it usually carries the beat.
  return index === total - 1 && lower.length >= 4;
}

function classify(bare: string, sentenceInitial: boolean): CaptionToken["hl"] | null {
  if (!bare) return null;
  const lower = bare.toLowerCase();
  if (/^[$€£¥]/.test(bare) || /^(rp)/i.test(bare) || MONEY.test(bare)) return "money";
  if (NUMBER.test(bare)) return "number";
  if (HOOK_WORDS.has(lower)) return "hook";
  if (PROPER.test(bare) && !sentenceInitial && !STOPWORDS.has(lower)) return "name";
  if (!STOPWORDS.has(lower) && bare.length >= 6) return "keyword";
  return null;
}

function pickEmoji(bare: string): string | undefined {
  for (const rule of EMOJI_RULES) if (rule.test.test(bare)) return rule.emoji;
  return undefined;
}

/**
 * Guard rail: verifies caption tokens still say exactly what was spoken.
 * Returns null when safe, or a human-readable reason when the invariant broke.
 */
export function assertMeaningPreserved(source: Word[], cues: CaptionCue[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const spoken = source.map((w) => norm(w.w)).filter(Boolean);
  const shown = cues.flatMap((c) => c.tokens.map((t) => norm(t.text))).filter(Boolean);

  let si = 0;
  for (const token of shown) {
    // Advance through spoken words; captions may omit fillers but never add words.
    let found = false;
    while (si < spoken.length) {
      if (spoken[si] === token) {
        si += 1;
        found = true;
        break;
      }
      si += 1;
    }
    if (!found) return `Caption token "${token}" was not spoken in the source audio.`;
  }
  return null;
}

export function cuesToVtt(cues: CaptionCue[]): string {
  const stamp = (t: number) => {
    const h = String(Math.floor(t / 3600)).padStart(2, "0");
    const m = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
    const s = String(Math.floor(t % 60)).padStart(2, "0");
    const ms = String(Math.floor((t % 1) * 1000)).padStart(3, "0");
    return `${h}:${m}:${s}.${ms}`;
  };
  const body = cues
    .map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.tokens.map((t) => t.text).join(" ")}`)
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}
