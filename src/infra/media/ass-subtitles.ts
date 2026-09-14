import type { CaptionCue, ClipSettings } from "@/core/domain/types";
import { getPreset, HIGHLIGHT_COLORS } from "@/core/domain/subtitle-presets";

/**
 * Renders caption cues to an ASS (Advanced SubStation Alpha) subtitle file so
 * that ffmpeg burns in exactly what the browser preview showed: per-word
 * karaoke timing, emphasis sizing, highlight colours and emoji.
 */
export function cuesToAss(
  cues: CaptionCue[],
  settings: ClipSettings,
  size: { w: number; h: number },
): string {
  const preset = getPreset(settings.stylePreset);
  const primary = toAssColor(preset.css.color, settings.opacity);
  const outline = toAssColor("#000000", 100);
  const accent = toAssColor(preset.css.accent, settings.opacity);

  const alignment = settings.align === "top" ? 8 : settings.align === "center" ? 5 : 2;
  const marginV = Math.round((settings.marginY / 100) * size.h);
  const fontName = preset.css.fontFamily.split(",")[0].replace(/['"]/g, "").trim();
  const scale = size.h / 1920;
  const fontSize = Math.round(settings.fontSize * scale * 1.9);

  // Side margins scale with the frame, and WrapStyle 0 lets long cues wrap onto
  // a second line instead of running off the edges. WrapStyle 2 disables
  // wrapping entirely, which overflowed the frame at smaller resolutions.
  const marginH = Math.round(size.w * 0.06);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${size.w}
PlayResY: ${size.h}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,${fontName},${fontSize},${primary},${accent},${outline},${toAssColor("#000000", settings.background === "solid" ? 70 : 0)},${preset.css.fontWeight >= 700 ? -1 : 0},0,0,0,100,100,0,0,${settings.background === "solid" ? 3 : 1},${Math.round(settings.outline * scale * 2)},${Math.round(settings.shadow * scale * 2)},${alignment},${marginH},${marginH},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const events = cues.map((cue) => {
    const text = cue.tokens
      .map((tok) => {
        const durCs = Math.max(1, Math.round((tok.end - tok.start) * 100));
        const color = tok.hl ? toAssColor(HIGHLIGHT_COLORS[tok.hl], settings.opacity) : null;
        const scaleTag = tok.emph ? "\\fscx118\\fscy118" : "";
        const colorTag = color ? `\\c${color}` : "";
        const reset = color || tok.emph ? `{\\r\\c${primary}}` : "";
        const body = settings.uppercase ? tok.text.toUpperCase() : tok.text;
        const emoji = tok.emoji ? ` ${tok.emoji}` : "";
        const karaoke = settings.reveal === "word" ? `{\\k${durCs}}` : "";
        return `${karaoke}{${colorTag}${scaleTag}}${escapeAss(body)}${emoji}${reset}`;
      })
      .join(" ");

    const fade = settings.animation === "fade" ? "{\\fad(120,120)}" : "";
    return `Dialogue: 0,${ts(cue.start)},${ts(cue.end)},Main,,0,0,0,,${fade}${text}`;
  });

  return `${header}\n${events.join("\n")}\n`;
}

function ts(sec: number): string {
  const t = Math.max(0, sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/** ASS uses &HAABBGGRR. */
function toAssColor(hex: string, opacityPct: number): string {
  const clean = hex.replace("#", "");
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  const alpha = Math.round((1 - opacityPct / 100) * 255)
    .toString(16)
    .padStart(2, "0");
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

const escapeAss = (s: string) => s.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
