import { prisma } from "@/infra/db/prisma";
import { requireUser } from "@/infra/auth/session";
import { ok, route } from "@/lib/api";
import { toPublicClip } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const user = await requireUser();
  const url = new URL(req.url);

  const take = Math.min(60, Number(url.searchParams.get("limit") ?? 40));
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const q = (url.searchParams.get("q") ?? "").trim();
  const sort = url.searchParams.get("sort") ?? "recent";
  const archived = url.searchParams.get("archived") === "true";

  const clips = await prisma.clip.findMany({
    where: {
      userId: user.id,
      archived,
      ...(projectId ? { projectId } : {}),
      ...(q ? { title: { contains: q } } : {}),
    },
    orderBy:
      sort === "score"
        ? [{ score: "desc" }, { createdAt: "desc" }]
        : sort === "duration"
          ? [{ endSec: "desc" }]
          : [{ createdAt: "desc" }],
    take,
    include: {
      project: { select: { videoId: true, title: true, thumbnailUrl: true, durationSec: true } },
    },
  });

  return ok({ clips: clips.map(toPublicClip) });
});
