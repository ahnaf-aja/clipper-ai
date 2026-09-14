import "server-only";
import path from "node:path";
import { readdir, unlink } from "node:fs/promises";
import { bin, run } from "./capabilities";
import { canonicalUrl } from "@/infra/youtube/url";
import { logger } from "@/infra/log/logger";

const log = logger("ytdlp");

export type DownloadResult = { videoPath: string; audioPath: string };

const CONTAINER = /^source\.(mp4|mkv|webm)$/;
/** yt-dlp's per-format intermediates, e.g. source.f399.mp4 — never the output. */
const FRAGMENT = /^source\.f\d+\./;

/**
 * Downloads the source video, merged to a single file.
 *
 * Two things matter here and both have bitten us:
 *  - yt-dlp shells out to ffmpeg to merge separate video/audio streams, and it
 *    looks for it on PATH. Our ffmpeg is bundled in node_modules, so its
 *    location has to be passed explicitly or the merge silently never happens
 *    and only `source.fNNN.*` fragments are left behind.
 *  - YouTube serves AV1 by default at 1080p, which many encoders and players
 *    choke on. We ask for H.264 first and only fall back if it is unavailable.
 */
export async function downloadSource(
  videoId: string,
  dir: string,
  onLog?: (line: string) => void,
): Promise<DownloadResult> {
  const template = path.join(dir, "source.%(ext)s");
  const ffmpegDir = path.dirname(bin("ffmpeg"));

  const format = [
    // Prefer H.264 video + m4a audio.
    "bv*[vcodec^=avc1][height<=1080]+ba[ext=m4a]",
    // Then any progressive H.264 stream.
    "b[vcodec^=avc1][height<=1080]",
    // Then anything at all, so an unusual video still works.
    "bv*[height<=1080]+ba",
    "b[height<=1080]",
    "b",
  ].join("/");

  await run(
    bin("yt-dlp"),
    [
      canonicalUrl(videoId),
      "-f", format,
      "--merge-output-format", "mp4",
      "--ffmpeg-location", ffmpegDir,
      "--no-playlist",
      "--no-warnings",
      "--newline",
      "--retries", "3",
      "--fragment-retries", "5",
      "--no-part",
      "-o", template,
    ],
    { timeoutMs: 45 * 60_000, onLine: (l) => onLog?.(l) },
  );

  const files = await readdir(dir);

  // Match the merged output exactly — a fragment would be video-only (no
  // audio) or an odd codec, and would fail much later during the render.
  const merged = files.find((f) => CONTAINER.test(f));
  if (!merged) {
    const found = files.filter((f) => f.startsWith("source.")).join(", ") || "nothing";
    throw new Error(
      `yt-dlp did not produce a merged video file (found: ${found}). ` +
        `This usually means the audio/video merge failed — check that ffmpeg is available at ${ffmpegDir}.`,
    );
  }
  const videoPath = path.join(dir, merged);

  // Drop leftover fragments so they cannot be mistaken for the output later.
  await Promise.all(
    files
      .filter((f) => FRAGMENT.test(f))
      .map((f) => unlink(path.join(dir, f)).catch(() => {})),
  );

  const audioPath = path.join(dir, "audio.wav");
  await run(
    bin("ffmpeg"),
    ["-y", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", audioPath],
    { timeoutMs: 20 * 60_000, onLine: (l) => onLog?.(l) },
  );

  log.info("source downloaded", { videoId, videoPath });
  return { videoPath, audioPath };
}

/**
 * Downloads audio only and converts it to the 16 kHz mono WAV Whisper wants.
 *
 * Used during analysis: it is a fraction of the bytes and time of a full video
 * download, and the video itself is not needed until export.
 */
export async function downloadAudioOnly(
  videoId: string,
  dir: string,
  onLog?: (line: string) => void,
): Promise<string> {
  const template = path.join(dir, "audio-src.%(ext)s");
  const ffmpegDir = path.dirname(bin("ffmpeg"));

  await run(
    bin("yt-dlp"),
    [
      canonicalUrl(videoId),
      "-f", "bestaudio[ext=m4a]/bestaudio/best",
      "--extract-audio",
      "--audio-format", "wav",
      "--postprocessor-args", "ffmpeg:-ac 1 -ar 16000",
      "--ffmpeg-location", ffmpegDir,
      "--no-playlist",
      "--no-warnings",
      "--newline",
      "--retries", "3",
      "--no-part",
      "-o", template,
    ],
    { timeoutMs: 30 * 60_000, onLine: (l) => onLog?.(l) },
  );

  const files = await readdir(dir);
  const wav = files.find((f) => /^audio-src\.wav$/.test(f));
  if (!wav) {
    throw new Error(
      `yt-dlp did not produce an audio file (found: ${files.filter((f) => f.startsWith("audio-src")).join(", ") || "nothing"})`,
    );
  }

  log.info("audio downloaded", { videoId });
  return path.join(dir, wav);
}

/** Locates a previously downloaded source for a project, if any. */
export async function findExistingSource(dir: string): Promise<string> {
  try {
    const files = await readdir(dir);
    const merged = files.find((f) => CONTAINER.test(f));
    return merged ? path.join(dir, merged) : "";
  } catch {
    return "";
  }
}
