/**
 * Downloads the official yt-dlp binary into ./bin.
 *
 * yt-dlp is not on npm, and it needs to stay current (YouTube changes its
 * player constantly), so it is fetched from the project's GitHub releases
 * rather than vendored. Runs on postinstall; safe to re-run.
 */
import { createWriteStream } from "node:fs";
import { chmod, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const ASSET = {
  win32: "yt-dlp.exe",
  darwin: "yt-dlp_macos",
  linux: "yt-dlp_linux",
};

const asset = ASSET[process.platform];
if (!asset) {
  console.log(`[yt-dlp] no prebuilt binary for ${process.platform}; install yt-dlp manually.`);
  process.exit(0);
}

const binDir = path.resolve("bin");
const target = path.join(binDir, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

const existing = await stat(target).catch(() => null);
if (existing && existing.size > 1_000_000 && !process.argv.includes("--force")) {
  console.log(`[yt-dlp] already present at ${target}`);
  process.exit(0);
}

const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;
console.log(`[yt-dlp] downloading ${url}`);

try {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(180_000) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  await mkdir(binDir, { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(target));
  if (process.platform !== "win32") await chmod(target, 0o755);

  const info = await stat(target);
  console.log(`[yt-dlp] installed ${target} (${(info.size / 1e6).toFixed(1)} MB)`);
} catch (err) {
  // Never fail the install — the app degrades gracefully without yt-dlp.
  console.log(`[yt-dlp] download failed (${String(err).slice(0, 120)}).`);
  console.log("[yt-dlp] Exports will fall back to a manifest until yt-dlp is available.");
  console.log("[yt-dlp] Retry later with: npm run install:ytdlp");
}
