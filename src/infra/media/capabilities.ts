import "server-only";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { config } from "@/core/config";
import { cached } from "@/infra/cache/cache";

const exec = promisify(execFile);

export type Capabilities = {
  ffmpeg: boolean;
  ffprobe: boolean;
  ytdlp: boolean;
  whisper: boolean;
  llm: boolean;
  /** which speech-to-text engine will actually be used */
  asrEngine: "faster-whisper" | "openai" | "none";
  whisperModel: string;
  /** true when the full real toolchain is present */
  fullPipeline: boolean;
};

/** Candidate Python interpreters, best first. */
function pythonCandidates(): string[] {
  const cfg = config();
  return [
    cfg.PYTHON_PATH,
    process.env.CONDA_PREFIX ? path.join(process.env.CONDA_PREFIX, "python.exe") : "",
    "python",
    "python3",
    "py",
  ].filter(Boolean);
}

/** Finds an interpreter that can import faster_whisper. */
export async function findPython(): Promise<string | null> {
  return cached("python", 60_000, async () => {
    for (const candidate of pythonCandidates()) {
      try {
        await exec(candidate, ["-c", "import faster_whisper"], {
          timeout: 30_000,
          windowsHide: true,
        });
        return candidate;
      } catch {
        /* try the next one */
      }
    }
    return null;
  });
}

/**
 * Resolves a tool path, in priority order:
 *   1. an explicit path from .env
 *   2. the binary bundled by npm (ffmpeg-static / ffprobe-static) or fetched
 *      into ./bin by scripts/install-ytdlp.mjs
 *   3. the bare name, so a system install on PATH still works
 *
 * This is what makes real MP4 export work out of the box with no manual setup.
 */
export function bin(name: "ffmpeg" | "ffprobe" | "yt-dlp"): string {
  const cfg = config();
  const override =
    name === "ffmpeg" ? cfg.FFMPEG_PATH : name === "ffprobe" ? cfg.FFPROBE_PATH : cfg.YTDLP_PATH;
  if (override) return override;

  const bundled = bundledPath(name);
  if (bundled) return bundled;

  return name;
}

let bundledCache: Partial<Record<string, string | null>> = {};

function bundledPath(name: "ffmpeg" | "ffprobe" | "yt-dlp"): string | null {
  if (name in bundledCache) return bundledCache[name] ?? null;

  let resolved: string | null = null;
  try {
    if (name === "ffmpeg") {
      // ffmpeg-static default-exports the absolute path to the binary.
      resolved = (ffmpegStatic as unknown as string | null) ?? null;
    } else if (name === "ffprobe") {
      resolved = ffprobeStatic?.path ?? null;
    } else {
      const local = path.resolve(
        process.cwd(),
        "bin",
        process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
      );
      resolved = existsSync(local) ? local : null;
    }
  } catch {
    resolved = null;
  }

  if (resolved && !existsSync(resolved)) resolved = null;
  bundledCache[name] = resolved;
  return resolved;
}

/** Test hook — capability detection is cached for a minute in normal use. */
export function resetToolCache() {
  bundledCache = {};
}

async function probe(cmd: string, args: string[]): Promise<boolean> {
  try {
    await exec(cmd, args, { timeout: 8000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export async function detectCapabilities(): Promise<Capabilities> {
  return cached("capabilities", 60_000, async () => {
    const cfg = config();
    const [ffmpeg, ffprobe, ytdlp, python] = await Promise.all([
      probe(bin("ffmpeg"), ["-version"]),
      probe(bin("ffprobe"), ["-version"]),
      probe(bin("yt-dlp"), ["--version"]),
      findPython(),
    ]);

    const asrEngine: Capabilities["asrEngine"] =
      cfg.ASR_PROVIDER === "youtube"
        ? "none"
        : python && cfg.ASR_PROVIDER !== "openai"
          ? "faster-whisper"
          : cfg.OPENAI_API_KEY
            ? "openai"
            : "none";

    return {
      ffmpeg,
      ffprobe,
      ytdlp,
      whisper: asrEngine !== "none",
      llm: Boolean(cfg.ANTHROPIC_API_KEY),
      asrEngine,
      whisperModel: cfg.WHISPER_MODEL,
      fullPipeline: ffmpeg && ffprobe && ytdlp,
    };
  });
}

export async function run(
  cmd: string,
  args: string[],
  opts?: {
    timeoutMs?: number;
    onLine?: (line: string) => void;
    env?: Record<string, string>;
  },
): Promise<string> {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      windowsHide: true,
      env: opts?.env ? { ...process.env, ...opts.env } : process.env,
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${cmd} timed out after ${opts?.timeoutMs ?? 600_000}ms`));
    }, opts?.timeoutMs ?? 600_000);

    child.stdout.on("data", (d) => {
      const s = String(d);
      out += s;
      opts?.onLine?.(s.trim());
    });
    child.stderr.on("data", (d) => {
      const s = String(d);
      err += s;
      opts?.onLine?.(s.trim());
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} exited with ${code}: ${err.slice(-800)}`));
    });
  });
}
