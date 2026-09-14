import { prisma } from "@/infra/db/prisma";
import { requireUser } from "@/infra/auth/session";
import { rateLimit } from "@/infra/auth/rate-limit";
import { ok, readJson, route } from "@/lib/api";
import { createExportSchema } from "@/lib/validation";
import { toPublicExport } from "@/lib/serializers";
import { NotFound, PaymentRequired } from "@/core/errors";
import { getPlan, resolutionAllowed, type Resolution } from "@/core/domain/plans";
import { runExport } from "@/core/services/export-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const user = await requireUser();
  const take = Math.min(60, Number(new URL(req.url).searchParams.get("limit") ?? 30));

  const exports = await prisma.exportJob.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take,
    include: { clip: { select: { title: true, projectId: true } } },
  });

  return ok({ exports: exports.map(toPublicExport) });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  rateLimit(`export:${user.id}`, { max: 30, windowMs: 60_000 });

  const body = createExportSchema.parse(await readJson(req));
  const plan = getPlan(user.plan);

  if (!resolutionAllowed(plan, body.resolution as Resolution)) {
    throw PaymentRequired(
      `${body.resolution} exports need a higher plan. Your ${plan.name} plan tops out at ${plan.maxResolution}.`,
    );
  }
  if (body.fps === 60 && plan.id === "free") {
    throw PaymentRequired("60fps exports are available from the Creator plan up.");
  }
  if (body.codec === "h265" && (plan.id === "free" || plan.id === "creator")) {
    throw PaymentRequired("H.265 exports are available on the Pro plan and above.");
  }

  const clip = await prisma.clip.findFirst({ where: { id: body.clipId, userId: user.id } });
  if (!clip) throw NotFound("Clip not found.");

  const job = await prisma.exportJob.create({
    data: {
      clipId: clip.id,
      userId: user.id,
      aspect: body.aspect,
      resolution: body.resolution,
      fps: body.fps,
      codec: body.codec,
      watermark: !plan.watermarkFree,
      status: "queued",
    },
    include: { clip: { select: { title: true, projectId: true } } },
  });

  // Fire and forget — the client polls GET /api/exports/:id.
  void runExport(job.id);

  return ok({ export: toPublicExport(job) }, { status: 201 });
});
