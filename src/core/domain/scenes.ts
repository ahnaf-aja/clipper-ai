import { computeCrop, CROP_LIMITS, type ClipSettings } from "./types";

/**
 * Manual scene editing.
 *
 * A clip is divided into scenes by user-placed cut points. Every scene owns its
 * framing outright, so changing one never touches another. There is no tracking
 * or automatic reframing here by design — the user has full control.
 *
 * A scene's `start` is seconds relative to the clip's own start (so trimming the
 * clip does not invalidate the scene list). The first scene always starts at 0;
 * a scene runs until the next scene's start, or the end of the clip.
 */

export type ScenePreset = "full" | "left" | "right" | "split" | "custom";

export type SceneFraming = {
  preset: ScenePreset;
  /** "single" fills the frame with one window; "split" stacks two windows. */
  layout: "single" | "split";
  /** primary window (the only one when layout is "single") */
  zoom: number;
  x: number;
  y: number;
  /** second window, used only when layout is "split" */
  zoomB: number;
  xB: number;
  yB: number;
};

export type Scene = {
  id: string;
  /** seconds from the start of the clip */
  start: number;
  framing: SceneFraming;
};

export const PRESET_LABELS: Record<ScenePreset, string> = {
  full: "Full Frame",
  left: "Left Speaker",
  right: "Right Speaker",
  split: "Split Screen",
  custom: "Custom",
};

/** Shortest scene the user may create, so cuts stay meaningful and renderable. */
export const MIN_SCENE_SEC = 0.5;

/**
 * Zoom at which a split pane shows exactly half the source width, so the two
 * panes tile the frame instead of both showing the middle.
 *
 * A pane is twice as wide as the frame relative to its height, so at zoom 1 it
 * already covers ~63% of a 16:9 source — the two panes would overlap heavily.
 * Solving `widthFraction = 0.5` gives this factor.
 */
function splitZoom(frameAspect: number, sourceAspect: number): number {
  const paneAspect = frameAspect * 2;
  const zoom = (2 * paneAspect) / sourceAspect;
  return Math.min(CROP_LIMITS.MAX_ZOOM, Math.max(CROP_LIMITS.MIN_ZOOM, round2(zoom)));
}

export function framingForPreset(
  preset: ScenePreset,
  frameAspect = 9 / 16,
  sourceAspect = 16 / 9,
): SceneFraming {
  const base = { zoomB: 1, xB: 100, yB: 0 };
  switch (preset) {
    case "left":
      // Pan the window to the left edge of the source.
      return { preset, layout: "single", zoom: 1, x: -100, y: 0, ...base };
    case "right":
      return { preset, layout: "single", zoom: 1, x: 100, y: 0, ...base };
    case "split": {
      // Top pane shows the left half of the source, bottom shows the right.
      const z = splitZoom(frameAspect, sourceAspect);
      return { preset, layout: "split", zoom: z, x: -100, y: 0, zoomB: z, xB: 100, yB: 0 };
    }
    case "full":
    default:
      return { preset: "full", layout: "single", zoom: 1, x: 0, y: 0, ...base };
  }
}

export const defaultScene = (): Scene => ({
  id: newSceneId(),
  start: 0,
  framing: framingForPreset("full"),
});

export const newSceneId = () =>
  `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * Normalises a scene list: sorts it, forces the first scene to 0, drops scenes
 * that are too short or past the end, and guarantees at least one scene.
 */
export function normalizeScenes(scenes: Scene[], durationSec: number): Scene[] {
  if (!Array.isArray(scenes) || scenes.length === 0) return [defaultScene()];

  const sorted = [...scenes]
    .filter((s) => s && Number.isFinite(s.start) && s.start >= 0 && s.start < durationSec)
    .sort((a, b) => a.start - b.start);

  if (sorted.length === 0) return [defaultScene()];

  const out: Scene[] = [];
  for (const scene of sorted) {
    const prev = out[out.length - 1];
    // Collapse cuts that sit on top of each other.
    if (prev && scene.start - prev.start < MIN_SCENE_SEC) continue;
    out.push({
      id: scene.id || newSceneId(),
      start: out.length === 0 ? 0 : round2(scene.start),
      framing: sanitizeFraming(scene.framing),
    });
  }

  // The list must start at 0 or the opening of the clip has no framing.
  if (out.length === 0) return [defaultScene()];
  out[0] = { ...out[0], start: 0 };

  // A trailing scene with no room left is meaningless.
  while (out.length > 1 && durationSec - out[out.length - 1].start < MIN_SCENE_SEC) out.pop();

  return out;
}

function sanitizeFraming(f: Partial<SceneFraming> | undefined): SceneFraming {
  const fallback = framingForPreset("full");
  if (!f) return fallback;
  const layout = f.layout === "split" ? "split" : "single";
  return {
    preset: (["full", "left", "right", "split", "custom"] as const).includes(f.preset as ScenePreset)
      ? (f.preset as ScenePreset)
      : "custom",
    layout,
    zoom: clamp(f.zoom ?? 1, CROP_LIMITS.MIN_ZOOM, CROP_LIMITS.MAX_ZOOM),
    x: clamp(f.x ?? 0, CROP_LIMITS.MIN_OFFSET, CROP_LIMITS.MAX_OFFSET),
    y: clamp(f.y ?? 0, CROP_LIMITS.MIN_OFFSET, CROP_LIMITS.MAX_OFFSET),
    zoomB: clamp(f.zoomB ?? 1, CROP_LIMITS.MIN_ZOOM, CROP_LIMITS.MAX_ZOOM),
    xB: clamp(f.xB ?? 100, CROP_LIMITS.MIN_OFFSET, CROP_LIMITS.MAX_OFFSET),
    yB: clamp(f.yB ?? 0, CROP_LIMITS.MIN_OFFSET, CROP_LIMITS.MAX_OFFSET),
  };
}

/** The scene covering `t` seconds into the clip. */
export function sceneAt(scenes: Scene[], t: number): Scene {
  let current = scenes[0];
  for (const s of scenes) {
    if (s.start <= t + 1e-6) current = s;
    else break;
  }
  return current;
}

export function sceneBounds(
  scenes: Scene[],
  index: number,
  durationSec: number,
): { start: number; end: number } {
  const start = scenes[index]?.start ?? 0;
  const end = index + 1 < scenes.length ? scenes[index + 1].start : durationSec;
  return { start, end };
}

/**
 * The source windows a scene renders, expressed as fractions of the source and
 * of the output frame. Preview and ffmpeg both build from this, so they cannot
 * disagree about what a scene looks like.
 */
export type SceneWindow = {
  /** crop window in the source, as fractions 0..1 */
  crop: ReturnType<typeof computeCrop>;
  /** destination rectangle inside the output frame, as fractions 0..1 */
  dest: { x: number; y: number; w: number; h: number };
};

export function sceneWindows(
  framing: SceneFraming,
  frameAspect: number,
  sourceAspect: number,
): SceneWindow[] {
  if (framing.layout === "split") {
    // Two stacked panes; each pane is twice as wide as it is tall relative to
    // the full frame, so its aspect is 2 x the frame aspect.
    const paneAspect = frameAspect * 2;
    return [
      {
        crop: computeCrop({
          frameAspect: paneAspect,
          sourceAspect,
          zoom: framing.zoom,
          offsetX: framing.x,
          offsetY: framing.y,
          fill: true,
        }),
        dest: { x: 0, y: 0, w: 1, h: 0.5 },
      },
      {
        crop: computeCrop({
          frameAspect: paneAspect,
          sourceAspect,
          zoom: framing.zoomB,
          offsetX: framing.xB,
          offsetY: framing.yB,
          fill: true,
        }),
        dest: { x: 0, y: 0.5, w: 1, h: 0.5 },
      },
    ];
  }

  return [
    {
      crop: computeCrop({
        frameAspect,
        sourceAspect,
        zoom: framing.zoom,
        offsetX: framing.x,
        offsetY: framing.y,
        fill: true,
      }),
      dest: { x: 0, y: 0, w: 1, h: 1 },
    },
  ];
}

/** Back-compat: a clip with no scenes uses its top-level crop settings. */
export function scenesFromSettings(settings: ClipSettings): Scene[] {
  return [
    {
      id: "s_legacy",
      start: 0,
      framing: {
        preset: "custom",
        layout: "single",
        zoom: settings.cropZoom,
        x: settings.cropX,
        y: settings.cropY,
        zoomB: 1,
        xB: 100,
        yB: 0,
      },
    },
  ];
}

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
const round2 = (n: number) => Math.round(n * 100) / 100;
