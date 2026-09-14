"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight, CheckCircle2, CircleDashed, Loader2, RotateCcw, Terminal, TriangleAlert, Wand2,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { GenerateBar } from "@/components/app/generate-bar";
import { ClipCard } from "@/components/app/clip-card";
import { Badge, Card, CardHeader, EmptyState, Progress, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { PIPELINE_STEPS } from "@/core/domain/types";
import type { PublicClip, PublicLog, PublicProject } from "@/lib/serializers";
import { api, post } from "@/lib/client";
import { cn, timecode } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

type ProjectPayload = {
  project: PublicProject;
  clips: PublicClip[];
  logs: PublicLog[];
  queuePosition: number;
};

function GenerateInner() {
  const params = useSearchParams();
  const toast = useToast();
  const [projectId, setProjectId] = useState<string | null>(params.get("project"));
  const [data, setData] = useState<ProjectPayload | null>(null);
  const [logs, setLogs] = useState<PublicLog[]>([]);
  const [retrying, setRetrying] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Pick up a link pasted on the landing page before signup.
  useEffect(() => {
    const pending = sessionStorage.getItem("clipper:pending-url");
    if (pending && !projectId) {
      sessionStorage.removeItem("clipper:pending-url");
      void post<{ project: PublicProject }>("/api/projects", { url: pending })
        .then((res) => setProjectId(res.project.id))
        .catch(() => {});
    }
  }, [projectId]);

  const loadOnce = useCallback(async (id: string) => {
    const payload = await api<ProjectPayload>(`/api/projects/${id}`);
    setData(payload);
    setLogs(payload.logs);
  }, []);

  useEffect(() => {
    if (!projectId) return;
    void loadOnce(projectId);
  }, [projectId, loadOnce]);

  // Live stream while the job is in flight.
  useEffect(() => {
    if (!projectId) return;
    const status = data?.project.status;
    if (status === "completed" || status === "failed") return;

    const source = new EventSource(`/api/projects/${projectId}/events`);

    source.addEventListener("progress", (e) => {
      const project = JSON.parse((e as MessageEvent).data) as PublicProject & {
        queuePosition: number;
      };
      setData((prev) => (prev ? { ...prev, project, queuePosition: project.queuePosition } : prev));
    });

    source.addEventListener("logs", (e) => {
      const incoming = JSON.parse((e as MessageEvent).data) as PublicLog[];
      setLogs((prev) => {
        const seen = new Set(prev.map((l) => l.id));
        return [...prev, ...incoming.filter((l) => !seen.has(l.id))];
      });
    });

    source.addEventListener("done", () => {
      source.close();
      void loadOnce(projectId);
    });

    source.onerror = () => source.close();
    return () => source.close();
  }, [projectId, data?.project.status, loadOnce]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [logs]);

  const retry = async () => {
    if (!projectId) return;
    setRetrying(true);
    try {
      await post(`/api/projects/${projectId}/retry`);
      await loadOnce(projectId);
      toast.success("Re-queued", "The pipeline is running again.");
    } catch {
      toast.error("Could not retry", "Please try again in a moment.");
    } finally {
      setRetrying(false);
    }
  };

  if (!projectId) {
    return (
      <>
        <PageHeader
          title="Generate Clip"
          subtitle="Paste a YouTube URL. AI does the rest, start to finish."
        />
        <Card className="p-5">
          <GenerateBar autoFocus onQueued={(p) => setProjectId(p.id)} />
          <div className="mt-5 grid gap-3 border-t border-white/6 pt-5 sm:grid-cols-3">
            {[
              ["Works on any public video", "Up to 3 hours depending on your plan."],
              ["Word-level accuracy", "Clips snap to sentence boundaries, never mid-word."],
              ["Ready to publish", "Captions, reframe and export presets included."],
            ].map(([t, d]) => (
              <div key={t}>
                <p className="text-[13px] font-medium">{t}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{d}</p>
              </div>
            ))}
          </div>
        </Card>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PageHeader title="Generate Clip" subtitle="Loading project…" />
        <Skeleton className="h-72 w-full" />
      </>
    );
  }

  const { project } = data;
  const running = project.status === "queued" || project.status === "running";
  const currentIdx = PIPELINE_STEPS.findIndex((s) => s.key === project.step);

  return (
    <>
      <PageHeader
        title={running ? "Analyzing video" : project.status === "failed" ? "Analysis failed" : "Clips ready"}
        subtitle={project.title}
        action={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setProjectId(null)}>
              New analysis
            </Button>
            {project.status !== "queued" && project.status !== "running" && (
              <Button variant="secondary" onClick={retry} loading={retrying}>
                <RotateCcw className="h-4 w-4" />
                Re-run
              </Button>
            )}
            <Button href={`/projects/${project.id}`}>
              Open project
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr]">
        {/* progress card */}
        <Card className="overflow-hidden">
          <div className="flex items-start gap-4 border-b border-white/6 p-5">
            <div className="relative h-[62px] w-[110px] shrink-0 overflow-hidden rounded-lg bg-ink-800">
              {project.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={project.thumbnailUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">{project.title}</p>
              <p className="truncate text-[12.5px] text-muted">{project.channel}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge>{timecode(project.durationSec)}</Badge>
                {project.language && <Badge>{project.language.toUpperCase()}</Badge>}
                <Badge tone={project.status === "failed" ? "danger" : running ? "brand" : "success"} dot={running}>
                  {project.status}
                </Badge>
              </div>
            </div>
          </div>

          <div className="p-5">
            <div className="mb-2 flex items-end justify-between">
              <div>
                <p className="text-[13px] font-medium">
                  {PIPELINE_STEPS[currentIdx]?.label ?? (project.status === "completed" ? "Complete" : "Queued")}
                </p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {project.status === "queued" && data.queuePosition > 0
                    ? `Position ${data.queuePosition} in queue`
                    : project.etaSec > 0
                      ? `About ${project.etaSec}s remaining`
                      : project.status === "completed"
                        ? `${data.clips.length} clips generated`
                        : ""}
                </p>
              </div>
              <span className="font-mono text-[22px] font-bold text-brand-300">{project.progress}%</span>
            </div>
            <Progress
              value={project.progress}
              tone={project.status === "failed" ? "danger" : project.status === "completed" ? "success" : "brand"}
            />

            {project.error && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/8 p-3 text-[12.5px] text-red-200">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{project.error}</span>
              </div>
            )}

            <ol className="mt-5 space-y-1">
              {PIPELINE_STEPS.map((s, i) => {
                const done = project.status === "completed" || i < currentIdx;
                const active = i === currentIdx && running;
                return (
                  <li key={s.key} className="flex items-center gap-2.5 text-[12.5px]">
                    {done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    ) : active ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-400" />
                    ) : (
                      <CircleDashed className="h-3.5 w-3.5 shrink-0 text-ink-600" />
                    )}
                    <span className={cn(done ? "text-ink-300" : active ? "font-medium text-white" : "text-ink-500")}>
                      {s.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </Card>

        {/* live log */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader
            title="Live log"
            subtitle="Everything the pipeline is doing, as it happens"
            action={<Terminal className="h-4 w-4 text-ink-500" />}
          />
          <div
            ref={logRef}
            className="max-h-[520px] min-h-[300px] flex-1 overflow-y-auto border-t border-white/6 bg-[var(--surface-2)] px-4 py-3 font-mono text-[11.5px] leading-relaxed"
          >
            {logs.length === 0 ? (
              <p className="text-ink-500">Waiting for the worker to pick up this job…</p>
            ) : (
              logs.map((l) => (
                <div key={l.id} className="flex gap-2.5 py-0.5">
                  <span className="shrink-0 text-ink-600">
                    {new Date(l.at).toLocaleTimeString(undefined, { hour12: false })}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 break-words",
                      l.level === "error" && "text-red-300",
                      l.level === "warn" && "text-amber-300",
                      l.level === "success" && "text-emerald-300",
                      l.level === "info" && "text-ink-300",
                    )}
                  >
                    {l.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {data.clips.length > 0 && (
        <Card className="mt-5">
          <CardHeader
            title={`${data.clips.length} clips generated`}
            subtitle="Sorted by their position in the source video"
            action={
              <Link href={`/projects/${project.id}`} className="text-[12.5px] text-brand-300 hover:underline">
                Full report
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-3 px-5 pb-5 sm:grid-cols-3 lg:grid-cols-5">
            {data.clips.map((c) => (
              <ClipCard key={c.id} clip={c} />
            ))}
          </div>
        </Card>
      )}

      {project.status === "completed" && data.clips.length === 0 && (
        <Card className="mt-5">
          <EmptyState
            icon={<Wand2 className="h-6 w-6" />}
            title="No clip met the quality bar"
            description="This video did not contain a self-contained story unit between 20 seconds and 5 minutes. Try a video with more continuous speech."
            action={
              <Button variant="secondary" onClick={() => setProjectId(null)}>
                Try another video
              </Button>
            }
          />
        </Card>
      )}
    </>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <GenerateInner />
    </Suspense>
  );
}
