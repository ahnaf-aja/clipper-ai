/**
 * Video output templates.
 *
 * A template is *layout only*. It decides where the video sits in the frame,
 * what fills the space around it, and how the subtitles are positioned — and
 * nothing else. The clip's in/out points, its manual scenes, and its caption
 * data are untouched, so switching template never re-runs analysis, never
 * rebuilds cues, and never invalidates an edit.
 *
 * Adding a template means adding one entry to TEMPLATES. Both the browser
 * preview and the ffmpeg renderer read the same `TemplateLayout`, so a new
 * preset needs no changes in either.
 */

import { computeCrop } from "./types";

/** Rectangle inside the output frame, as fractions of width/height. */
export type Rect = { x: number; y: number; w: number; h: number };

export type TemplateBackground =
  /** a blurred, zoomed copy of the video itself */
  | { kind: "blur"; sigma: number; dim: number }
  /** a flat colour */
  | { kind: "color"; color: string }
  /** vertical gradient between two colours */
  | { kind: "gradient"; from: string; to: string }
  /** nothing behind the video — it is expected to cover the frame */
  | { kind: "none" };

export type TemplateLayout = {
  background: TemplateBackground;
  /** where the video sits; {0,0,1,1} is the whole frame */
  video: Rect;
  /** how the video fills its rect */
  fit: "cover" | "contain";
  /** corner rounding, as a fraction of the frame width */
  radius: number;
  border: { width: number; color: string } | null;
  subtitle: {
    align: "top" | "center" | "bottom";
    /** distance from the chosen edge, as % of frame height */
    marginY: number;
    /** multiplier applied to the clip's own font size */
    scale: number;
    /** null keeps whatever the clip's caption style already uses */
    background: "none" | "solid" | "blur" | null;
  };
};

export type VideoTemplate = {
  id: string;
  name: string;
  description: string;
  /** one-line note about what this is good for */
  bestFor: string;
  layout: TemplateLayout;
};

export const TEMPLATES: VideoTemplate[] = [
  {
    id: "fullscreen",
    name: "Fullscreen",
    description: "Video fills the frame. Subtitles at the bottom, nothing behind them.",
    bestFor: "Talking head, gameplay, anything already shot vertical.",
    layout: {
      background: { kind: "none" },
      video: { x: 0, y: 0, w: 1, h: 1 },
      fit: "cover",
      radius: 0,
      border: null,
      subtitle: { align: "bottom", marginY: 16, scale: 1, background: "none" },
    },
  },
  {
    id: "standard",
    name: "Standard Podcast",
    description: "Video centred at readable size, blurred backdrop, subtitles below it.",
    bestFor: "Podcasts and interviews where faces need room.",
    layout: {
      background: { kind: "blur", sigma: 28, dim: 0.28 },
      video: { x: 0.04, y: 0.2, w: 0.92, h: 0.44 },
      fit: "cover",
      radius: 0.045,
      border: null,
      subtitle: { align: "bottom", marginY: 24, scale: 1, background: "none" },
    },
  },
  {
    id: "cinematic",
    name: "Cinematic",
    description: "Tall video, heavily blurred and dimmed backdrop, oversized subtitles.",
    bestFor: "Dramatic or emotional moments that should feel like a trailer.",
    layout: {
      background: { kind: "blur", sigma: 45, dim: 0.45 },
      video: { x: 0, y: 0.12, w: 1, h: 0.66 },
      fit: "cover",
      radius: 0,
      border: null,
      subtitle: { align: "bottom", marginY: 14, scale: 1.25, background: "none" },
    },
  },
  {
    id: "split",
    name: "Split Layout",
    description: "Video in the upper half with a framed border, captions in the lower panel.",
    bestFor: "Two-speaker interviews, reaction clips, anything with a split scene.",
    layout: {
      background: { kind: "gradient", from: "#141426", to: "#05050b" },
      video: { x: 0.05, y: 0.11, w: 0.9, h: 0.46 },
      fit: "cover",
      radius: 0.05,
      border: { width: 0.008, color: "#7c5cff" },
      // The video ends at 57% of the frame; this centres the captions in the
      // empty panel below it rather than letting them sit over the picture.
      subtitle: { align: "bottom", marginY: 21, scale: 1.1, background: "none" },
    },
  },
];

export const DEFAULT_TEMPLATE_ID = "fullscreen";

export const getTemplate = (id: string): VideoTemplate =>
  TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);

/**
 * Whether a template's backdrop is derived from the video, and therefore has
 * something to reposition. Colour and gradient backdrops have no framing.
 *
 * This is the single gate for the drag/zoom/reset controls — a new template
 * with a `blur` background gets them automatically.
 */
export const backgroundIsAdjustable = (layout: TemplateLayout): boolean =>
  layout.background.kind === "blur";

/**
 * The part of the source shown in a template's backdrop.
 *
 * Deliberately the same `computeCrop` the scene framing uses, in the same
 * -100..100 / 1..3 space, so the two behave identically for the user and share
 * one implementation. Preview and ffmpeg both build from this result.
 */
export function backgroundWindow(opts: {
  frameAspect: number;
  sourceAspect: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
}) {
  return computeCrop({
    frameAspect: opts.frameAspect,
    sourceAspect: opts.sourceAspect,
    zoom: opts.zoom,
    offsetX: opts.offsetX,
    offsetY: opts.offsetY,
    // A backdrop always covers the frame; there is nothing to letterbox into.
    fill: true,
  });
}

export const DEFAULT_BACKGROUND_FRAMING = { bgZoom: 1, bgX: 0, bgY: 0 } as const;

/**
 * Pixel geometry for a template at a given output size.
 * Both renderers derive from this so they cannot disagree.
 */
export function templateGeometry(
  layout: TemplateLayout,
  size: { w: number; h: number },
) {
  const even = (n: number) => {
    const r = Math.round(n);
    return r % 2 === 0 ? r : r + 1;
  };

  const border = layout.border ? even(layout.border.width * size.w) : 0;

  // The rect includes the border, so the video itself is inset by it.
  const outer = {
    x: even(layout.video.x * size.w),
    y: even(layout.video.y * size.h),
    w: even(layout.video.w * size.w),
    h: even(layout.video.h * size.h),
  };
  const inner = {
    x: even(outer.x + border),
    y: even(outer.y + border),
    w: Math.max(2, even(outer.w - border * 2)),
    h: Math.max(2, even(outer.h - border * 2)),
  };

  return { outer, inner, border, radius: Math.round(layout.radius * size.w) };
}
