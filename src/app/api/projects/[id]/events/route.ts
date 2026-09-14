import { prisma } from "@/infra/db/prisma";
import { requireUser } from "@/infra/auth/session";
import { route } from "@/lib/api";
import { toPublicLog, toPublicProject } from "@/lib/serializers";
import { NotFound } from "@/core/errors";
import { queue } from "@/core/services/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Server-sent events stream for the Generate page: pushes progress, step,
 * queue position and new log lines until the project reaches a terminal state.
 */
export const GET = route(async (req, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;

  const exists = await prisma.project.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!exists) throw NotFound("Project not found.");

  const encoder = new TextEncoder();
  let lastLogAt = new Date(0);
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const tick = async () => {
        const project = await prisma.project.findUnique({
          where: { id },
          include: { _count: { select: { clips: true } } },
        });
        if (!project) return true;

        const logs = await prisma.jobLog.findMany({
          where: { projectId: id, createdAt: { gt: lastLogAt } },
          orderBy: { createdAt: "asc" },
          take: 60,
        });
        if (logs.length) {
          lastLogAt = logs[logs.length - 1].createdAt;
          send("logs", logs.map(toPublicLog));
        }

        send("progress", {
          ...toPublicProject(project),
          queuePosition: queue.position(id),
          queueDepth: queue.depth(),
        });

        return project.status === "completed" || project.status === "failed";
      };

      const done = await tick();
      if (done) {
        send("done", { status: "terminal" });
        controller.close();
        closed = true;
        return;
      }

      const interval = setInterval(async () => {
        try {
          if (await tick()) {
            send("done", { status: "terminal" });
            clearInterval(interval);
            if (!closed) {
              controller.close();
              closed = true;
            }
          }
        } catch {
          clearInterval(interval);
          if (!closed) {
            controller.close();
            closed = true;
          }
        }
      }, 900);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
});
