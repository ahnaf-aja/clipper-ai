import { prisma } from "@/infra/db/prisma";
import { ok, route } from "@/lib/api";
import { detectCapabilities } from "@/infra/media/capabilities";
import { queue } from "@/core/services/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const started = Date.now();
  const db = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);

  return ok({
    status: db ? "healthy" : "degraded",
    db,
    dbLatencyMs: Date.now() - started,
    capabilities: await detectCapabilities(),
    queue: { depth: queue.depth(), active: queue.activeCount() },
    uptimeSec: Math.round(process.uptime()),
  });
});
