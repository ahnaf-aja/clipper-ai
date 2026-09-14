import { prisma } from "@/infra/db/prisma";
import { requireUser } from "@/infra/auth/session";
import { rateLimit } from "@/infra/auth/rate-limit";
import { ok, route } from "@/lib/api";
import { toPublicProject } from "@/lib/serializers";
import { AppError, NotFound } from "@/core/errors";
import { getPlan } from "@/core/domain/plans";
import { queue } from "@/core/services/queue";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const POST = route(async (_req, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  rateLimit(`retry:${user.id}`, { max: 10, windowMs: 60_000 });

  const project = await prisma.project.findFirst({ where: { id, userId: user.id } });
  if (!project) throw NotFound("Project not found.");
  if (project.status === "running" || project.status === "queued") {
    throw new AppError("This project is already processing.", 409, "already_running");
  }

  await prisma.clip.deleteMany({ where: { projectId: project.id } });
  await prisma.jobLog.deleteMany({ where: { projectId: project.id } });

  const updated = await prisma.project.update({
    where: { id: project.id },
    data: { status: "queued", step: "pending", progress: 0, error: "", insightJson: "" },
    include: { _count: { select: { clips: true } } },
  });

  queue.enqueue({
    projectId: project.id,
    userId: user.id,
    concurrency: getPlan(user.plan).concurrency,
  });

  return ok({ project: toPublicProject(updated) });
});
