import type { ClipSettings } from "./types";

export type SubtitlePreset = {
  id: string;
  name: string;
  description: string;
  /** CSS applied to the caption block in the preview renderer */
  css: {
    fontFamily: string;
    fontWeight: number;
    letterSpacing: string;
    color: string;
    accent: string;
    highlight: string;
    stroke: string;
    background: string;
    radius: string;
    padding: string;
    textTransform: "uppercase" | "none";
    lineHeight: number;
  };
  defaults: Partial<ClipSettings>;
};

const INTER = "'Inter', system-ui, sans-serif";
const CONDENSED = "'Archivo Black', 'Inter', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

export const SUBTITLE_PRESETS: SubtitlePreset[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Broadcast-style, unobtrusive, always legible.",
    css: {
      fontFamily: INTER, fontWeight: 600, letterSpacing: "0em",
      color: "#ffffff", accent: "#ffffff", highlight: "#ffd76a",
      stroke: "rgba(0,0,0,.85)", background: "rgba(0,0,0,.55)",
      radius: "6px", padding: "6px 12px", textTransform: "none", lineHeight: 1.25,
    },
    defaults: { uppercase: false, animation: "fade", reveal: "line", background: "solid", fontSize: 38 },
  },
  {
    id: "tiktok",
    name: "TikTok",
    description: "Bold word-by-word pop with a punchy accent.",
    css: {
      fontFamily: CONDENSED, fontWeight: 900, letterSpacing: "-0.01em",
      color: "#ffffff", accent: "#7c5cff", highlight: "#4ade80",
      stroke: "rgba(0,0,0,.9)", background: "transparent",
      radius: "10px", padding: "2px 8px", textTransform: "uppercase", lineHeight: 1.05,
    },
    defaults: { uppercase: true, animation: "pop", reveal: "word", background: "none", fontSize: 48 },
  },
  {
    id: "podcast",
    name: "Podcast",
    description: "Two-line calm reveal, great for long-form talk.",
    css: {
      fontFamily: INTER, fontWeight: 700, letterSpacing: "-0.005em",
      color: "#f5f5f7", accent: "#8b7dff", highlight: "#ffce54",
      stroke: "rgba(0,0,0,.6)", background: "rgba(14,14,18,.72)",
      radius: "14px", padding: "10px 16px", textTransform: "none", lineHeight: 1.3,
    },
    defaults: { uppercase: false, animation: "fade", reveal: "line", background: "blur", fontSize: 40 },
  },
  {
    id: "gaming",
    name: "Gaming",
    description: "Neon stroke, hard bounce, high contrast.",
    css: {
      fontFamily: CONDENSED, fontWeight: 900, letterSpacing: "0.01em",
      color: "#ffffff", accent: "#00e5ff", highlight: "#ff3d81",
      stroke: "rgba(0,0,0,.95)", background: "transparent",
      radius: "8px", padding: "2px 8px", textTransform: "uppercase", lineHeight: 1.02,
    },
    defaults: { uppercase: true, animation: "bounce", reveal: "word", background: "none", fontSize: 50 },
  },
  {
    id: "education",
    name: "Education",
    description: "Clean, keyword-first, easy to read at speed.",
    css: {
      fontFamily: INTER, fontWeight: 700, letterSpacing: "0em",
      color: "#ffffff", accent: "#38bdf8", highlight: "#facc15",
      stroke: "rgba(0,0,0,.7)", background: "rgba(10,12,20,.6)",
      radius: "10px", padding: "8px 14px", textTransform: "none", lineHeight: 1.28,
    },
    defaults: { uppercase: false, animation: "slide", reveal: "line", background: "solid", fontSize: 40 },
  },
  {
    id: "mrbeast",
    name: "MrBeast",
    description: "Huge, yellow-hot emphasis, zero subtlety.",
    css: {
      fontFamily: CONDENSED, fontWeight: 900, letterSpacing: "-0.02em",
      color: "#ffffff", accent: "#ffd400", highlight: "#ff2d55",
      stroke: "rgba(0,0,0,1)", background: "transparent",
      radius: "8px", padding: "2px 8px", textTransform: "uppercase", lineHeight: 1,
    },
    defaults: { uppercase: true, animation: "pop", reveal: "word", background: "none", fontSize: 58, outline: 5 },
  },
  {
    id: "hormozi",
    name: "Alex Hormozi",
    description: "Stacked keywords with green/yellow money words.",
    css: {
      fontFamily: CONDENSED, fontWeight: 900, letterSpacing: "-0.01em",
      color: "#ffffff", accent: "#22c55e", highlight: "#fde047",
      stroke: "rgba(0,0,0,.95)", background: "transparent",
      radius: "8px", padding: "2px 6px", textTransform: "uppercase", lineHeight: 1.05,
    },
    defaults: { uppercase: true, animation: "pop", reveal: "word", background: "none", fontSize: 52, outline: 4 },
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Small, centred, nearly invisible chrome.",
    css: {
      fontFamily: INTER, fontWeight: 500, letterSpacing: "0.01em",
      color: "#ffffff", accent: "#e5e5ea", highlight: "#c4b5fd",
      stroke: "rgba(0,0,0,.4)", background: "transparent",
      radius: "4px", padding: "2px 6px", textTransform: "none", lineHeight: 1.3,
    },
    defaults: { uppercase: false, animation: "fade", reveal: "line", background: "none", fontSize: 32, outline: 1 },
  },
  {
    id: "modern",
    name: "Modern",
    description: "Glass pill with a soft violet glow.",
    css: {
      fontFamily: INTER, fontWeight: 800, letterSpacing: "-0.01em",
      color: "#ffffff", accent: "#a78bfa", highlight: "#5eead4",
      stroke: "rgba(0,0,0,.5)", background: "rgba(30,27,60,.55)",
      radius: "999px", padding: "10px 20px", textTransform: "none", lineHeight: 1.2,
    },
    defaults: { uppercase: false, animation: "slide", reveal: "word", background: "blur", fontSize: 42 },
  },
  {
    id: "bold",
    name: "Bold",
    description: "Maximum weight, tight tracking, full-bleed.",
    css: {
      fontFamily: CONDENSED, fontWeight: 900, letterSpacing: "-0.03em",
      color: "#ffffff", accent: "#f97316", highlight: "#ffffff",
      stroke: "rgba(0,0,0,.9)", background: "transparent",
      radius: "6px", padding: "2px 8px", textTransform: "uppercase", lineHeight: 0.98,
    },
    defaults: { uppercase: true, animation: "bounce", reveal: "word", background: "none", fontSize: 56 },
  },
  {
    id: "clean",
    name: "Clean",
    description: "Mono-spaced, technical, developer-friendly.",
    css: {
      fontFamily: MONO, fontWeight: 600, letterSpacing: "-0.02em",
      color: "#e8e8ed", accent: "#7dd3fc", highlight: "#fca5a5",
      stroke: "rgba(0,0,0,.6)", background: "rgba(8,8,12,.7)",
      radius: "8px", padding: "8px 12px", textTransform: "none", lineHeight: 1.35,
    },
    defaults: { uppercase: false, animation: "none", reveal: "line", background: "solid", fontSize: 34 },
  },
];

export const getPreset = (id: string): SubtitlePreset =>
  SUBTITLE_PRESETS.find((p) => p.id === id) ?? SUBTITLE_PRESETS[1];

export const FONT_OPTIONS = [
  "Inter",
  "Archivo Black",
  "JetBrains Mono",
  "Georgia",
  "Impact",
  "Verdana",
] as const;

export const HIGHLIGHT_COLORS: Record<string, string> = {
  name: "#7dd3fc",
  number: "#4ade80",
  money: "#fde047",
  keyword: "#a78bfa",
  quote: "#fb7185",
  hook: "#fb923c",
};
