"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity, ArrowRight, CheckCircle2, Clock, Database, FolderKanban,
  Gauge, HardDrive, Loader2, Scissors, Sparkles, TriangleAlert, Upload, Zap,
} from "lucide-react";
import type { Capabilities } from "@/infra/media/capabilities";
import type { Plan } from "@/core/domain/plans";
import type { PublicClip, PublicProject, PublicUser } from "@/lib/serializers";
import { PageHeader } from "@/components/app/page-header";
import { ClipCard } from "@/components/app/clip-card";
import { GenerateBar } from "@/components/app/generate-bar";
import { Badge, Card, CardHeader, EmptyState, Progress, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import { cn, formatBytes, relativeTime, timecode } from "@/lib/utils";

type DashboardData = {
  user: PublicUser;
  plan: Plan;
  recentProjects: PublicProject[];
  processing: PublicProject[];
  topClips: PublicClip[];
  stats: {
    projects: number; clips: number; exports: number; avgScore: number;
    minutesAnalyzed: number; creditsRemaining: number; creditsTotal: number;
    storageBytes: number; storageLimitBytes: number;
  };
  queue: { depth: number; active: number };
  capabilities: Capabilities;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api<DashboardData>("/api/dashboard"));
      setError("");
    } catch {
      setError("Could not load your dashboard. Retrying…");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the processing queue live without hammering the server.
  useEffect(() => {
    if (!data?.processing.length) return;
    const id = setInterval(load, 2500);
    return () => clearInterval(id);
  }, [data?.processing.length, load]);

  if (!data) return <DashboardSkeleton error={error} />;

  const { stats, plan } = data;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${data.user.name.split(" ")[0]}`}
        subtitle="Paste a link and the pipeline takes it from there."
        action={
          <Button href="/generate">
            <Sparkles className="h-4 w-4" />
            New clip
          </Button>
        }
      />

      {!data.capabilities.fullPipeline && <ToolchainNotice caps={data.capabilities} />}

      <Card className="mb-6 p-5">
        <GenerateBar />
      </Card>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={FolderKanban} label="Projects" value={stats.projects} hint={`${stats.minutesAnalyzed} min analysed`} />
        <Stat icon={Scissors} label="Clips" value={stats.clips} hint={`Avg score ${stats.avgScore}`} />
        <Stat icon={Upload} label="Exports" value={stats.exports} hint="Completed" />
        <Stat
          icon={Gauge}
          label="Credits"
          value={stats.creditsRemaining}
          hint={`of ${stats.creditsTotal} this month`}
          progress={(stats.creditsRemaining / Math.max(1, stats.creditsTotal)) * 100}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          {data.processing.length > 0 && (
            <Card>
              <CardHeader
                title="Processing queue"
                subtitle={`${data.queue.active} running · ${data.queue.depth} waiting`}
                action={<Badge tone="brand" dot>Live</Badge>}
              />
              <div className="space-y-2 px-5 pb-5">
                {data.processing.map((p) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="block rounded-xl border border-white/6 bg-[var(--surface-2)] p-3.5 transition-colors hover:border-white/12"
                  >
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">{p.title}</p>
                        <p className="text-[12px] text-muted">
                          {p.step.replace(/_/g, " ")} · {p.etaSec > 0 ? `~${p.etaSec}s left` : "finishing"}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-[12px] text-brand-300">{p.progress}%</span>
                    </div>
                    <Progress value={p.progress} className="mt-2.5" />
                  </Link>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Recent projects"
              subtitle="Your latest analyses"
              action={
                <Link href="/projects" className="flex items-center gap-1 text-[12.5px] text-brand-300 hover:underline">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              }
            />
            {data.recentProjects.length === 0 ? (
              <EmptyState
                icon={<FolderKanban className="h-6 w-6" />}
                title="No projects yet"
                description="Paste a YouTube link above and your first clips will appear here in a couple of minutes."
              />
            ) : (
              <div className="divide-y divide-white/5">
                {data.recentProjects.map((p) => (
                  <ProjectRow key={p.id} project={p} />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Usage" subtitle={`${plan.name} plan`} />
            <div className="space-y-4 px-5 pb-5">
              <UsageBar
                icon={Zap}
                label="Analysis credits"
                value={`${stats.creditsRemaining} / ${stats.creditsTotal}`}
                pct={(stats.creditsRemaining / Math.max(1, stats.creditsTotal)) * 100}
                tone={stats.creditsRemaining / Math.max(1, stats.creditsTotal) < 0.15 ? "danger" : "brand"}
              />
              <UsageBar
                icon={HardDrive}
                label="Storage"
                value={`${formatBytes(stats.storageBytes)} / ${plan.storageGb} GB`}
                pct={(stats.storageBytes / Math.max(1, stats.storageLimitBytes)) * 100}
              />
              <UsageBar
                icon={Activity}
                label="Concurrent renders"
                value={`${data.queue.active} / ${plan.concurrency}`}
                pct={(data.queue.active / Math.max(1, plan.concurrency)) * 100}
              />
              {plan.id === "free" && (
                <Button href="/billing" variant="secondary" className="w-full">
                  Upgrade for more
                </Button>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Top scoring clips"
              subtitle="Publish these first"
              action={
                <Link href="/clips" className="flex items-center gap-1 text-[12.5px] text-brand-300 hover:underline">
                  All clips <ArrowRight className="h-3 w-3" />
                </Link>
              }
            />
            {data.topClips.length === 0 ? (
              <EmptyState
                icon={<Scissors className="h-6 w-6" />}
                title="No clips yet"
                description="Once a project finishes, its highest-scoring clips show up here."
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 px-5 pb-5">
                {data.topClips.map((c) => (
                  <ClipCard key={c.id} clip={c} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------- pieces */

function ProjectRow({ project }: { project: PublicProject }) {
  const statusTone =
    project.status === "completed" ? "success" : project.status === "failed" ? "danger" : "brand";

  return (
    <Link
      href={`/projects/${project.id}`}
      className="flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-white/[.025]"
    >
      <div className="relative h-11 w-[74px] shrink-0 overflow-hidden rounded-lg bg-ink-800">
        {project.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium">{project.title}</p>
        <p className="truncate text-[12px] text-muted">
          {project.channel} · {timecode(project.durationSec)} · {relativeTime(project.createdAt)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        {project.clipCount > 0 && (
          <span className="text-[12px] text-ink-300">{project.clipCount} clips</span>
        )}
        <Badge tone={statusTone} dot={project.status === "running"}>
          {project.status}
        </Badge>
      </div>
    </Link>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  progress,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  hint: string;
  progress?: number;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-ink-400">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[12px] font-medium">{label}</span>
      </div>
      <p className="mt-2 text-[26px] font-bold leading-none tracking-tight">{value}</p>
      <p className="mt-1.5 text-[11.5px] text-ink-400">{hint}</p>
      {progress !== undefined && <Progress value={progress} className="mt-2.5" />}
    </Card>
  );
}

function UsageBar({
  icon: Icon,
  label,
  value,
  pct,
  tone = "brand",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  pct: number;
  tone?: "brand" | "danger";
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
        <span className="flex items-center gap-1.5 text-ink-300">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
        <span className="font-mono text-ink-200">{value}</span>
      </div>
      <Progress value={pct} tone={tone} />
    </div>
  );
}

function ToolchainNotice({ caps }: { caps: Capabilities }) {
  const missing = [
    !caps.ytdlp && "yt-dlp",
    !caps.ffmpeg && "ffmpeg",
    !caps.whisper && "a local Whisper engine",
  ].filter(Boolean) as string[];

  return (
    <Card className="mb-5 border-amber-500/25 bg-amber-500/[.05] p-4">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="min-w-0 text-[13px] leading-relaxed">
          <p className="font-medium text-amber-200">
            Running without the full media toolchain
          </p>
          <p className="mt-1 text-amber-200/70">
            {missing.join(", ")} {missing.length > 1 ? "are" : "is"} not installed on this server.
            Analysis, scoring, captions and the live preview all work — transcripts come from
            YouTube&apos;s own caption track. Install the missing tools to get burned-in MP4 exports
            instead of edit-decision packages.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Cap ok={caps.ytdlp} label="yt-dlp" />
            <Cap ok={caps.ffmpeg} label="ffmpeg" />
            <Cap ok={caps.whisper} label="whisper" />
            <Cap ok={caps.llm} label="LLM analysis" />
          </div>
        </div>
      </div>
    </Card>
  );
}

function Cap({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10.5px]",
        ok ? "bg-emerald-500/12 text-emerald-300" : "bg-ink-700 text-ink-400",
      )}
    >
      {ok ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

function DashboardSkeleton({ error }: { error: string }) {
  return (
    <>
      <PageHeader title="Dashboard" subtitle={error || "Loading your workspace…"} />
      <Skeleton className="mb-6 h-24 w-full" />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px]" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
      {error && (
        <p className="mt-4 flex items-center gap-2 text-[13px] text-amber-300">
          <Database className="h-4 w-4" />
          {error}
        </p>
      )}
    </>
  );
}
