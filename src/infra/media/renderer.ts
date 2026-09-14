import "server-only";
import path from "node:path";
import { rm, writeFile } from "node:fs/promises";
import type { CaptionCue, ClipSettings } from "@/core/domain/types";
import { ASPECT_RATIO, SOURCE_ASPECT } from "@/core/domain/types";
import {
  normalizeScenes,
  sceneBounds,
  sceneWindows,
  scenesFromSettings,
  type Scene,
  type SceneWindow,
} from "@/core/domain/scenes";
import {
  backgroundWindow,
  getTemplate,
  templateGeometry,
  type TemplateLayout,
} from "@/core/domain/templates";
import { RESOLUTION_DIMS, type Resolution } from "@/core/domain/plans";
import { bin, detectCapabilities, run } from "./capabilities";
import { cuesToAss } from "./ass-subtitles";
import { fileSize } from "./storage";
import { logger } from "@/infra/log/logger";

const log = logger("renderer");

export type RenderRequest = {
  sourcePath: string;
  outDir: string;
  outName: string;
  startSec: number;
  endSec: number;
  cues: CaptionCue[];
  settings: ClipSettings;
  aspect: "9:16" | "16:9" | "1:1";
  resolution: Resolution;
  fps: 30 | 60;
  codec: "h264" | "h265";
  watermark: boolean;
  /** Manual scenes. One scene (or none) renders in a single pass. */
  scenes?: Scene[];
};

export type RenderResult = { filePath: string; bytes: number };

/**
 * Burns a clip with ffmpeg: trim -> reframe/crop -> burn subtitles ->
 * optional watermark -> encode.
 * Throws `RENDER_UNAVAILABLE` when ffmpeg is not installed, so callers can
 * fall back to the browser-side preview renderer.
 */
export async function renderClip(
  req: RenderRequest,
  onLog?: (line: string) => void,
): Promise<RenderResult> {
  const caps = await detectCapabilities();
  if (!caps.ffmpeg) throw new Error("RENDER_UNAVAILABLE");
  if (!req.sourcePath) throw new Error("RENDER_UNAVAILABLE");

  const dims = targetDims(req.aspect, req.resolution);
  const assPath = path.join(req.outDir, `${req.outName}.ass`);
  const outPath = path.join(req.outDir, `${req.outName}.mp4`);

  if (req.settings.subtitles && req.cues.length > 0) {
    // The template owns subtitle placement and scale; everything else about the
    // caption style still comes from the clip's own settings.
    const tpl = getTemplate(req.settings.template).layout.subtitle;
    const subtitleSettings: ClipSettings = {
      ...req.settings,
      align: tpl.align,
      marginY: tpl.marginY,
      fontSize: req.settings.fontSize * tpl.scale,
      background: tpl.background ?? req.settings.background,
    };
    await writeFile(assPath, cuesToAss(req.cues, subtitleSettings, dims), "utf8");
  }

  const duration = Math.max(0.1, req.endSec - req.startSec);
  const scenes = normalizeScenes(
    req.scenes?.length ? req.scenes : scenesFromSettings(req.settings),
    duration,
  );

  // Finishing filters run once over the whole clip, so subtitle timing stays
  // relative to the clip start regardless of how it was cut into scenes.
  const finishing: string[] = [];
  if (req.settings.subtitles && req.cues.length > 0) {
    finishing.push(`ass='${escapeFilterPath(assPath)}'`);
  }
  if (req.watermark) {
    finishing.push(
      `drawtext=text='Clipper AI':fontcolor=white@0.72:fontsize=${Math.round(dims.h / 42)}:x=w-tw-24:y=h-th-24:shadowcolor=black@0.6:shadowx=2:shadowy=2`,
    );
  }
  finishing.push(`fps=${req.fps}`);

  log.info("rendering", {
    outName: req.outName,
    aspect: req.aspect,
    resolution: req.resolution,
    scenes: scenes.length,
  });

  // Single scene: one pass, no intermediate files.
  if (scenes.length === 1) {
    await run(
      bin("ffmpeg"),
      [
        "-y",
        "-ss", req.startSec.toFixed(3),
        "-to", req.endSec.toFixed(3),
        "-i", req.sourcePath,
        ...sceneFilterArgs(scenes[0], req, dims, finishing),
        ...encodeArgs(req),
        outPath,
      ],
      { timeoutMs: 30 * 60_000, onLine: (l) => onLog?.(l) },
    );
    return { filePath: outPath, bytes: await fileSize(outPath) };
  }

  // Multiple scenes: render each with its own framing, then concatenate and
  // apply the finishing pass. Encoding per segment with identical parameters
  // keeps the concat demuxer happy.
  const segmentPaths: string[] = [];
  try {
    for (let i = 0; i < scenes.length; i++) {
      const { start, end } = sceneBounds(scenes, i, duration);
      const segPath = path.join(req.outDir, `${req.outName}.seg${i}.mp4`);
      segmentPaths.push(segPath);

      await run(
        bin("ffmpeg"),
        [
          "-y",
          "-ss", (req.startSec + start).toFixed(3),
          "-to", (req.startSec + end).toFixed(3),
          "-i", req.sourcePath,
          // No finishing filters here — subtitles are burned after the concat.
          ...sceneFilterArgs(scenes[i], req, dims, [`fps=${req.fps}`]),
          ...encodeArgs(req),
          segPath,
        ],
        { timeoutMs: 30 * 60_000, onLine: (l) => onLog?.(l) },
      );
    }

    const listPath = path.join(req.outDir, `${req.outName}.concat.txt`);
    await writeFile(
      listPath,
      segmentPaths.map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"),
      "utf8",
    );

    await run(
      bin("ffmpeg"),
      [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", listPath,
        "-vf", finishing.join(","),
        ...encodeArgs(req),
        outPath,
      ],
      { timeoutMs: 30 * 60_000, onLine: (l) => onLog?.(l) },
    );

    await rm(listPath, { force: true }).catch(() => {});
  } finally {
    // Intermediates are large; never leave them behind, even on failure.
    await Promise.all(segmentPaths.map((p) => rm(p, { force: true }).catch(() => {})));
  }

  return { filePath: outPath, bytes: await fileSize(outPath) };
}

/**
 * Builds the ffmpeg filter arguments for one scene.
 *
 * Two independent concerns compose here:
 *   - the *scene* decides which part of the source is shown (crop, zoom, split),
 *   - the *template* decides where that result sits in the output frame and
 *     what fills the space around it.
 *
 * The scene is rendered into the template's video rect, then composited onto
 * the template's backdrop. Neither knows about the other, so a new template
 * needs no changes here.
 */
function sceneFilterArgs(
  scene: Scene,
  req: RenderRequest,
  dims: { w: number; h: number },
  finishing: string[],
): string[] {
  const template = getTemplate(req.settings.template);
  const layout = template.layout;
  const geo = templateGeometry(layout, dims);

  const fullFrame =
    layout.background.kind === "none" &&
    geo.inner.w === dims.w &&
    geo.inner.h === dims.h &&
    geo.inner.x === 0 &&
    geo.inner.y === 0;

  /* ---------------------------------------- the scene, at video-rect size */

  const steps: string[] = [];
  const target = { w: geo.inner.w, h: geo.inner.h };

  if (!req.settings.smartZoom) {
    // "Fill frame" off: letterbox the whole source inside the rect.
    steps.push(
      `[0:v]scale=${target.w}:${target.h}:force_original_aspect_ratio=decrease:flags=lanczos,` +
        `pad=${target.w}:${target.h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1[fg]`,
    );
  } else {
    const windows = sceneWindows(scene.framing, target.w / target.h, SOURCE_ASPECT);
    if (windows.length === 1) {
      steps.push(`[0:v]${cropScale(windows[0], target)}[fg]`);
    } else {
      windows.forEach((w, i) => {
        const paneW = even(Math.round(target.w * w.dest.w));
        const paneH = even(Math.round(target.h * w.dest.h));
        steps.push(`[0:v]${cropScale(w, { w: paneW, h: paneH })}[p${i}]`);
      });
      steps.push(`[p0][p1]vstack=inputs=2[fg]`);
    }
  }

  // Fast path: nothing to composite, so skip the backdrop and overlay entirely.
  if (fullFrame) {
    steps.push(`[fg]${finishing.join(",")}[v]`);
    return ["-filter_complex", steps.join(";"), "-map", "[v]", "-map", "0:a?"];
  }

  /* ------------------------------------------------------------ backdrop */

  steps.push(backdropChain(layout.background, dims, req.fps, req.settings));

  /* ------------------------------- border, then composite onto the backdrop */

  let overlaid = "fg";
  if (geo.border > 0 && layout.border) {
    steps.push(
      `[fg]pad=${geo.outer.w}:${geo.outer.h}:${geo.border}:${geo.border}:${toFfmpegColor(layout.border.color)}[fgb]`,
    );
    overlaid = "fgb";
  }

  // shortest=1 matters: colour and gradient backdrops are generated sources
  // with no natural end, so without it the encode would never finish.
  steps.push(
    `[bg][${overlaid}]overlay=${geo.outer.x}:${geo.outer.y}:format=auto:shortest=1[comp]`,
  );
  steps.push(`[comp]${finishing.join(",")}[v]`);

  return ["-filter_complex", steps.join(";"), "-map", "[v]", "-map", "0:a?"];
}

/** Produces the `[bg]` stream a template draws behind its video rect. */
function backdropChain(
  background: TemplateLayout["background"],
  dims: { w: number; h: number },
  fps: number,
  settings: ClipSettings,
): string {
  switch (background.kind) {
    case "blur": {
      // A copy of the source, cropped to the window the user positioned, then
      // blurred and dimmed. The crop comes from the same backgroundWindow()
      // the preview uses, so the framing matches what was on screen.
      const win = backgroundWindow({
        frameAspect: dims.w / dims.h,
        sourceAspect: SOURCE_ASPECT,
        zoom: settings.bgZoom,
        offsetX: settings.bgX,
        offsetY: settings.bgY,
      });
      const cw = `trunc(iw*${win.widthFraction.toFixed(6)}/2)*2`;
      const ch = `trunc(ih*${win.heightFraction.toFixed(6)}/2)*2`;
      const cx = `trunc(iw*${win.offsetXFraction.toFixed(6)}/2)*2`;
      const cy = `trunc(ih*${win.offsetYFraction.toFixed(6)}/2)*2`;

      return (
        `[0:v]crop=${cw}:${ch}:${cx}:${cy},` +
        `scale=${dims.w}:${dims.h}:flags=fast_bilinear,gblur=sigma=${background.sigma},` +
        `eq=brightness=${(-background.dim).toFixed(2)}:saturation=0.85,setsar=1[bg]`
      );
    }
    case "color":
      return `color=c=${toFfmpegColor(background.color)}:s=${dims.w}x${dims.h}:r=${fps}[bg]`;
    case "gradient":
      return (
        `gradients=s=${dims.w}x${dims.h}:r=${fps}:c0=${toFfmpegColor(background.from)}:` +
        `c1=${toFfmpegColor(background.to)}:x0=0:y0=0:x1=0:y1=${dims.h}:n=2[bg]`
      );
    default:
      return `color=c=black:s=${dims.w}x${dims.h}:r=${fps}[bg]`;
  }
}

/** ffmpeg wants 0xRRGGBB, not #RRGGBB. */
const toFfmpegColor = (hex: string) => `0x${hex.replace("#", "")}`;

function cropScale(w: SceneWindow, dims: { w: number; h: number }): string {
  // Round to even pixels — some encoders reject odd crop dimensions.
  const cw = `trunc(iw*${w.crop.widthFraction.toFixed(6)}/2)*2`;
  const ch = `trunc(ih*${w.crop.heightFraction.toFixed(6)}/2)*2`;
  const cx = `trunc(iw*${w.crop.offsetXFraction.toFixed(6)}/2)*2`;
  const cy = `trunc(ih*${w.crop.offsetYFraction.toFixed(6)}/2)*2`;
  return `crop=${cw}:${ch}:${cx}:${cy},scale=${dims.w}:${dims.h}:flags=lanczos,setsar=1`;
}

const encodeArgs = (req: RenderRequest): string[] => [
  "-c:v", req.codec === "h265" ? "libx265" : "libx264",
  "-preset", "veryfast",
  "-crf", req.codec === "h265" ? "26" : "21",
  "-pix_fmt", "yuv420p",
  "-c:a", "aac",
  "-b:a", "160k",
  "-ar", "48000",
  "-movflags", "+faststart",
];

function targetDims(aspect: RenderRequest["aspect"], res: Resolution) {
  const base = RESOLUTION_DIMS[res];
  if (aspect === "9:16") return { w: even(base.w), h: even(base.h) };
  if (aspect === "1:1") return { w: even(base.w), h: even(base.w) };
  return { w: even(base.h), h: even(base.w) };
}

const even = (n: number) => (n % 2 === 0 ? n : n + 1);

/** ffmpeg filter args need Windows drive colons and backslashes escaped. */
function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/**
 * Estimates output size when no real encode happened, so the UI can still show
 * a realistic file size on the clip card.
 */
export function estimateBytes(durationSec: number, res: Resolution, fps: number): number {
  const bitrateMbps: Record<Resolution, number> = { "720p": 2.6, "1080p": 5.2, "2K": 9.5, "4K": 20 };
  const factor = fps === 60 ? 1.45 : 1;
  return Math.round((bitrateMbps[res] * factor * 1_000_000 * durationSec) / 8);
}
