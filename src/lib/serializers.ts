import type { Clip, ExportJob, JobLog, Project, User } from "@prisma/client";
import type { CaptionCue, ClipReason, ClipSettings, ProjectInsight } from "@/core/domain/types";
import { DEFAULT_CLIP_SETTINGS } from "@/core/domain/types";
import { normalizeScenes, scenesFromSettings, type Scene } from "@/core/domain/scenes";

export type PublicUser = ReturnType<typeof toPublicUser>;
export type PublicProject = ReturnType<typeof toPublicProject>;
export type PublicClip = ReturnType<typeof toPublicClip>;
export type PublicExport = ReturnType<typeof toPublicExport>;
export type PublicLog = ReturnType<typeof toPublicLog>;

export function toPublicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarColor: u.avatarColor,
    plan: u.plan,
    credits: u.credits,
    storageBytes: Number(u.storageBytes),
    createdAt: u.createdAt.toISOString(),
  };
}

export function toPublicProject(p: Project & { _count?: { clips: number } }) {
  return {
    id: p.id,
    sourceUrl: p.sourceUrl,
    videoId: p.videoId,
    title: p.title,
    channel: p.channel,
    thumbnailUrl: p.thumbnailUrl,
    durationSec: p.durationSec,
    language: p.language,
    requestedLang: p.requestedLang,
    status: p.status as "queued" | "running" | "completed" | "failed" | "canceled",
    step: p.step,
    progress: p.progress,
    etaSec: p.etaSec,
    error: p.error,
    engine: p.engine,
    clipCount: p._count?.clips ?? 0,
    insight: parse<ProjectInsight | null>(p.insightJson, null),
    settings: { ...DEFAULT_CLIP_SETTINGS, ...parse<Partial<ClipSettings>>(p.settingsJson, {}) },
    createdAt: p.createdAt.toISOString(),
    finishedAt: p.finishedAt?.toISOString() ?? null,
  };
}

export function toPublicClip(
  c: Clip & { project?: { videoId: string; title: string; thumbnailUrl: string; durationSec: number } },
) {
  return {
    id: c.id,
    projectId: c.projectId,
    index: c.index,
    title: c.title,
    startSec: c.startSec,
    endSec: c.endSec,
    durationSec: Math.round((c.endSec - c.startSec) * 10) / 10,
    score: c.score,
    retention: c.retention,
    confidence: c.confidence,
    reasons: parse<ClipReason[]>(c.reasonsJson, []),
    insight: c.insight,
    hookText: c.hookText,
    captions: parse<CaptionCue[]>(c.captionsJson, []),
    scenes: normalizeScenes(
      parse<Scene[]>(c.scenesJson, []).length
        ? parse<Scene[]>(c.scenesJson, [])
        : // Clips created before manual scenes existed carry their framing on
          // the settings object; surface it as a single scene.
          scenesFromSettings({
            ...DEFAULT_CLIP_SETTINGS,
            ...parse<Partial<ClipSettings>>(c.settingsJson, {}),
          }),
      Math.max(0.1, c.endSec - c.startSec),
    ),
    settings: { ...DEFAULT_CLIP_SETTINGS, ...parse<Partial<ClipSettings>>(c.settingsJson, {}) },
    status: c.status,
    hasRender: Boolean(c.renderPath),
    fileBytes: Number(c.fileBytes),
    archived: c.archived,
    createdAt: c.createdAt.toISOString(),
    video: c.project
      ? {
          videoId: c.project.videoId,
          title: c.project.title,
          thumbnailUrl: c.project.thumbnailUrl,
          durationSec: c.project.durationSec,
        }
      : null,
  };
}

export function toPublicExport(e: ExportJob & { clip?: { title: string; projectId: string } }) {
  return {
    id: e.id,
    clipId: e.clipId,
    clipTitle: e.clip?.title ?? "",
    projectId: e.clip?.projectId ?? "",
    aspect: e.aspect,
    resolution: e.resolution,
    fps: e.fps,
    codec: e.codec,
    watermark: e.watermark,
    status: e.status,
    progress: e.progress,
    fileBytes: Number(e.fileBytes),
    hasFile: Boolean(e.filePath),
    error: e.error,
    createdAt: e.createdAt.toISOString(),
  };
}

export function toPublicLog(l: JobLog) {
  return {
    id: l.id,
    level: l.level as "info" | "warn" | "error" | "success",
    step: l.step,
    message: l.message,
    at: l.createdAt.toISOString(),
  };
}

function parse<T>(json: string, fallback: T): T {
  try {
    return json ? (JSON.parse(json) as T) : fallback;
  } catch {
    return fallback;
  }
}
