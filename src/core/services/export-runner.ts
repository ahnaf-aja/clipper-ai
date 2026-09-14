import "server-only";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import type { CaptionCue, ClipSettings } from "@/core/domain/types";
import { DEFAULT_CLIP_SETTINGS } from "@/core/domain/types";
import type { Resolution } from "@/core/domain/plans";
import { prisma } from "@/infra/db/prisma";
import { logger } from "@/infra/log/logger";
import { clipDir, projectDir } from "@/infra/media/storage";
import { detectCapabilities } from "@/infra/media/capabilities";
import { downloadSource, findExistingSource } from "@/infra/media/ytdlp";
import { estimateBytes, renderClip } from "@/infra/media/renderer";
import { cuesToVtt } from "./caption-builder";
import { normalizeScenes, type Scene } from "@/core/domain/scenes";

const log = logger("export");

/**
 * Executes one export job.
 *
 * With ffmpeg + a downloaded source available this produces a real burned-in
 * MP4. Without them it produces the export package the browser renderer needs
 * (an edit-decision manifest + a WebVTT subtitle file) and marks the job
 * `done` with `hasFile` true so the user still gets a downloadable artifact.
 */
export async function runExport(exportId: string): Promise<void> {
  const job = await prisma.exportJob.findUnique({
    where: { id: exportId },
    include: { clip: { include: { project: true } } },
  });
  if (!job) return;

  const setProgress = (progress: number, status?: string) =>
    prisma.exportJob
      .update({ where: { id: exportId }, data: { progress, ...(status ? { status } : {}) } })
      .catch(() => {});

  try {
    await setProgress(5, "rendering");

    const clip = job.clip;
    const settings: ClipSettings = {
      ...DEFAULT_CLIP_SETTINGS,
      ...safeParse<Partial<ClipSettings>>(clip.settingsJson),
      aspect: job.aspect as ClipSettings["aspect"],
    };
    const cues = safeParse<CaptionCue[]>(clip.captionsJson) ?? [];
    const dir = await clipDir(clip.id);
    const outName = `export-${job.id}`;

    const caps = await detectCapabilities();

    // The pipeline no longer downloads the source up front (transcripts come
    // from YouTube's caption track), so fetch it on demand for the first export
    // of a project. Subsequent exports reuse the same file.
    let sourcePath = await findSource(clip.projectId);
    if (!sourcePath && caps.ffmpeg && caps.ytdlp) {
      log.info("source missing, downloading for export", { exportId, projectId: clip.projectId });
      await setProgress(10);
      const dir = await projectDir(clip.projectId);
      const dl = await downloadSource(clip.project.videoId, dir);
      sourcePath = dl.videoPath;
    }

    await setProgress(20);

    if (caps.ffmpeg && sourcePath) {
      const result = await renderClip(
        {
          sourcePath,
          outDir: dir,
          outName,
          startSec: clip.startSec,
          endSec: clip.endSec,
          cues,
          settings,
          aspect: job.aspect as ClipSettings["aspect"],
          resolution: job.resolution as Resolution,
          fps: job.fps as 30 | 60,
          codec: job.codec as "h264" | "h265",
          watermark: job.watermark,
          scenes: normalizeScenes(
            safeParse<Scene[]>(clip.scenesJson) ?? [],
            Math.max(0.1, clip.endSec - clip.startSec),
          ),
        },
        () => void setProgress(Math.min(92, 20 + Math.round(Math.random() * 60))),
      );

      await finish(exportId, job.userId, result.filePath, result.bytes);
      log.info("export rendered", { exportId, bytes: result.bytes });
      return;
    }

    // With ffmpeg present, an export must be a real video. Failing loudly here
    // is right — silently handing back a manifest looks like a broken download.
    if (caps.ffmpeg) {
      throw new Error(
        "Could not obtain the source video to render. YouTube may be blocking the download, or the video is unavailable.",
      );
    }

    // No ffmpeg at all: emit the portable export package.
    const vttPath = path.join(dir, `${outName}.vtt`);
    const manifestPath = path.join(dir, `${outName}.json`);

    await writeFile(vttPath, cuesToVtt(cues), "utf8");
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          kind: "clipper-ai/edit-decision-list",
          version: 1,
          note:
            "Rendered previews are produced in the browser. Install ffmpeg and yt-dlp on the server to receive a burned-in MP4 instead.",
          source: { youtubeId: clip.project.videoId, url: clip.project.sourceUrl },
          clip: {
            title: clip.title,
            startSec: clip.startSec,
            endSec: clip.endSec,
            durationSec: Math.round((clip.endSec - clip.startSec) * 100) / 100,
          },
          output: {
            aspect: job.aspect,
            resolution: job.resolution,
            fps: job.fps,
            codec: job.codec,
            watermark: job.watermark,
          },
          settings,
          captions: cues,
        },
        null,
        2,
      ),
      "utf8",
    );

    await setProgress(80);
    const bytes = estimateBytes(clip.endSec - clip.startSec, job.resolution as Resolution, job.fps);
    await finish(exportId, job.userId, manifestPath, bytes);
    log.info("export packaged (no ffmpeg)", { exportId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("export failed", { exportId, error: message });
    await prisma.exportJob
      .update({
        where: { id: exportId },
        data: { status: "failed", error: message.slice(0, 400), progress: 100 },
      })
      .catch(() => {});
  }
}

async function finish(exportId: string, userId: string, filePath: string, bytes: number) {
  await prisma.$transaction([
    prisma.exportJob.update({
      where: { id: exportId },
      data: { status: "done", progress: 100, filePath, fileBytes: BigInt(bytes) },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { storageBytes: { increment: BigInt(bytes) } },
    }),
  ]);
}

async function findSource(projectId: string): Promise<string> {
  return findExistingSource(await projectDir(projectId));
}

function safeParse<T>(json: string): T {
  try {
    return JSON.parse(json || "null") as T;
  } catch {
    return null as T;
  }
}
