import "server-only";
import { prisma } from "@/infra/db/prisma";
import { logger } from "@/infra/log/logger";

const log = logger("recovery");

/**
 * Fails over projects left mid-flight by a crash or restart.
 *
 * The queue is in-process, so a restart loses every running job while the rows
 * still say "running". Those rows then block new runs of the same video
 * forever, because the duplicate guard treats them as in-flight. Marking them
 * failed on boot makes the state honest and lets the user retry.
 */
export async function recoverOrphanedJobs(): Promise<number> {
  const orphaned = await prisma.project.updateMany({
    where: { status: { in: ["running", "queued"] } },
    data: {
      status: "failed",
      error:
        "The server restarted while this project was processing. Nothing was lost — press Re-run to start again.",
      etaSec: 0,
    },
  });

  const exports = await prisma.exportJob.updateMany({
    where: { status: { in: ["rendering", "queued"] } },
    data: { status: "failed", error: "The server restarted during this export. Start it again." },
  });

  if (orphaned.count || exports.count) {
    log.warn("recovered orphaned jobs", { projects: orphaned.count, exports: exports.count });
  }
  return orphaned.count + exports.count;
}

/** Runs once per server process. */
const globalForRecovery = globalThis as unknown as { clipperRecovered?: Promise<number> };

export function ensureRecovered(): Promise<number> {
  globalForRecovery.clipperRecovered ??= recoverOrphanedJobs().catch((err) => {
    log.error("recovery failed", { error: String(err) });
    return 0;
  });
  return globalForRecovery.clipperRecovered;
}
