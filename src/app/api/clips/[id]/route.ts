import { prisma } from "@/infra/db/prisma";
import { requireUser } from "@/infra/auth/session";
import { ok, readJson, route } from "@/lib/api";
import { updateClipSchema } from "@/lib/validation";
import { toPublicClip } from "@/lib/serializers";
import { Invalid, NotFound } from "@/core/errors";
import { CLIP_RULES, clampDuration } from "@/core/domain/clip-rules";
import { DEFAULT_CLIP_SETTINGS, type ClipSettings, type Word } from "@/core/domain/types";
import { assertMeaningPreserved, buildCaptions } from "@/core/services/caption-builder";
import { normalizeScenes, scenesFromSettings, type Scene } from "@/core/domain/scenes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const include = {
  project: { select: { videoId: true, title: true, thumbnailUrl: true, durationSec: true } },
} as const;

export const GET = route(async (_req, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;

  const clip = await prisma.clip.findFirst({ where: { id, userId: user.id }, include });
  if (!clip) throw NotFound("Clip not found.");

  return ok({ clip: toPublicClip(clip) });
});

/** Edits a clip. Trimming or changing caption settings rebuilds the cues. */
export const PATCH = route(async (req, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const body = updateClipSchema.parse(await readJson(req));

  const clip = await prisma.clip.findFirst({ where: { id, userId: user.id }, include });
  if (!clip) throw NotFound("Clip not found.");

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.archived !== undefined) data.archived = body.archived;

  let start = clip.startSec;
  let end = clip.endSec;
  const trimmed = body.startSec !== undefined || body.endSec !== undefined;

  if (trimmed) {
    start = body.startSec ?? clip.startSec;
    end = body.endSec ?? clip.endSec;
    if (end <= start) throw Invalid("The clip end must come after its start.");
    const dur = end - start;
    if (dur < CLIP_RULES.MIN_SEC)
      throw Invalid(`Clips must be at least ${CLIP_RULES.MIN_SEC} seconds.`);
    if (dur > CLIP_RULES.MAX_SEC)
      throw Invalid(`Clips must be no longer than ${CLIP_RULES.MAX_SEC / 60} minutes.`);

    const project = await prisma.project.findUnique({
      where: { id: clip.projectId },
      select: { durationSec: true },
    });
    const clamped = clampDuration(start, end, project?.durationSec ?? end);
    start = clamped.start;
    end = clamped.end;
    data.startSec = start;
    data.endSec = end;
  }

  const settings: ClipSettings = {
    ...DEFAULT_CLIP_SETTINGS,
    ...safeParse<Partial<ClipSettings>>(clip.settingsJson),
    ...(body.settings ?? {}),
  };

  // Scenes are indexed from the clip start, so a trim can leave cuts stranded
  // past the new end. Re-normalising against the new duration drops those.
  if (body.scenes || trimmed) {
    const incoming = body.scenes ?? safeParse<Scene[]>(clip.scenesJson) ?? [];
    const scenes = normalizeScenes(
      incoming.length ? incoming : scenesFromSettings(settings),
      Math.max(0.1, end - start),
    );
    data.scenesJson = JSON.stringify(scenes);
    // The burned file no longer matches the scene list.
    data.renderPath = "";
    data.status = "ready";
  }

  if (body.settings || trimmed) {
    const transcript = await prisma.transcript.findUnique({
      where: { projectId: clip.projectId },
      select: { wordsJson: true },
    });
    const words = safeParse<Word[]>(transcript?.wordsJson ?? "[]") ?? [];
    const inRange = words.filter((w) => w.e > start && w.s < end);
    const cues = buildCaptions(inRange, settings, start);

    const violation = assertMeaningPreserved(inRange, cues);
    if (violation) throw Invalid(`Caption integrity check failed: ${violation}`);

    data.captionsJson = JSON.stringify(cues);
    data.settingsJson = JSON.stringify(settings);
    data.stylePreset = settings.stylePreset;
    // The burned file no longer matches the settings.
    data.renderPath = "";
    data.status = "ready";
  }

  const updated = await prisma.clip.update({ where: { id: clip.id }, data, include });
  return ok({ clip: toPublicClip(updated) });
});

export const DELETE = route(async (_req, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;

  const clip = await prisma.clip.findFirst({ where: { id, userId: user.id } });
  if (!clip) throw NotFound("Clip not found.");

  await prisma.clip.delete({ where: { id: clip.id } });
  return ok({ deleted: true });
});

function safeParse<T>(json: string): T {
  try {
    return JSON.parse(json || "{}") as T;
  } catch {
    return {} as T;
  }
}
