import "server-only";
import type { Word } from "@/core/domain/types";
import { logger } from "@/infra/log/logger";
import type { CaptionTrack } from "./metadata";

const log = logger("youtube:captions");

/**
 * Pulls YouTube's own timed-text track and converts it to word-level timings.
 * This is a genuine transcript source that needs no API key and no download,
 * so it is tried before falling back to running Whisper locally.
 *
 * Handles both response shapes YouTube serves: JSON3 (iOS player) and SRV3
 * XML (Android player).
 */
export type TimedTextResult = {
  words: Word[];
  language: string;
  /** true when the track was written by a human rather than YouTube's ASR */
  manual: boolean;
};

/**
 * Detects the language actually spoken in the video.
 *
 * YouTube's auto-generated ("asr") track is produced from the audio, so its
 * language code *is* the spoken language. Every other track may be a
 * community translation into an unrelated language — a popular talk can carry
 * 28 of them. Using one as "the transcript" would caption the video with words
 * nobody said, so the ASR track is the ground truth we anchor on.
 */
export function detectSpokenLanguage(tracks: CaptionTrack[]): string | null {
  const asr = tracks.find((t) => t.auto);
  if (asr) return baseLang(asr.lang);
  // No ASR track: a single manual track is almost certainly the original.
  const manual = tracks.filter((t) => !t.auto);
  return manual.length === 1 ? baseLang(manual[0].lang) : null;
}

/**
 * Loads YouTube's own timed text as a word-level transcript.
 *
 * `requestedLang` is the language the user says the video is in ("auto" to
 * infer it). A track is only accepted when it is in that language — a
 * translated track is never returned, because subtitles must reproduce what
 * was spoken, not a rendering of it in another language.
 */
export async function fetchTimedText(
  tracks: CaptionTrack[],
  requestedLang = "auto",
): Promise<TimedTextResult | null> {
  if (tracks.length === 0) return null;

  const spoken = detectSpokenLanguage(tracks);
  const wanted =
    requestedLang && requestedLang !== "auto" ? baseLang(requestedLang) : spoken;

  if (!wanted) {
    log.warn("cannot establish the spoken language; refusing to guess a track", {
      tracks: tracks.length,
    });
    return null;
  }

  if (spoken && wanted !== spoken) {
    // The user claims a different language than the audio track reports.
    // Only an ASR track in that language could still be verbatim.
    log.warn("requested language differs from the detected spoken language", {
      requested: wanted,
      spoken,
    });
  }

  // Candidates in the target language only. Human-written first: it has real
  // punctuation and casing, which downstream sentence snapping depends on.
  const candidates = tracks
    .filter((t) => baseLang(t.lang) === wanted)
    .sort((a, b) => Number(a.auto) - Number(b.auto));

  if (candidates.length === 0) {
    log.warn("no caption track in the target language", {
      wanted,
      available: tracks.map((t) => t.lang).join(","),
    });
    return null;
  }

  for (const track of candidates) {
    const words = await loadTrack(track);
    if (words && words.length >= 20) {
      log.info("timed text transcript loaded", {
        words: words.length,
        lang: track.lang,
        auto: track.auto,
      });
      return { words, language: baseLang(track.lang), manual: !track.auto };
    }
  }

  log.warn("no usable timed-text track", { candidates: candidates.length });
  return null;
}

/** "pt-BR" -> "pt", so regional variants match. */
const baseLang = (code: string) => (code || "").toLowerCase().split("-")[0];

async function loadTrack(track: CaptionTrack): Promise<Word[] | null> {
  const url = `${track.baseUrl}${track.baseUrl.includes("?") ? "&" : "?"}fmt=json3`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const body = await res.text();
    if (!body.trim()) return null;

    const raw = body.trimStart().startsWith("{") ? parseJson3(body) : parseSrv3(body);
    if (!raw.length) return null;
    return stripCredits(stripSpeakerLabels(dedupe(raw.sort((a, b) => a.s - b.s))));
  } catch (err) {
    log.debug("track fetch failed", { lang: track.lang, error: String(err).slice(0, 120) });
    return null;
  }
}

/** JSON3 already carries per-segment offsets, which are effectively per-word. */
function parseJson3(body: string): Word[] {
  const json = JSON.parse(body) as {
    events?: {
      tStartMs?: number;
      dDurationMs?: number;
      segs?: { utf8: string; tOffsetMs?: number }[];
    }[];
  };

  const words: Word[] = [];
  for (const ev of json.events ?? []) {
    if (!ev.segs) continue;
    const base = (ev.tStartMs ?? 0) / 1000;
    const dur = (ev.dDurationMs ?? 0) / 1000;
    const segs = ev.segs.filter((s) => s.utf8 && s.utf8.trim() && s.utf8 !== "\n");

    segs.forEach((seg, i) => {
      const text = seg.utf8.trim();
      if (!text) return;
      const start = base + (seg.tOffsetMs ?? 0) / 1000;
      const nextOffset = segs[i + 1]?.tOffsetMs;
      const end =
        nextOffset !== undefined
          ? base + nextOffset / 1000
          : base + (dur || text.length * 0.06);
      pushTokens(words, text, start, Math.max(start + 0.08, end), 0.9);
    });
  }
  return words;
}

/** SRV3 gives whole cues; distribute the timing across words by length. */
function parseSrv3(body: string): Word[] {
  const words: Word[] = [];
  const paragraphs = body.matchAll(/<p\s+t="(\d+)"(?:\s+d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g);

  for (const [, tRaw, dRaw, inner] of paragraphs) {
    const start = Number(tRaw) / 1000;
    const duration = (Number(dRaw) || 0) / 1000;

    // Inner <s> spans carry their own offsets when word timing is available.
    const spans = [...inner.matchAll(/<s(?:\s+t="(\d+)")?[^>]*>([\s\S]*?)<\/s>/g)];
    if (spans.length > 0) {
      spans.forEach(([, offRaw, text], i) => {
        const s = start + Number(offRaw ?? 0) / 1000;
        const nextOff = spans[i + 1]?.[1];
        const e = nextOff !== undefined ? start + Number(nextOff) / 1000 : start + duration;
        pushTokens(words, decode(text), s, Math.max(s + 0.08, e), 0.88);
      });
      continue;
    }

    const text = decode(inner);
    if (!text.trim()) continue;
    pushTokens(words, text, start, start + (duration || text.length * 0.06), 0.85);
  }
  return words;
}

/**
 * Splits a caption chunk into words and spreads the chunk's duration across
 * them proportionally to their length, so downstream sentence snapping and
 * prosody measurement have per-word granularity.
 */
function pushTokens(out: Word[], text: string, start: number, end: number, conf: number) {
  const tokens = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (tokens.length === 0) return;
  if (tokens.length === 1) {
    out.push({ w: tokens[0], s: r3(start), e: r3(end), c: conf });
    return;
  }

  const totalChars = tokens.reduce((a, t) => a + t.length, 0) || 1;
  const span = Math.max(0.12, end - start);
  let cursor = start;

  for (const token of tokens) {
    const share = (token.length / totalChars) * span;
    out.push({ w: token, s: r3(cursor), e: r3(cursor + share), c: conf });
    cursor += share;
  }
}

/**
 * Lecture and interview transcripts prefix turns with a speaker label
 * ("PATRICK WINSTON:", "INTERVIEWER:"). The label is not spoken, and left in
 * it becomes the clip's hook, so the label run is removed.
 */
function stripSpeakerLabels(words: Word[]): Word[] {
  const LABEL_END = /^[A-Z][A-Z'’.-]*:$/;
  const ALL_CAPS = /^[A-Z][A-Z'’.-]*$/;
  const drop = new Set<number>();

  for (let i = 0; i < words.length; i++) {
    if (!LABEL_END.test(words[i].w)) continue;
    drop.add(i);
    // Walk back over the rest of the name, capped so a shouted sentence
    // cannot be mistaken for a speaker label.
    for (let j = i - 1; j >= 0 && i - j <= 3 && ALL_CAPS.test(words[j].w); j--) {
      drop.add(j);
    }
  }
  return drop.size ? words.filter((_, i) => !drop.has(i)) : words;
}

/**
 * Community-contributed tracks open with translator/reviewer credits that were
 * never spoken. Left in, they poison the first clip's hook and title, so they
 * are dropped from the head of the transcript.
 */
function stripCredits(words: Word[]): Word[] {
  const CREDIT = /^(translator|reviewer|traductor|übersetzung|subtitles?|captions?|transcri(pt|ber))\b/i;
  const NAME = /^[A-ZÀ-Ý][\p{L}'-]+$/u;
  let cut = 0;

  // Only inspect the opening seconds — a real sentence never starts this way.
  for (let i = 0; i < Math.min(words.length, 24); i++) {
    if (words[i].s > 25) break;
    if (!CREDIT.test(words[i].w)) continue;

    // Skip the label, then the run of capitalised name tokens after it. A name
    // run ends where ordinary sentence case resumes, i.e. the next token is
    // lowercase — that token is real speech and must be kept.
    let j = i + 1;
    while (j < words.length && j < i + 6 && NAME.test(words[j].w) && NAME.test(words[j + 1]?.w ?? "")) {
      j += 1;
    }
    cut = Math.max(cut, j);
  }
  return cut > 0 ? words.slice(cut) : words;
}

/** YouTube's rolling auto-captions repeat words between events. */
function dedupe(words: Word[]): Word[] {
  const out: Word[] = [];
  for (const w of words) {
    const prev = out[out.length - 1];
    if (prev && prev.w === w.w && Math.abs(prev.s - w.s) < 0.05) continue;
    out.push(w);
  }
  return out;
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

const r3 = (n: number) => Math.round(n * 1000) / 1000;
