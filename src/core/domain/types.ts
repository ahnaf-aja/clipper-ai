/** Shared domain types — used by both server pipeline and client editor. */

export type PipelineStep =
  | "pending"
  | "metadata"
  | "thumbnail"
  | "duration"
  | "download"
  | "audio"
  | "transcribe"
  | "transcript"
  | "analyze"
  | "segment"
  | "score"
  | "select"
  | "subtitle"
  | "caption"
  | "render"
  | "preview"
  | "done";

export const PIPELINE_STEPS: { key: PipelineStep; label: string; weight: number }[] = [
  { key: "metadata", label: "Fetching video metadata", weight: 3 },
  { key: "thumbnail", label: "Grabbing thumbnail", weight: 2 },
  { key: "duration", label: "Reading duration & streams", weight: 2 },
  { key: "download", label: "Downloading audio", weight: 8 },
  { key: "audio", label: "Preparing audio for transcription", weight: 4 },
  // Transcription dominates the wall clock, so it carries most of the weight.
  { key: "transcribe", label: "Speech-to-text (Whisper)", weight: 38 },
  { key: "transcript", label: "Building word-level transcript", weight: 5 },
  { key: "analyze", label: "LLM discourse & emotion analysis", weight: 16 },
  { key: "segment", label: "Segmenting into story units", weight: 6 },
  { key: "score", label: "Scoring virality per segment", weight: 6 },
  { key: "select", label: "Selecting the best clips", weight: 4 },
  { key: "subtitle", label: "Generating synced subtitles", weight: 6 },
  { key: "caption", label: "Applying viral caption styling", weight: 5 },
  { key: "render", label: "Rendering clips", weight: 3 },
  { key: "preview", label: "Preparing previews", weight: 2 },
];

export type Word = {
  /** word text as spoken */
  w: string;
  /** start seconds */
  s: number;
  /** end seconds */
  e: number;
  /** ASR confidence 0..1 */
  c?: number;
};

export type CaptionToken = {
  text: string;
  start: number;
  end: number;
  /** emphasised (bigger + accent colour) */
  emph?: boolean;
  /** semantic highlight class */
  hl?: "name" | "number" | "money" | "keyword" | "quote" | "hook";
  emoji?: string;
};

export type CaptionCue = {
  start: number;
  end: number;
  tokens: CaptionToken[];
};

export type ClipReason = {
  label: string;
  detail: string;
  weight: number;
};

export type SegmentCandidate = {
  start: number;
  end: number;
  title: string;
  hook: string;
  summary: string;
  topics: string[];
  signals: {
    hook: number;
    humor: number;
    emotion: number;
    curiosity: number;
    surprise: number;
    controversy: number;
    education: number;
    motivation: number;
    storyCompleteness: number;
    pace: number;
    ending: number;
  };
};

export type AnalysisResult = {
  engine: "llm" | "local";
  language: string;
  overview: string;
  segments: SegmentCandidate[];
};

export type ClipSettings = {
  subtitles: boolean;
  viralCaption: boolean;
  keywordHighlight: boolean;
  autoEmoji: boolean;
  silenceRemoval: boolean;
  smartZoom: boolean;
  stylePreset: string;
  font: string;
  fontSize: number;
  outline: number;
  shadow: number;
  opacity: number;
  background: "none" | "solid" | "blur";
  align: "top" | "center" | "bottom";
  marginY: number;
  animation: "none" | "pop" | "fade" | "bounce" | "slide";
  reveal: "word" | "line";
  aspect: "9:16" | "16:9" | "1:1";
  uppercase: boolean;

  /* ---- framing ----
   * The auto framing is a *suggestion*: it seeds these three values and is
   * always overridable. Once the user drags or nudges the frame, cropMode
   * flips to "manual" and auto never touches it again. These exact values
   * drive both the browser preview and the ffmpeg crop filter, so what the
   * user positions is what gets rendered.
   */
  /** output layout preset — see core/domain/templates.ts. Layout only. */
  template: string;

  /* ---- background framing ----
   * Which part of the source is shown in a template's video-derived backdrop.
   * Same -100..100 / 1..3 space as the scene framing, and resolved by the same
   * computeCrop(), so any template with such a backdrop gets drag/zoom/reset
   * without adding logic of its own.
   */
  bgZoom: number;
  bgX: number;
  bgY: number;

  cropMode: "auto" | "manual";
  /** 1 = fill the frame edge to edge; higher zooms further in */
  cropZoom: number;
  /** -100 (hard left) … 0 (centre) … 100 (hard right), as % of available pan */
  cropX: number;
  /** -100 (top) … 0 (centre) … 100 (bottom), as % of available pan */
  cropY: number;
};

export const DEFAULT_CLIP_SETTINGS: ClipSettings = {
  subtitles: true,
  viralCaption: true,
  keywordHighlight: true,
  autoEmoji: true,
  silenceRemoval: true,
  smartZoom: true,
  stylePreset: "tiktok",
  font: "Inter",
  fontSize: 46,
  outline: 3,
  shadow: 4,
  opacity: 100,
  background: "none",
  align: "bottom",
  marginY: 18,
  animation: "pop",
  reveal: "word",
  aspect: "9:16",
  uppercase: true,
  template: "fullscreen",
  bgZoom: 1,
  bgX: 0,
  bgY: 0,
  cropMode: "auto",
  cropZoom: 1,
  cropX: 0,
  cropY: 0,
};

export const CROP_LIMITS = {
  MIN_ZOOM: 1,
  MAX_ZOOM: 3,
  MIN_OFFSET: -100,
  MAX_OFFSET: 100,
} as const;

/**
 * Geometry shared by the preview and the renderer, so both frame the shot
 * identically. Returns the visible fraction of the source and where that
 * window sits, given a frame aspect and the user's crop settings.
 *
 * `fill: false` letterboxes instead (the whole source stays visible).
 */
export function computeCrop(opts: {
  frameAspect: number; // width / height of the output frame
  sourceAspect: number; // width / height of the source video
  zoom: number;
  offsetX: number; // -100..100
  offsetY: number; // -100..100
  fill: boolean;
}) {
  const { frameAspect, sourceAspect, fill } = opts;
  const zoom = clampNum(opts.zoom, CROP_LIMITS.MIN_ZOOM, CROP_LIMITS.MAX_ZOOM);

  if (!fill) {
    // Fit: whole source visible, bars fill the remainder. Nothing to pan.
    return { widthFraction: 1, heightFraction: 1, offsetXFraction: 0.5, offsetYFraction: 0.5, panX: 0, panY: 0 };
  }

  // Scale the source so it just covers the frame, then apply the user's zoom.
  const coverScale = Math.max(frameAspect / sourceAspect, 1) * zoom;
  const videoW = coverScale * sourceAspect;
  const videoH = coverScale;

  // Fraction of the source actually visible through the frame.
  const widthFraction = Math.min(1, frameAspect / videoW);
  const heightFraction = Math.min(1, 1 / videoH);

  // Available pan is whatever is left over, split either side of centre.
  const panX = (1 - widthFraction) / 2;
  const panY = (1 - heightFraction) / 2;

  const offsetX = clampNum(opts.offsetX, CROP_LIMITS.MIN_OFFSET, CROP_LIMITS.MAX_OFFSET) / 100;
  const offsetY = clampNum(opts.offsetY, CROP_LIMITS.MIN_OFFSET, CROP_LIMITS.MAX_OFFSET) / 100;

  return {
    widthFraction,
    heightFraction,
    /** left edge of the visible window, as a fraction of source width */
    offsetXFraction: panX + offsetX * panX,
    /** top edge of the visible window, as a fraction of source height */
    offsetYFraction: panY + offsetY * panY,
    /** how much pan headroom exists (0 = axis is locked at this zoom) */
    panX,
    panY,
  };
}

const clampNum = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

export const SOURCE_ASPECT = 16 / 9;

export const ASPECT_RATIO: Record<ClipSettings["aspect"], number> = {
  "9:16": 9 / 16,
  "1:1": 1,
  "16:9": 16 / 9,
};

export type ProjectInsight = {
  headline: string;
  bestClipIndex: number;
  bullets: string[];
  predictions: { retention: number; engagement: number; share: number };
};
