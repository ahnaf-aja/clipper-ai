import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { prisma } from "@/infra/db/prisma";
import { requireUser } from "@/infra/auth/session";
import { route } from "@/lib/api";
import { AppError, NotFound } from "@/core/errors";
import { assertInsideStorage } from "@/infra/media/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".json": "application/json",
  ".vtt": "text/vtt",
  ".ass": "text/plain",
};

export const GET = route(async (_req, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;

  const job = await prisma.exportJob.findFirst({
    where: { id, userId: user.id },
    include: { clip: { select: { title: true } } },
  });
  if (!job) throw NotFound("Export not found.");
  if (job.status !== "done" || !job.filePath) {
    throw new AppError("This export is not ready yet.", 409, "not_ready");
  }

  // Never trust a stored path without re-checking it lives in the storage root.
  const filePath = assertInsideStorage(job.filePath);
  const info = await stat(filePath).catch(() => null);
  if (!info) throw NotFound("The exported file is no longer on disk.");

  const ext = path.extname(filePath).toLowerCase();
  const safeTitle = job.clip.title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || "clip";
  const filename = `${safeTitle}-${job.resolution}-${job.aspect.replace(":", "x")}${ext}`;

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;

  return new Response(stream, {
    headers: {
      "content-type": MIME[ext] ?? "application/octet-stream",
      "content-length": String(info.size),
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
});
