"use client";

import { useMemo } from "react";
import type { CaptionCue, ClipSettings } from "@/core/domain/types";
import { getPreset, HIGHLIGHT_COLORS } from "@/core/domain/subtitle-presets";

const ANIMATIONS: Record<string, string> = {
  pop: "cap-pop .26s cubic-bezier(.2,1.4,.4,1) both",
  bounce: "cap-bounce .34s cubic-bezier(.3,1.3,.5,1) both",
  slide: "cap-slide .24s cubic-bezier(.16,1,.3,1) both",
  fade: "cap-fade .22s ease both",
  none: "none",
};

/**
 * Renders the active caption cue at `time` (seconds, relative to clip start).
 * This is the single source of visual truth for the preview — the same cue data
 * is what gets compiled to ASS and burned in by ffmpeg on export.
 */
export function CaptionLayer({
  cues,
  settings,
  time,
  scale = 1,
}: {
  cues: CaptionCue[];
  settings: ClipSettings;
  time: number;
  /** multiplier so the caption scales with the preview box, not the screen */
  scale?: number;
}) {
  const preset = getPreset(settings.stylePreset);

  const active = useMemo(() => {
    if (!settings.subtitles) return null;
    // Small lead-in so the cue is on screen the instant the word is spoken.
    return cues.find((c) => time >= c.start - 0.08 && time <= c.end + 0.28) ?? null;
  }, [cues, time, settings.subtitles]);

  if (!active) return null;

  const fontSize = settings.fontSize * scale;
  const align = settings.align;

  const bg =
    settings.background === "solid"
      ? preset.css.background === "transparent"
        ? "rgba(8,8,14,.72)"
        : preset.css.background
      : settings.background === "blur"
        ? preset.css.background === "transparent"
          ? "rgba(8,8,14,.45)"
          : preset.css.background
        : "transparent";

  const strokeWidth = settings.outline * scale;
  const textShadow = [
    strokeWidth > 0
      ? `0 0 ${strokeWidth}px ${preset.css.stroke}, ${strokeWidth}px ${strokeWidth}px 0 ${preset.css.stroke}, -${strokeWidth}px -${strokeWidth}px 0 ${preset.css.stroke}, ${strokeWidth}px -${strokeWidth}px 0 ${preset.css.stroke}, -${strokeWidth}px ${strokeWidth}px 0 ${preset.css.stroke}`
      : "",
    settings.shadow > 0 ? `0 ${settings.shadow * scale}px ${settings.shadow * scale * 2}px rgba(0,0,0,.75)` : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex justify-center px-[6%]"
      style={{
        [align === "top" ? "top" : align === "center" ? "top" : "bottom"]:
          align === "center" ? "50%" : `${settings.marginY}%`,
        transform: align === "center" ? "translateY(-50%)" : undefined,
      }}
      aria-hidden
    >
      <div
        key={active.start}
        style={{
          fontFamily: `'${settings.font}', ${preset.css.fontFamily}`,
          fontWeight: preset.css.fontWeight,
          letterSpacing: preset.css.letterSpacing,
          lineHeight: preset.css.lineHeight,
          fontSize,
          color: preset.css.color,
          opacity: settings.opacity / 100,
          background: bg,
          backdropFilter: settings.background === "blur" ? "blur(10px)" : undefined,
          borderRadius: preset.css.radius,
          padding: settings.background === "none" ? 0 : preset.css.padding,
          textTransform: settings.uppercase ? "uppercase" : "none",
          textShadow,
          animation: ANIMATIONS[settings.animation] ?? "none",
          maxWidth: "100%",
        }}
        className="flex flex-wrap justify-center gap-x-[0.28em] gap-y-[0.1em] text-center"
      >
        {active.tokens.map((tok, i) => {
          // Word-by-word reveal: tokens not yet spoken stay dim.
          const spoken = settings.reveal === "line" || time >= tok.start - 0.05;
          const isCurrent =
            settings.reveal === "word" && time >= tok.start - 0.05 && time <= tok.end + 0.12;

          const color = settings.keywordHighlight && tok.hl ? HIGHLIGHT_COLORS[tok.hl] : undefined;

          return (
            <span
              key={i}
              style={{
                color: isCurrent && settings.viralCaption ? preset.css.accent : color,
                opacity: spoken ? 1 : 0.24,
                fontSize: settings.viralCaption && tok.emph ? "1.14em" : undefined,
                transform: isCurrent && settings.animation !== "none" ? "scale(1.06)" : undefined,
                transition: "opacity .12s ease, transform .12s ease, color .12s ease",
                display: "inline-block",
              }}
            >
              {tok.text}
              {settings.autoEmoji && tok.emoji ? (
                <span style={{ marginLeft: "0.16em" }}>{tok.emoji}</span>
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
