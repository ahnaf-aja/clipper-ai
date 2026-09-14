import "server-only";
import { prisma } from "@/infra/db/prisma";
import { logger } from "@/infra/log/logger";
import { runPipeline } from "./pipeline";

const log = logger("queue");

type Job = { projectId: string; userId: string; concurrency: number };

/**
 * In-process job queue with per-user concurrency limits and automatic retry.
 * Kept behind this module so it can be replaced with BullMQ/SQS without any
 * caller changes: `enqueue` and `queuePosition` are the whole surface.
 */
class Queue {
  private pending: Job[] = [];
  private running = new Map<string, number>(); // userId -> count
  private retries = new Map<string, number>();
  private draining = false;

  enqueue(job: Job) {
    if (this.pending.some((p) => p.projectId === job.projectId)) return;
    this.pending.push(job);
    log.info("enqueued", { projectId: job.projectId, depth: this.pending.length });
    void this.drain();
  }

  position(projectId: string): number {
    const idx = this.pending.findIndex((p) => p.projectId === projectId);
    return idx === -1 ? 0 : idx + 1;
  }

  depth(): number {
    return this.pending.length;
  }

  activeCount(): number {
    return [...this.running.values()].reduce((a, b) => a + b, 0);
  }

  private async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      let progressed = true;
      while (progressed) {
        progressed = false;
        for (let i = 0; i < this.pending.length; i++) {
          const job = this.pending[i];
          const active = this.running.get(job.userId) ?? 0;
          if (active >= job.concurrency) continue;

          this.pending.splice(i, 1);
          this.running.set(job.userId, active + 1);
          progressed = true;
          void this.execute(job);
          break;
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private async execute(job: Job) {
    try {
      await runPipeline(job.projectId);

      const project = await prisma.project.findUnique({
        where: { id: job.projectId },
        select: { status: true },
      });

      // Retry once on transient failure (network, YouTube hiccup).
      if (project?.status === "failed") {
        const attempts = this.retries.get(job.projectId) ?? 0;
        if (attempts < 1) {
          this.retries.set(job.projectId, attempts + 1);
          log.warn("retrying failed project", { projectId: job.projectId });
          await prisma.project.update({
            where: { id: job.projectId },
            data: { status: "queued", error: "", progress: 0 },
          });
          await prisma.clip.deleteMany({ where: { projectId: job.projectId } });
          setTimeout(() => this.enqueue(job), 2500).unref?.();
        }
      }
    } catch (err) {
      log.error("job crashed", { projectId: job.projectId, error: String(err) });
    } finally {
      const active = this.running.get(job.userId) ?? 1;
      if (active <= 1) this.running.delete(job.userId);
      else this.running.set(job.userId, active - 1);
      void this.drain();
    }
  }
}

const globalForQueue = globalThis as unknown as { clipperQueue?: Queue };
export const queue = globalForQueue.clipperQueue ?? new Queue();
globalForQueue.clipperQueue = queue;
