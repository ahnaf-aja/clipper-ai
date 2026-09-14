import "server-only";
import path from "node:path";
import { readFile } from "node:fs/promises";
import type { Word } from "@/core/domain/types";
import { config } from "@/core/config";
import { logger } from "@/infra/log/logger";
import { findPython, run } from "@/infra/media/capabilities";

const log = logger("asr");

export type TranscribeResult = {
  words: Word[];
  language: string;
  provider: "faster-whisper" | "openai" | "youtube" | "synthetic";
  /** model identifier, for the audit trail shown in the UI */
  model: string;
  /** whether the language was forced by the user rather than auto-detected */
  forced: boolean;
  /** detector confidence, 0..1; 1 when forced */
  languageConfidence: number;
  /** mean per-word confidence, 0..1 */
  meanConfidence: number;
};

export type TranscribeOptions = {
  /** ISO code to force ("id", "en"), or "auto" to let the model detect */
  language: string;
  onLog?: (line: string) => void;
};

/**
 * Runs speech-to-text over an extracted audio file.
 * Throws when no engine is available, so the caller can fall back.
 */
export async function transcribeAudio(
  audioPath: string,
  opts: TranscribeOptions,
): Promise<TranscribeResult> {
  const cfg = config();

  if (cfg.ASR_PROVIDER === "openai" || (cfg.ASR_PROVIDER === "auto" && !(await findPython()))) {
    if (!cfg.OPENAI_API_KEY) throw new Error("No local Whisper engine and no OPENAI_API_KEY");
    return transcribeOpenAI(audioPath, opts);
  }

  return transcribeLocal(audioPath, opts);
}

async function transcribeLocal(
  audioPath: string,
  opts: TranscribeOptions,
): Promise<TranscribeResult> {
  const cfg = config();
  const python = await findPython();
  if (!python) throw new Error("No Python interpreter with faster-whisper installed");

  const script = path.resolve(process.cwd(), "scripts", "transcribe.py");
  const language = normalizeLang(opts.language);

  opts.onLog?.(
    `Whisper (${cfg.WHISPER_MODEL}) starting · language=${language || "auto-detect"} · this is the slow step`,
  );

  const stdout = await run(
    python,
    [
      script,
      audioPath,
      "--model", cfg.WHISPER_MODEL,
      "--language", language,
      "--device", cfg.WHISPER_DEVICE,
      "--compute-type", cfg.WHISPER_COMPUTE,
    ],
    {
      timeoutMs: 90 * 60_000,
      onLine: (l) => {
        // The script prints progress on stderr and JSON on stdout.
        if (l.startsWith("transcribed ")) opts.onLog?.(l);
      },
      env: {
        // HuggingFace caches models with symlinks, which Windows refuses
        // unless the process is elevated or developer mode is on. Without
        // this, the first model download fails with WinError 1314.
        HF_HUB_DISABLE_SYMLINKS: "1",
        HF_HUB_DISABLE_SYMLINKS_WARNING: "1",
        ...(cfg.WHISPER_CACHE_DIR ? { HF_HOME: cfg.WHISPER_CACHE_DIR } : {}),
      },
    },
  );

  const payload = JSON.parse(lastJsonLine(stdout)) as {
    error?: string;
    language?: string;
    languageProbability?: number;
    model?: string;
    forced?: boolean;
    words?: Word[];
  };

  if (payload.error) throw new Error(explainAsrError(payload.error, cfg.WHISPER_MODEL));
  const words = (payload.words ?? []).filter((w) => w.w?.trim());
  if (words.length === 0) throw new Error("Whisper returned no words");

  const meanConfidence = mean(words.map((w) => w.c ?? 0));

  log.info("local transcription complete", {
    words: words.length,
    language: payload.language,
    model: payload.model,
    meanConfidence,
  });

  return {
    words,
    language: payload.language ?? language ?? "en",
    provider: "faster-whisper",
    model: payload.model ?? cfg.WHISPER_MODEL,
    forced: Boolean(payload.forced),
    languageConfidence: payload.forced ? 1 : (payload.languageProbability ?? 0),
    meanConfidence,
  };
}

async function transcribeOpenAI(
  audioPath: string,
  opts: TranscribeOptions,
): Promise<TranscribeResult> {
  const cfg = config();
  const language = normalizeLang(opts.language);
  const buf = await readFile(audioPath);

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)]), audioPath.split(/[\\/]/).pop());
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  if (language) form.append("language", language);

  opts.onLog?.(`Whisper API starting · language=${language || "auto-detect"}`);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(15 * 60_000),
  });
  if (!res.ok) throw new Error(`whisper api ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const json = (await res.json()) as {
    language?: string;
    words?: { word: string; start: number; end: number }[];
    segments?: { words?: { word: string; start: number; end: number }[] }[];
  };

  const flat = json.words ?? json.segments?.flatMap((s) => s.words ?? []) ?? [];
  const words: Word[] = flat
    .filter((w) => w.word?.trim())
    .map((w) => ({
      w: w.word.trim(),
      s: round3(w.start),
      e: round3(Math.max(w.start + 0.05, w.end)),
      c: 0.9,
    }));

  if (words.length === 0) throw new Error("Whisper API returned no word timings");

  return {
    words,
    language: json.language ?? language ?? "en",
    provider: "openai",
    model: "whisper-1",
    forced: Boolean(language),
    languageConfidence: language ? 1 : 0.8,
    meanConfidence: 0.9,
  };
}

/**
 * Turns the raw Python failure into something a person can act on. Model
 * downloads are 0.5-3 GB, so a full disk is a common and otherwise cryptic
 * failure.
 */
function explainAsrError(raw: string, model: string): string {
  if (/not enough space|os error 112|No space left/i.test(raw)) {
    return (
      `Not enough disk space to download the "${model}" Whisper model (these are 0.5-3 GB). ` +
      `Free some space, or set WHISPER_CACHE_DIR to a drive that has room.`
    );
  }
  if (/WinError 1314|privilege is not held/i.test(raw)) {
    return (
      `Windows blocked the model cache from creating a symlink. ` +
      `Enable Developer Mode, or set WHISPER_CACHE_DIR to a local folder.`
    );
  }
  if (/could not load model/i.test(raw)) {
    return `${raw}. Check WHISPER_MODEL is a valid model name.`;
  }
  return raw;
}

/** "auto" and unknown values become "", which means let the model decide. */
function normalizeLang(language: string): string {
  const l = (language || "").trim().toLowerCase();
  if (!l || l === "auto") return "";
  return l.split("-")[0];
}

/** The script may emit progress lines before the JSON payload. */
function lastJsonLine(stdout: string): string {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("{")) return line;
  }
  throw new Error(`Transcriber produced no JSON output: ${stdout.slice(-300)}`);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round3 = (n: number) => Math.round(n * 1000) / 1000;
