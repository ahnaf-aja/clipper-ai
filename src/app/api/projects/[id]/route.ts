import { prisma } from "@/infra/db/prisma";
import { requireUser } from "@/infra/auth/session";
import { ok, route } from "@/lib/api";
import { toPublicClip, toPublicLog, toPublicProject } from "@/lib/serializers";
import { NotFound } from "@/core/errors";
import { queue } from "@/core/services/queue";
import { projectDir, removeDir } from "@/infra/media/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = route(async (_req, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    include: {
      _count: { select: { clips: true } },
      clips: { orderBy: { index: "asc" } },
      logs: { orderBy: { createdAt: "asc" }, take: 300 },
      transcript: {
        select: {
          provider: true, language: true, textBody: true,
          model: true, forced: true, langConf: true, wordConf: true,
        },
      },
    },
  });
  if (!project) throw NotFound("Project not found.");

  return ok({
    project: toPublicProject(project),
    clips: project.clips.map((c) => toPublicClip({ ...c, project })),
    logs: project.logs.map(toPublicLog),
    transcript: project.transcript
      ? {
          provider: project.transcript.provider,
          language: project.transcript.language,
          model: project.transcript.model,
          forced: project.transcript.forced,
          langConf: project.transcript.langConf,
          wordConf: project.transcript.wordConf,
          preview: project.transcript.textBody.slice(0, 4000),
        }
      : null,
    queuePosition: queue.position(project.id),
  });
});

export const DELETE = route(async (_req, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;

  const project = await prisma.project.findFirst({ where: { id, userId: user.id } });
  if (!project) throw NotFound("Project not found.");

  await removeDir(await projectDir(project.id));
  await prisma.project.delete({ where: { id: project.id } });

  return ok({ deleted: true });
});
