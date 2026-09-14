import { prisma } from "@/infra/db/prisma";
import { requireUser } from "@/infra/auth/session";
import { ok, route } from "@/lib/api";
import { toPublicClip, toPublicProject, toPublicUser } from "@/lib/serializers";
import { getPlan } from "@/core/domain/plans";
import { queue } from "@/core/services/queue";
import { detectCapabilities } from "@/infra/media/capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  const plan = getPlan(user.plan);

  const [recent, processing, topClips, totals, caps] = await Promise.all([
    prisma.project.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { _count: { select: { clips: true } } },
    }),
    prisma.project.findMany({
      where: { userId: user.id, status: { in: ["queued", "running"] } },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { clips: true } } },
    }),
    prisma.clip.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { score: "desc" },
      take: 4,
      include: {
        project: { select: { videoId: true, title: true, thumbnailUrl: true, durationSec: true } },
      },
    }),
    prisma.$transaction([
      prisma.project.count({ where: { userId: user.id } }),
      prisma.clip.count({ where: { userId: user.id, archived: false } }),
      prisma.exportJob.count({ where: { userId: user.id, status: "done" } }),
      prisma.clip.aggregate({ where: { userId: user.id }, _avg: { score: true } }),
      prisma.project.aggregate({ where: { userId: user.id }, _sum: { durationSec: true } }),
    ]),
    detectCapabilities(),
  ]);

  const [projectCount, clipCount, exportCount, avgScore, minutes] = totals;

  return ok({
    user: toPublicUser(user),
    plan,
    recentProjects: recent.map(toPublicProject),
    processing: processing.map(toPublicProject),
    topClips: topClips.map(toPublicClip),
    stats: {
      projects: projectCount,
      clips: clipCount,
      exports: exportCount,
      avgScore: Math.round(avgScore._avg.score ?? 0),
      minutesAnalyzed: Math.round((minutes._sum.durationSec ?? 0) / 60),
      creditsRemaining: user.credits,
      creditsTotal: plan.creditsPerMonth,
      storageBytes: Number(user.storageBytes),
      storageLimitBytes: plan.storageGb * 1024 ** 3,
    },
    queue: { depth: queue.depth(), active: queue.activeCount() },
    capabilities: caps,
  });
});
