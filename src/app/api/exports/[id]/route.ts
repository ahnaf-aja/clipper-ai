import { prisma } from "@/infra/db/prisma";
import { requireUser } from "@/infra/auth/session";
import { ok, route } from "@/lib/api";
import { toPublicExport } from "@/lib/serializers";
import { NotFound } from "@/core/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_req, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;

  const job = await prisma.exportJob.findFirst({
    where: { id, userId: user.id },
    include: { clip: { select: { title: true, projectId: true } } },
  });
  if (!job) throw NotFound("Export not found.");

  return ok({ export: toPublicExport(job) });
});

export const DELETE = route(async (_req, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;

  const job = await prisma.exportJob.findFirst({ where: { id, userId: user.id } });
  if (!job) throw NotFound("Export not found.");

  await prisma.$transaction([
    prisma.exportJob.delete({ where: { id: job.id } }),
    prisma.user.update({
      where: { id: user.id },
      data: { storageBytes: { decrement: job.fileBytes } },
    }),
  ]);

  return ok({ deleted: true });
});
