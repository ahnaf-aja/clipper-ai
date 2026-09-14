import { prisma } from "@/infra/db/prisma";
import { requireUser } from "@/infra/auth/session";
import { clientIp, rateLimit } from "@/infra/auth/rate-limit";
import { ok, readJson, route } from "@/lib/api";
import { createProjectSchema } from "@/lib/validation";
import { toPublicProject } from "@/lib/serializers";
import { parseYouTubeId, canonicalUrl } from "@/infra/youtube/url";
import { fetchMetadata } from "@/infra/youtube/metadata";
import { getPlan } from "@/core/domain/plans";
import { DEFAULT_CLIP_SETTINGS } from "@/core/domain/types";
import { clipSettingsSchema } from "@/lib/validation";
import { queue } from "@/core/services/queue";
import { ensureRecovered } from "@/core/services/recovery";
import { AppError, Invalid, PaymentRequired } from "@/core/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const user = await requireUser();
  await ensureRecovered();
  const url = new URL(req.url);
  const take = Math.min(50, Number(url.searchParams.get("limit") ?? 20));
  const status = url.searchParams.get("status");

  const projects = await prisma.project.findMany({
    where: { userId: user.id, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take,
    include: { _count: { select: { clips: true } } },
  });

  return ok({
    projects: projects.map(toPublicProject),
    queue: { depth: queue.depth(), active: queue.activeCount() },
  });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  // Clear jobs orphaned by a restart before the duplicate guard reads them,
  // otherwise a dead "running" row blocks this video forever.
  await ensureRecovered();
  rateLimit(`project:${user.id}`, { max: 12, windowMs: 60_000 });
  rateLimit(`project:ip:${clientIp(req)}`, { max: 30, windowMs: 60_000 });

  const body = createProjectSchema.parse(await readJson(req));
  const videoId = parseYouTubeId(body.url);
  if (!videoId) throw Invalid("That does not look like a YouTube video link.");

  const plan = getPlan(user.plan);

  // Refuse duplicates that are still in flight rather than burning credits twice.
  const inFlight = await prisma.project.findFirst({
    where: { userId: user.id, videoId, status: { in: ["queued", "running"] } },
  });
  if (inFlight) {
    return ok({ project: toPublicProject(inFlight), reused: true });
  }

  const meta = await fetchMetadata(videoId);
  const minutes = Math.ceil((meta.durationSec || 600) / 60);

  if (meta.durationSec && meta.durationSec / 60 > plan.maxSourceMinutes) {
    throw new AppError(
      `Your ${plan.name} plan supports videos up to ${plan.maxSourceMinutes} minutes. This one is ${Math.round(meta.durationSec / 60)} minutes.`,
      402,
      "plan_limit",
    );
  }
  if (user.credits < minutes) {
    throw PaymentRequired(
      `This video needs ${minutes} credits and you have ${user.credits}. Upgrade your plan or wait for your monthly reset.`,
    );
  }

  const settings = {
    ...DEFAULT_CLIP_SETTINGS,
    ...(body.settings ? clipSettingsSchema.parse(body.settings) : {}),
  };

  const project = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { credits: { decrement: minutes } } });
    return tx.project.create({
      data: {
        userId: user.id,
        sourceUrl: canonicalUrl(videoId),
        videoId,
        title: meta.title,
        channel: meta.channel,
        thumbnailUrl: meta.thumbnailUrl,
        durationSec: Math.round(meta.durationSec),
        requestedLang: body.language,
        asrSource: body.transcriptSource,
        settingsJson: JSON.stringify(settings),
        status: "queued",
        step: "pending",
      },
      include: { _count: { select: { clips: true } } },
    });
  });

  await prisma.jobLog.create({
    data: {
      projectId: project.id,
      level: "info",
      step: "pending",
      message: `Queued · ${minutes} credits reserved · ${plan.name} plan`,
    },
  });

  queue.enqueue({ projectId: project.id, userId: user.id, concurrency: plan.concurrency });

  return ok({ project: toPublicProject(project), reused: false }, { status: 201 });
});
