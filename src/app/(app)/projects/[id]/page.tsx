"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Brain, FileText, Lightbulb, RotateCcw, Share2, Sparkles, Target, TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ClipCard } from "@/components/app/clip-card";
import { Badge, Card, CardHeader, EmptyState, Progress, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { api, del, post } from "@/lib/client";
import { useToast } from "@/components/ui/toast";
import type { PublicClip, PublicLog, PublicProject } from "@/lib/serializers";
import { relativeTime, timecode } from "@/lib/utils";

type Payload = {
  project: PublicProject;
  clips: PublicClip[];
  logs: PublicLog[];
  transcript: {
    provider: string;
    language: string;
    model: string;
    forced: boolean;
    langConf: number;
    wordConf: number;
    preview: string;
  } | null;
};

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setData(await api<Payload>(`/api/projects/${id}`));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const status = data?.project.status;
    if (status !== "running" && status !== "queued") return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [data?.project.status, load]);

  const rerun = async () => {
    setBusy(true);
    try {
      await post(`/api/projects/${id}/retry`);
      await load();
      toast.success("Re-queued", "The pipeline is running again.");
    } catch {
      toast.error("Could not re-run");
    } finally {
      setBusy(false);
    }
  };

  const deleteClip = async (clip: PublicClip) => {
    if (!confirm(`Delete "${clip.title}"?`)) return;
    setData((d) => (d ? { ...d, clips: d.clips.filter((c) => c.id !== clip.id) } : d));
    try {
      await del(`/api/clips/${clip.id}`);
      toast.success("Clip deleted");
    } catch {
      await load();
      toast.error("Could not delete clip");
    }
  };

  const duplicateClip = async (clip: PublicClip) => {
    try {
      await post(`/api/clips/${clip.id}/duplicate`);
      await load();
      toast.success("Clip duplicated");
    } catch {
      toast.error("Could not duplicate clip");
    }
  };

  const renameClip = async (clip: PublicClip) => {
    const title = prompt("Rename clip", clip.title);
    if (!title || title === clip.title) return;
    setData((d) =>
      d ? { ...d, clips: d.clips.map((c) => (c.id === clip.id ? { ...c, title } : c)) } : d,
    );
    try {
      await api(`/api/clips/${clip.id}`, { method: "PATCH", body: JSON.stringify({ title }) });
    } catch {
      await load();
      toast.error("Could not rename clip");
    }
  };

  if (!data) {
    return (
      <>
        <Skeleton className="mb-6 h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </>
    );
  }

  const { project, clips, insight } = { ...data, insight: data.project.insight };

  return (
    <>
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All projects
      </Link>

      <PageHeader
        title={project.title}
        subtitle={`${project.channel} · ${timecode(project.durationSec)} · ${relativeTime(project.createdAt)}`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={rerun} loading={busy}>
              <RotateCcw className="h-4 w-4" />
              Re-run
            </Button>
            <Button href={`/generate?project=${project.id}`} variant="ghost">
              Live view
            </Button>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <Badge tone={project.status === "completed" ? "success" : project.status === "failed" ? "danger" : "brand"}>
          {project.status}
        </Badge>
        {project.language && <Badge>{project.language.toUpperCase()}</Badge>}
        {data.transcript && (
          <>
            <Badge tone={data.transcript.provider === "synthetic" ? "danger" : "info"}>
              Transcript: {data.transcript.model || data.transcript.provider}
            </Badge>
            <Badge tone={data.transcript.forced ? "success" : "neutral"}>
              {data.transcript.language.toUpperCase()}{" "}
              {data.transcript.forced
                ? "selected"
                : `detected ${Math.round(data.transcript.langConf * 100)}%`}
            </Badge>
            {data.transcript.wordConf > 0 && (
              <Badge tone={data.transcript.wordConf >= 0.75 ? "success" : "warn"}>
                Word accuracy {Math.round(data.transcript.wordConf * 100)}%
              </Badge>
            )}
          </>
        )}
        <Badge tone={project.engine === "real" ? "success" : "neutral"}>
          Engine: {project.engine || "local"}
        </Badge>
        <Badge>{clips.length} clips</Badge>
      </div>

      {data.transcript?.provider === "synthetic" && (
        <Card className="mb-5 border-red-500/30 bg-red-500/[.06] p-4">
          <p className="text-[13px] leading-relaxed text-red-200">
            <strong className="font-semibold">Simulated transcript — the subtitles do not match
            the audio.</strong>{" "}
            No real transcript was available and simulation is explicitly enabled. Turn off
            <code className="mx-1 font-mono text-[12px]">ALLOW_SIMULATED_TRANSCRIPT</code>
            to make this fail loudly instead.
          </p>
        </Card>
      )}

      {data.transcript?.provider === "youtube" && data.transcript.model === "youtube-asr" && (
        <Card className="mb-5 border-amber-500/25 bg-amber-500/[.05] p-4">
          <p className="text-[13px] leading-relaxed text-amber-200">
            <strong className="font-semibold">Auto-generated captions.</strong> This transcript came
            from YouTube&apos;s speech recognition, which has no punctuation and frequently misreads
            names, numbers and code-switched speech. Install a Whisper engine for a materially more
            accurate transcript — see the README.
          </p>
        </Card>
      )}

      {project.status === "running" || project.status === "queued" ? (
        <Card className="mb-5 p-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-medium">{project.step.replace(/_/g, " ")}</span>
            <span className="font-mono text-[13px] text-brand-300">{project.progress}%</span>
          </div>
          <Progress value={project.progress} />
        </Card>
      ) : null}

      {insight && insight.bestClipIndex >= 0 && (
        <Card className="mb-5 overflow-hidden">
          <div className="border-b border-white/6 bg-gradient-to-r from-brand-500/10 to-transparent px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/25">
                <Brain className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold tracking-tight">AI Insight</h2>
                <p className="mt-0.5 text-[13px] text-brand-200">{insight.headline}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-5 p-5 lg:grid-cols-[1.5fr_1fr]">
            <ul className="space-y-2.5">
              {insight.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-200">
                  <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  {b}
                </li>
              ))}
            </ul>

            <div className="space-y-4 rounded-xl border border-white/6 bg-[var(--surface-2)] p-4">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-400">
                Predictions
              </p>
              <Prediction icon={TrendingUp} label="Retention" value={insight.predictions.retention} />
              <Prediction icon={Share2} label="Engagement" value={insight.predictions.engagement} />
              <Prediction icon={Target} label="Share rate" value={insight.predictions.share} />
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title={`${clips.length} clips`}
          subtitle="In source order. Open any clip to edit and export."
          action={
            data.transcript && (
              <button
                onClick={() => setShowTranscript((s) => !s)}
                className="flex items-center gap-1.5 text-[12.5px] text-brand-300 hover:underline"
              >
                <FileText className="h-3.5 w-3.5" />
                {showTranscript ? "Hide" : "Show"} transcript
              </button>
            )
          }
        />

        {showTranscript && data.transcript && (
          <div className="mx-5 mb-4 max-h-64 overflow-y-auto rounded-xl border border-white/6 bg-[var(--surface-2)] p-4 text-[12.5px] leading-relaxed text-ink-300">
            {data.transcript.preview}
          </div>
        )}

        {clips.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-6 w-6" />}
            title={project.status === "failed" ? "This run failed" : "No clips yet"}
            description={
              project.error ||
              (project.status === "completed"
                ? "No segment satisfied the clip rules for this video."
                : "Clips appear here as soon as the pipeline finishes.")
            }
            action={
              project.status !== "running" && project.status !== "queued" ? (
                <Button onClick={rerun} loading={busy} variant="secondary">
                  Re-run analysis
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 px-5 pb-5 sm:grid-cols-3 lg:grid-cols-5">
            {clips.map((c) => (
              <ClipCard
                key={c.id}
                clip={c}
                onDelete={deleteClip}
                onDuplicate={duplicateClip}
                onRename={renameClip}
              />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function Prediction({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
        <span className="flex items-center gap-1.5 text-ink-300">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
        <span className="font-mono font-semibold text-ink-100">{value}%</span>
      </div>
      <Progress value={value} tone={value >= 70 ? "success" : "brand"} />
    </div>
  );
}
