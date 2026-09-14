import { z } from "zod";
import { parseYouTubeId } from "@/infra/youtube/url";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email("Enter a valid email address.");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(80),
  email: emailSchema,
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const forgotSchema = z.object({ email: emailSchema });

export const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
});

/** Languages the transcriber is wired for. "auto" lets the model detect. */
export const SPOKEN_LANGUAGES = ["auto", "id", "en"] as const;
export type SpokenLanguage = (typeof SPOKEN_LANGUAGES)[number];

/**
 * Where the transcript comes from.
 *
 * Neither engine wins everywhere — measured on casual Indonesian speech,
 * YouTube's own recogniser was more faithful than Whisper `small`, while
 * Whisper is stronger on clean speech, proper nouns and punctuation. "auto"
 * picks per language; the others let the user override.
 */
export const TRANSCRIPT_SOURCES = ["auto", "whisper", "youtube"] as const;
export type TranscriptSource = (typeof TRANSCRIPT_SOURCES)[number];

export const createProjectSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "Paste a YouTube link first.")
    .refine((v) => parseYouTubeId(v) !== null, "That does not look like a YouTube video link."),
  language: z.enum(SPOKEN_LANGUAGES).default("auto"),
  transcriptSource: z.enum(TRANSCRIPT_SOURCES).default("auto"),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const clipSettingsSchema = z.object({
  subtitles: z.boolean().optional(),
  viralCaption: z.boolean().optional(),
  keywordHighlight: z.boolean().optional(),
  autoEmoji: z.boolean().optional(),
  silenceRemoval: z.boolean().optional(),
  smartZoom: z.boolean().optional(),
  stylePreset: z.string().max(40).optional(),
  font: z.string().max(60).optional(),
  fontSize: z.number().min(16).max(96).optional(),
  outline: z.number().min(0).max(12).optional(),
  shadow: z.number().min(0).max(20).optional(),
  opacity: z.number().min(10).max(100).optional(),
  background: z.enum(["none", "solid", "blur"]).optional(),
  align: z.enum(["top", "center", "bottom"]).optional(),
  marginY: z.number().min(0).max(45).optional(),
  animation: z.enum(["none", "pop", "fade", "bounce", "slide"]).optional(),
  reveal: z.enum(["word", "line"]).optional(),
  aspect: z.enum(["9:16", "16:9", "1:1"]).optional(),
  uppercase: z.boolean().optional(),
  template: z.string().max(40).optional(),
  bgZoom: z.number().min(1).max(3).optional(),
  bgX: z.number().min(-100).max(100).optional(),
  bgY: z.number().min(-100).max(100).optional(),
  cropMode: z.enum(["auto", "manual"]).optional(),
  cropZoom: z.number().min(1).max(3).optional(),
  cropX: z.number().min(-100).max(100).optional(),
  cropY: z.number().min(-100).max(100).optional(),
});

export const sceneFramingSchema = z.object({
  preset: z.enum(["full", "left", "right", "split", "custom"]).default("custom"),
  layout: z.enum(["single", "split"]).default("single"),
  zoom: z.number().min(1).max(3).default(1),
  x: z.number().min(-100).max(100).default(0),
  y: z.number().min(-100).max(100).default(0),
  zoomB: z.number().min(1).max(3).default(1),
  xB: z.number().min(-100).max(100).default(100),
  yB: z.number().min(-100).max(100).default(0),
});

export const sceneSchema = z.object({
  id: z.string().min(1).max(40),
  start: z.number().min(0),
  framing: sceneFramingSchema,
});

export const updateClipSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  startSec: z.number().min(0).optional(),
  endSec: z.number().min(0).optional(),
  archived: z.boolean().optional(),
  settings: clipSettingsSchema.optional(),
  /** Manual scene list. Capped so a runaway client cannot bloat a row. */
  scenes: z.array(sceneSchema).max(60).optional(),
});

export const createExportSchema = z.object({
  clipId: z.string().min(1),
  aspect: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
  resolution: z.enum(["720p", "1080p", "2K", "4K"]).default("1080p"),
  fps: z.union([z.literal(30), z.literal(60)]).default(30),
  codec: z.enum(["h264", "h265"]).default("h264"),
});

export const changePlanSchema = z.object({
  plan: z.enum(["free", "creator", "pro", "studio"]),
  cycle: z.enum(["monthly", "yearly"]).default("monthly"),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  avatarColor: z.enum(["violet", "blue", "emerald", "amber", "rose", "cyan"]).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(200).optional(),
});

/** Strips characters that could break HTML/attribute contexts if ever echoed. */
export const sanitizeText = (v: string) =>
  v.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 500);
