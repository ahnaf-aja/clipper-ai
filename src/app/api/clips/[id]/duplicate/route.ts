import { prisma } from "@/infra/db/prisma";
import { requireUser } from "@/infra/auth/session";
import { ok, route } from "@/lib/api";
import { toPublicClip } from "@/lib/serializers";
import { NotFound } from "@/core/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const POST = route(async (_req, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;

  const clip = await prisma.clip.findFirst({ where: { id, userId: user.id } });
  if (!clip) throw NotFound("Clip not found.");

  const maxIndex = await prisma.clip.aggregate({
    where: { projectId: clip.projectId },
    _max: { index: true },
  });

  const copy = await prisma.clip.create({
    data: {
      projectId: clip.projectId,
      userId: clip.userId,
      index: (maxIndex._max.index ?? clip.index) + 1,
      title: `${clip.title} (copy)`,
      startSec: clip.startSec,
      endSec: clip.endSec,
      score: clip.score,
      retention: clip.retention,
      confidence: clip.confidence,
      reasonsJson: clip.reasonsJson,
      insight: clip.insight,
      hookText: clip.hookText,
      captionsJson: clip.captionsJson,
      scenesJson: clip.scenesJson,
      stylePreset: clip.stylePreset,
      settingsJson: clip.settingsJson,
      status: "ready",
    },
    include: {
      project: { select: { videoId: true, title: true, thumbnailUrl: true, durationSec: true } },
    },
  });

  return ok({ clip: toPublicClip(copy) }, { status: 201 });
});
