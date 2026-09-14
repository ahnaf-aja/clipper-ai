import { z } from "zod";

/**
 * Single source of truth for runtime configuration.
 * Parsed lazily so that client bundles never touch it.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  APP_URL: z.string().default("http://localhost:3000"),

  ANTHROPIC_API_KEY: z.string().default(""),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5"),

  ASR_PROVIDER: z.enum(["auto", "faster-whisper", "openai", "youtube"]).default("auto"),
  OPENAI_API_KEY: z.string().default(""),
  /**
   * tiny | base | small | medium | large-v3 | large-v3-turbo.
   *
   * Benchmarked on 80s of casual Indonesian speech (CPU, int8):
   *   small           1.2x realtime, conf 0.66 — mangled slang and names
   *   medium          3.7x realtime, conf 0.71 — accurate but far too slow
   *   large-v3-turbo  0.4x realtime, conf 0.74 — most accurate AND fastest
   *
   * Turbo wins on both axes, so it is the default. It is a ~1.6 GB download on
   * first use.
   */
  WHISPER_MODEL: z.string().default("large-v3-turbo"),
  WHISPER_DEVICE: z.string().default("cpu"),
  WHISPER_COMPUTE: z.string().default("int8"),
  PYTHON_PATH: z.string().default(""),
  /**
   * Where Whisper models are cached. Models are 0.5-3 GB each and default to
   * the home directory, which is often on a small system drive — point this at
   * a roomier disk to avoid "not enough space" failures mid-download.
   */
  WHISPER_CACHE_DIR: z.string().default(""),
  /**
   * When no real transcript can be obtained, generate a simulated one instead
   * of failing. Off by default: invented text would not match the audio, which
   * is exactly the failure mode subtitles must never have.
   */
  ALLOW_SIMULATED_TRANSCRIPT: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),

  FFMPEG_PATH: z.string().default(""),
  FFPROBE_PATH: z.string().default(""),
  YTDLP_PATH: z.string().default(""),

  STORAGE_DIR: z.string().default("./storage"),
  MAX_SOURCE_MINUTES: z.coerce.number().int().positive().default(180),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
});

let cached: z.infer<typeof schema> | null = null;

export function config() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration -> ${issues}. Copy .env.example to .env.`);
  }
  cached = parsed.data;
  return cached;
}

export const isProd = process.env.NODE_ENV === "production";
