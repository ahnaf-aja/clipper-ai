"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Move, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import type { CaptionCue, ClipSettings } from "@/core/domain/types";
import { ASPECT_RATIO, CROP_LIMITS, SOURCE_ASPECT } from "@/core/domain/types";
import {
  sceneAt,
  sceneWindows,
  type Scene,
  type SceneFraming,
  type SceneWindow,
} from "@/core/domain/scenes";
import {
  backgroundIsAdjustable,
  backgroundWindow,
  getTemplate,
  type TemplateLayout,
} from "@/core/domain/templates";
import { CaptionLayer } from "./caption-layer";
import { cn, timecode } from "@/lib/utils";

/* --- minimal typings for the YouTube IFrame API we actually use --- */
type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  mute(): void;
  unMute(): void;
  destroy(): void;
};
declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement | string, opts: Record<string, unknown>) => YTPlayer;
      PlayerState: { PLAYING: number; ENDED: number; PAUSED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

type PlayerRef = React.RefObject<YTPlayer | null>;

/**
 * Calls a method on a YouTube player defensively.
 *
 * `new YT.Player()` returns an object immediately, but its methods are only
 * attached once *that* player fires its own onReady. With two players the
 * second is usually still bare when the first is ready, so a plain `?.` is not
 * enough — the object exists, the method does not. Calls before readiness are
 * dropped, which is always the right behaviour here: the player's own onReady
 * handler puts it into the correct state.
 */
function invoke(ref: PlayerRef, method: keyof YTPlayer, ...args: unknown[]): void {
  const player = ref.current as unknown as Record<string, unknown> | null;
  const fn = player?.[method];
  if (typeof fn !== "function") return;
  try {
    (fn as (...a: unknown[]) => unknown).apply(player, args);
  } catch {
    /* player was torn down mid-call */
  }
}

/** Reads the playhead, or null when the player is not ready. */
function readTime(ref: PlayerRef): number | null {
  const player = ref.current as unknown as Record<string, unknown> | null;
  const fn = player?.getCurrentTime;
  if (typeof fn !== "function") return null;
  try {
    const t = (fn as () => number).call(player);
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

let apiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  });
  return apiPromise;
}

export type FramingPatch = Partial<Pick<SceneFraming, "x" | "y" | "xB" | "yB">>;

/**
 * Real-time clip preview.
 *
 * Plays the source through the YouTube IFrame API, constrained to the clip's
 * in/out points, and composites captions on top at the chosen aspect ratio.
 * Framing follows the manual scene under the playhead, using the same
 * `sceneWindows` geometry the ffmpeg renderer uses, so the preview is an
 * accurate proxy for the export.
 *
 * Split-screen scenes need the video visible twice at once, which one iframe
 * cannot do, so a second muted player is mounted and kept in sync with the
 * first. It only exists while a split scene is present.
 */
export function ClipPlayer({
  videoId,
  startSec,
  endSec,
  cues,
  settings,
  scenes,
  className,
  autoLoop = true,
  posterUrl,
  onFramingChange,
  onBackgroundChange,
  onTimeChange,
  seekRequest,
}: {
  videoId: string;
  startSec: number;
  endSec: number;
  cues: CaptionCue[];
  settings: ClipSettings;
  scenes: Scene[];
  className?: string;
  autoLoop?: boolean;
  /** thumbnail used for the blurred backdrop in templates that have one */
  posterUrl?: string;
  /** Called while the user drags the frame. Omit to make the frame fixed. */
  onFramingChange?: (sceneId: string, patch: FramingPatch) => void;
  /** Called while the user drags the template backdrop. */
  onBackgroundChange?: (patch: { bgX: number; bgY: number }) => void;
  /** Playhead position, in seconds from the clip start. */
  onTimeChange?: (t: number) => void;
  /** Bump this to seek; the value is seconds from the clip start. */
  seekRequest?: { t: number; nonce: number };
}) {
  const primaryHost = useRef<HTMLDivElement>(null);
  const secondaryHost = useRef<HTMLDivElement>(null);
  const primary = useRef<YTPlayer | null>(null);
  const secondary = useRef<YTPlayer | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState(0); // seconds into the clip
  const [blocked, setBlocked] = useState(false);
  const [dragging, setDragging] = useState<null | 0 | 1>(null);
  const [draggingBg, setDraggingBg] = useState(false);
  /** Readable from player callbacks, which close over stale state. */
  const playingRef = useRef(false);

  const duration = Math.max(0.1, endSec - startSec);
  const active = sceneAt(scenes, time);
  const needsSplit = scenes.some((s) => s.framing.layout === "split");

  const bounds = useRef({ startSec, endSec, autoLoop, needsSplit });
  bounds.current = { startSec, endSec, autoLoop, needsSplit };

  /* ------------------------------------------------------------- players */

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;

    const common = {
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
      start: Math.floor(startSec),
    };

    loadYouTubeApi().then(() => {
      if (cancelled || !window.YT) return;

      if (primaryHost.current) {
        primary.current = new window.YT.Player(primaryHost.current, {
          videoId,
          playerVars: { ...common, origin: window.location.origin },
          events: {
            onReady: () => {
              if (cancelled) return;
              clearTimeout(timeout);
              setReady(true);
              invoke(primary, "seekTo", bounds.current.startSec, true);
            },
            onError: () => setBlocked(true),
            onStateChange: (e: { data: number }) => {
              const isPlaying = e.data === window.YT?.PlayerState.PLAYING;
              setPlaying(isPlaying);
              playingRef.current = isPlaying;
              // Mirror transport state onto the split-screen companion.
              if (isPlaying && bounds.current.needsSplit) invoke(secondary, "playVideo");
              else invoke(secondary, "pauseVideo");
            },
          },
        });
      }

      if (secondaryHost.current) {
        secondary.current = new window.YT.Player(secondaryHost.current, {
          videoId,
          playerVars: { ...common, origin: window.location.origin, mute: 1 },
          events: {
            onReady: () => {
              if (cancelled) return;
              invoke(secondary, "mute");
              // Catch up to whatever the primary is doing right now — this
              // player usually becomes ready after the primary has started.
              const abs = readTime(primary) ?? bounds.current.startSec;
              invoke(secondary, "seekTo", abs, true);
              if (bounds.current.needsSplit && playingRef.current) {
                invoke(secondary, "playVideo");
              } else {
                invoke(secondary, "pauseVideo");
              }
            },
          },
        });
      }

      timeout = setTimeout(() => {
        if (!cancelled) setBlocked((b) => (primary.current ? b : true));
      }, 12_000);
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      cancelAnimationFrame(rafRef.current);
      // destroy() is also absent until a player is ready, so guard it too.
      invoke(primary, "destroy");
      invoke(secondary, "destroy");
      primary.current = null;
      secondary.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  /* --------------------------------------------------- clock + sync loop */

  useEffect(() => {
    if (!ready) return;

    const loop = () => {
      const abs = readTime(primary);
      if (abs !== null) {
        const { startSec: s, endSec: e, autoLoop: al, needsSplit: split } = bounds.current;

        if (abs >= e - 0.03) {
          if (al) {
            invoke(primary, "seekTo", s, true);
            invoke(secondary, "seekTo", s, true);
          } else {
            invoke(primary, "pauseVideo");
            setPlaying(false);
            playingRef.current = false;
          }
        } else if (abs < s - 0.6) {
          invoke(primary, "seekTo", s, true);
        }

        // Keep the companion aligned; correct only on real drift so we do not
        // thrash the player with constant seeks.
        if (split) {
          const secTime = readTime(secondary);
          if (secTime !== null && Math.abs(secTime - abs) > 0.3) {
            invoke(secondary, "seekTo", abs, true);
          }
        }

        const rel = Math.max(0, Math.min(e - s, abs - s));
        setTime(rel);
        onTimeChange?.(rel);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ready, onTimeChange]);

  // Pause the companion when no scene needs it, so it stops buffering.
  // Safe to run before it is ready: the call is dropped, and its own onReady
  // puts it into the right state.
  useEffect(() => {
    if (!ready) return;
    if (!needsSplit) invoke(secondary, "pauseVideo");
    else if (playing) invoke(secondary, "playVideo");
  }, [needsSplit, playing, ready]);

  useEffect(() => {
    if (ready) invoke(primary, "seekTo", startSec, true);
  }, [startSec, ready]);

  // External seek (clicking a scene in the timeline).
  useEffect(() => {
    if (!ready || !seekRequest) return;
    const abs = startSec + seekRequest.t;
    invoke(primary, "seekTo", abs, true);
    invoke(secondary, "seekTo", abs, true);
    setTime(seekRequest.t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest?.nonce, ready]);

  /* ---------------------------------------------------------- transport */

  const toggle = useCallback(() => {
    invoke(primary, playing ? "pauseVideo" : "playVideo");
  }, [playing]);

  const restart = useCallback(() => {
    invoke(primary, "seekTo", bounds.current.startSec, true);
    invoke(secondary, "seekTo", bounds.current.startSec, true);
    invoke(primary, "playVideo");
  }, []);

  const toggleMute = useCallback(() => {
    invoke(primary, muted ? "unMute" : "mute");
    setMuted(!muted);
  }, [muted]);

  const scrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    invoke(primary, "seekTo", startSec + t, true);
    invoke(secondary, "seekTo", startSec + t, true);
    setTime(t);
    onTimeChange?.(t);
  };

  /* ------------------------------------------------------------ framing */

  const ratio = ASPECT_RATIO[settings.aspect];
  const fill = settings.smartZoom;
  const windows = fill
    ? sceneWindows(active.framing, ratio, SOURCE_ASPECT)
    : [fitWindow(ratio)];

  const template = getTemplate(settings.template);
  const layout = template.layout;
  const isSplitScene = windows.length === 2;

  const canPan =
    Boolean(onFramingChange) && fill && windows.some((w) => w.crop.panX > 0.001 || w.crop.panY > 0.001);

  const bgAdjustable = backgroundIsAdjustable(layout);
  const bgCrop = bgAdjustable
    ? backgroundWindow({
        frameAspect: ratio,
        sourceAspect: SOURCE_ASPECT,
        zoom: settings.bgZoom,
        offsetX: settings.bgX,
        offsetY: settings.bgY,
      })
    : null;

  const canPanBackground =
    Boolean(onBackgroundChange) &&
    bgAdjustable &&
    Boolean(bgCrop && (bgCrop.panX > 0.001 || bgCrop.panY > 0.001));

  /** Same drag maths as the panes, against the full frame. */
  const startBackgroundDrag = (e: React.PointerEvent) => {
    if (!canPanBackground || !onBackgroundChange || !bgCrop) return;
    const box = frameRef.current?.getBoundingClientRect();
    if (!box) return;

    const originX = e.clientX;
    const originY = e.clientY;
    const fromX = settings.bgX;
    const fromY = settings.bgY;
    let moved = false;

    const rangeXpx = (bgCrop.panX / bgCrop.widthFraction) * box.width;
    const rangeYpx = (bgCrop.panY / bgCrop.heightFraction) * box.height;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - originX;
      const dy = ev.clientY - originY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      setDraggingBg(true);

      onBackgroundChange({
        bgX: clamp(
          rangeXpx > 0 ? fromX - (dx / rangeXpx) * 100 : fromX,
          CROP_LIMITS.MIN_OFFSET,
          CROP_LIMITS.MAX_OFFSET,
        ),
        bgY: clamp(
          rangeYpx > 0 ? fromY - (dy / rangeYpx) * 100 : fromY,
          CROP_LIMITS.MIN_OFFSET,
          CROP_LIMITS.MAX_OFFSET,
        ),
      });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDraggingBg(false);
      if (!moved) toggle();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /** Converts a pixel drag into a change in the -100..100 offset space. */
  const startDrag = (paneIndex: 0 | 1) => (e: React.PointerEvent) => {
    if (!canPan || !onFramingChange) return;
    const box = frameRef.current?.getBoundingClientRect();
    const win = windows[paneIndex];
    if (!box || !win) return;

    // Panes are laid out inside the template's video rect, not the whole frame.
    const paneW = box.width * layout.video.w * win.dest.w;
    const paneH = box.height * layout.video.h * win.dest.h;
    const originX = e.clientX;
    const originY = e.clientY;
    const f = active.framing;
    const fromX = paneIndex === 0 ? f.x : f.xB;
    const fromY = paneIndex === 0 ? f.y : f.yB;
    let moved = false;

    const rangeXpx = (win.crop.panX / win.crop.widthFraction) * paneW;
    const rangeYpx = (win.crop.panY / win.crop.heightFraction) * paneH;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - originX;
      const dy = ev.clientY - originY;
      if (!moved && Math.hypot(dx, dy) < 4) return; // let a tap stay a tap
      moved = true;
      setDragging(paneIndex);

      // Dragging right reveals content to the left, so the window moves left.
      const nextX = rangeXpx > 0 ? fromX - (dx / rangeXpx) * 100 : fromX;
      const nextY = rangeYpx > 0 ? fromY - (dy / rangeYpx) * 100 : fromY;
      const cx = clamp(nextX, CROP_LIMITS.MIN_OFFSET, CROP_LIMITS.MAX_OFFSET);
      const cy = clamp(nextY, CROP_LIMITS.MIN_OFFSET, CROP_LIMITS.MAX_OFFSET);

      onFramingChange(
        active.id,
        paneIndex === 0 ? { x: cx, y: cy } : { xB: cx, yB: cy },
      );
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragging(null);
      if (!moved) toggle();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        ref={frameRef}
        className="relative mx-auto overflow-hidden rounded-2xl bg-black ring-1 ring-white/10"
        /*
         * Derive the width from the height cap rather than pairing
         * `aspect-ratio` with `max-height`: that combination lets CSS clamp the
         * height while the width stays at 100%, silently breaking the ratio and
         * stretching the video. Constraining width alone keeps the box exact.
         */
        style={{
          aspectRatio: String(ratio),
          width: `min(100%, calc(min(66vh, 620px) * ${ratio}))`,
        }}
      >
        {/* Backdrop sits behind everything the template draws. */}
        <TemplateBackdrop
          background={layout.background}
          poster={posterUrl}
          crop={bgCrop}
          dragging={draggingBg}
          onPointerDown={canPanBackground ? startBackgroundDrag : undefined}
        />

        {/* The video rect the template defines. Panes are laid out inside it,
            so scenes and templates compose without either knowing the other. */}
        <div
          className="absolute overflow-hidden"
          style={{
            left: `${layout.video.x * 100}%`,
            top: `${layout.video.y * 100}%`,
            width: `${layout.video.w * 100}%`,
            height: `${layout.video.h * 100}%`,
            borderRadius: layout.radius ? `${layout.radius * 100}%` : undefined,
            border: layout.border
              ? `${Math.max(1, layout.border.width * 100)}cqw solid ${layout.border.color}`
              : undefined,
            boxShadow: layout.background.kind !== "none" ? "0 18px 50px -12px rgba(0,0,0,.65)" : undefined,
            background: "#000",
            /*
             * No CSS transition here on purpose. This component re-renders on
             * every animation frame to drive the playhead, and a transition on
             * layout properties never settles under that — it sticks at its
             * start value, leaving the video rect permanently full-frame.
             * Template switches are instant instead, which is fine.
             */
          }}
        >
          {/* Pane 0 always exists; pane 1 only renders for split scenes, but its
              host stays mounted so the companion player is never torn down. */}
          <Pane
            win={windows[0]}
            hostRef={primaryHost}
            dragging={dragging === 0}
            onPointerDown={canPan ? startDrag(0) : undefined}
            onTap={toggle}
          />
          <Pane
            win={windows[1]}
            hostRef={secondaryHost}
            hidden={!isSplitScene}
            dragging={dragging === 1}
            onPointerDown={canPan ? startDrag(1) : undefined}
            onTap={toggle}
          />

          {isSplitScene && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-px bg-white/25" aria-hidden />
          )}
        </div>

        {settings.subtitles && (
          <CaptionLayer
            cues={cues}
            settings={{
              ...settings,
              align: layout.subtitle.align,
              marginY: layout.subtitle.marginY,
              fontSize: settings.fontSize * layout.subtitle.scale,
              background: layout.subtitle.background ?? settings.background,
            }}
            time={time}
            scale={0.34}
          />
        )}

        {!ready && !blocked && (
          <div className="absolute inset-0 grid place-items-center bg-ink-900/80">
            <div className="flex flex-col items-center gap-2 text-ink-300">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-[12px]">Loading preview…</span>
            </div>
          </div>
        )}

        {blocked && (
          <div className="absolute inset-0 grid place-items-center bg-ink-900/90 p-6 text-center">
            <p className="max-w-xs text-[13px] leading-relaxed text-ink-300">
              This video&apos;s owner has disabled embedded playback, so the live preview is
              unavailable. Captions, scenes and timings are still correct and will export normally.
            </p>
          </div>
        )}

        {/* Rule-of-thirds guides while repositioning, so faces can be aligned. */}
        {dragging !== null && (
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div className="absolute inset-y-0 left-1/3 w-px bg-white/25" />
            <div className="absolute inset-y-0 left-2/3 w-px bg-white/25" />
            <div className="absolute inset-x-0 top-1/3 h-px bg-white/25" />
            <div className="absolute inset-x-0 top-2/3 h-px bg-white/25" />
            <div className="absolute inset-0 ring-2 ring-inset ring-brand-500/50" />
          </div>
        )}

        {ready && !blocked && dragging === null && (
          <button
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="group pointer-events-none absolute inset-0 grid place-items-center focus-visible:outline-none"
          >
            <span
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm transition-all",
                playing ? "opacity-0" : "opacity-100",
              )}
            >
              {playing ? (
                <Pause className="h-6 w-6 text-white" />
              ) : (
                <Play className="ml-0.5 h-6 w-6 text-white" />
              )}
            </span>
          </button>
        )}

        {ready && !blocked && dragging === null && !draggingBg && (canPan || canPanBackground) && (
          <span className="pointer-events-none absolute bottom-2.5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white/85 backdrop-blur-sm">
            <Move className="h-3 w-3" />
            {canPan && canPanBackground
              ? "Drag video · drag outside for background"
              : canPanBackground
                ? "Drag the background to reposition"
                : "Drag to reposition"}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          disabled={!ready}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-750 text-ink-100 transition-colors hover:bg-ink-700 disabled:opacity-40"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <button
          onClick={restart}
          disabled={!ready}
          aria-label="Restart clip"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-750 text-ink-100 transition-colors hover:bg-ink-700 disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-300">
          {timecode(time)}
        </span>

        <input
          type="range"
          min={0}
          max={duration}
          step={0.05}
          value={time}
          onChange={scrub}
          disabled={!ready}
          aria-label="Seek within clip"
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full outline-none
            [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
          style={{
            background: `linear-gradient(to right, var(--color-brand-500) ${(time / duration) * 100}%, var(--color-ink-700) ${(time / duration) * 100}%)`,
          }}
        />

        <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-400">
          {timecode(duration)}
        </span>

        <button
          onClick={toggleMute}
          disabled={!ready}
          aria-label={muted ? "Unmute" : "Mute"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-300 transition-colors hover:bg-white/6 hover:text-white disabled:opacity-40"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

/**
 * One visible window onto the video. The pane is positioned inside the output
 * frame; the video layer inside it is sized and offset so the requested crop
 * window lands exactly over the pane.
 */
function Pane({
  win,
  hostRef,
  hidden,
  dragging,
  onPointerDown,
  onTap,
}: {
  win?: SceneWindow;
  hostRef: React.RefObject<HTMLDivElement | null>;
  hidden?: boolean;
  dragging?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onTap?: () => void;
}) {
  const invisible = hidden || !win;
  const crop = win?.crop;
  const dest = win?.dest ?? { x: 0, y: 0, w: 1, h: 1 };

  const layer = crop
    ? {
        width: `${(1 / crop.widthFraction) * 100}%`,
        height: `${(1 / crop.heightFraction) * 100}%`,
        left: `${-(crop.offsetXFraction / crop.widthFraction) * 100}%`,
        top: `${-(crop.offsetYFraction / crop.heightFraction) * 100}%`,
      }
    : { width: "100%", height: "100%", left: "0%", top: "0%" };

  return (
    <div
      className={cn("absolute overflow-hidden", invisible && "pointer-events-none opacity-0")}
      style={{
        left: `${dest.x * 100}%`,
        top: `${dest.y * 100}%`,
        width: `${dest.w * 100}%`,
        height: `${dest.h * 100}%`,
        // Keep an invisible pane out of the layout without unmounting it, so
        // its player survives.
        visibility: invisible ? "hidden" : "visible",
      }}
    >
      <div
        className="absolute"
        style={{ ...layer, transition: dragging ? "none" : "all .35s cubic-bezier(.16,1,.3,1)" }}
      >
        <div className="pointer-events-none absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full">
          <div ref={hostRef} className="h-full w-full" />
        </div>
      </div>

      {!invisible && (
        <button
          onPointerDown={onPointerDown}
          onClick={onPointerDown ? undefined : onTap}
          aria-label={onPointerDown ? "Drag to reposition this pane" : "Play or pause"}
          className={cn(
            "absolute inset-0 touch-none focus-visible:outline-none",
            onPointerDown && (dragging ? "cursor-grabbing" : "cursor-grab"),
          )}
        />
      )}
    </div>
  );
}

/**
 * The layer behind the video rect.
 *
 * A blurred backdrop would need the video decoded twice at once, which one
 * iframe cannot do and a second player cannot be re-parented into without
 * being destroyed. The preview therefore blurs the poster frame: the right
 * colours and composition, but static. The export renders the real moving
 * blur from the source.
 */
function TemplateBackdrop({
  background,
  poster,
  crop,
  onPointerDown,
  dragging,
}: {
  background: TemplateLayout["background"];
  poster?: string;
  crop: ReturnType<typeof backgroundWindow> | null;
  onPointerDown?: (e: React.PointerEvent) => void;
  dragging?: boolean;
}) {
  if (background.kind === "none") return null;

  if (background.kind === "color") {
    return <div className="absolute inset-0" style={{ background: background.color }} aria-hidden />;
  }

  if (background.kind === "gradient") {
    return (
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(180deg, ${background.from}, ${background.to})` }}
        aria-hidden
      />
    );
  }

  // Blur: position the poster with the same crop fractions ffmpeg will use, so
  // what the user frames here is what gets rendered.
  const layer = crop
    ? {
        width: `${(1 / crop.widthFraction) * 100}%`,
        height: `${(1 / crop.heightFraction) * 100}%`,
        left: `${-(crop.offsetXFraction / crop.widthFraction) * 100}%`,
        top: `${-(crop.offsetYFraction / crop.heightFraction) * 100}%`,
      }
    : { width: "100%", height: "100%", left: "0%", top: "0%" };

  return (
    <>
      <div className="absolute inset-0 overflow-hidden bg-black" aria-hidden>
        {poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt=""
            className="absolute max-w-none object-fill"
            style={{ ...layer, filter: `blur(${background.sigma / 2.4}px)` }}
          />
        )}
        <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${background.dim})` }} />
      </div>

      {onPointerDown && (
        <button
          onPointerDown={onPointerDown}
          aria-label="Drag to reposition the background"
          className={cn(
            "absolute inset-0 touch-none focus-visible:outline-none",
            dragging ? "cursor-grabbing" : "cursor-grab",
          )}
        />
      )}
    </>
  );
}

/**
 * Letterbox window used when "Fill frame" is off: the whole source is kept and
 * centred inside the frame, with bars filling the remainder.
 */
function fitWindow(frameAspect: number): SceneWindow {
  const wide = SOURCE_ASPECT > frameAspect;
  const w = wide ? 1 : frameAspect / SOURCE_ASPECT;
  const h = wide ? frameAspect / SOURCE_ASPECT : 1;

  return {
    crop: {
      widthFraction: 1,
      heightFraction: 1,
      offsetXFraction: 0,
      offsetYFraction: 0,
      panX: 0,
      panY: 0,
    },
    dest: { x: (1 - w) / 2, y: (1 - h) / 2, w, h },
  };
}
