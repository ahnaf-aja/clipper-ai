"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FolderKanban, Loader2, Search, Sparkles, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Badge, Card, EmptyState, Input, Progress, Segmented, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { api, del } from "@/lib/client";
import { useToast } from "@/components/ui/toast";
import type { PublicProject } from "@/lib/serializers";
import { relativeTime, timecode } from "@/lib/utils";

type Filter = "all" | "running" | "completed" | "failed";

export default function ProjectsPage() {
  const toast = useToast();
  const [projects, setProjects] = useState<PublicProject[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const res = await api<{ projects: PublicProject[] }>("/api/projects?limit=50");
    setProjects(res.projects);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while anything is in flight.
  useEffect(() => {
    if (!projects?.some((p) => p.status === "running" || p.status === "queued")) return;
    const id = setInterval(load, 2500);
    return () => clearInterval(id);
  }, [projects, load]);

  const remove = async (project: PublicProject) => {
    if (!confirm(`Delete "${project.title}" and all of its clips? This cannot be undone.`)) return;
    const previous = projects;
    setProjects((p) => p?.filter((x) => x.id !== project.id) ?? null); // optimistic
    try {
      await del(`/api/projects/${project.id}`);
      toast.success("Project deleted");
    } catch {
      setProjects(previous ?? null);
      toast.error("Could not delete", "The project is still there.");
    }
  };

  const visible = (projects ?? []).filter((p) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "running" ? p.status === "running" || p.status === "queued" : p.status === filter);
    const matchesQuery =
      !q || p.title.toLowerCase().includes(q.toLowerCase()) || p.channel.toLowerCase().includes(q.toLowerCase());
    return matchesFilter && matchesQuery;
  });

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Every video you have run through the pipeline."
        action={
          <Button href="/generate">
            <Sparkles className="h-4 w-4" />
            New project
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "running", label: "Processing" },
            { value: "completed", label: "Completed" },
            { value: "failed", label: "Failed" },
          ]}
        />
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects…"
            className="pl-9"
            aria-label="Search projects"
          />
        </div>
      </div>

      {!projects ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderKanban className="h-6 w-6" />}
            title={q || filter !== "all" ? "Nothing matches that" : "No projects yet"}
            description={
              q || filter !== "all"
                ? "Try a different search or filter."
                : "Paste a YouTube link and your first project will show up here."
            }
            action={!q && filter === "all" ? <Button href="/generate">Generate clips</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <Card key={p.id} hover className="group flex flex-col overflow-hidden">
              <Link href={`/projects/${p.id}`} className="relative block aspect-video overflow-hidden bg-ink-900">
                {p.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
                  <span className="rounded-md bg-black/55 px-1.5 py-0.5 font-mono text-[10.5px] text-white/90">
                    {timecode(p.durationSec)}
                  </span>
                  <Badge
                    tone={
                      p.status === "completed" ? "success" : p.status === "failed" ? "danger" : "brand"
                    }
                    dot={p.status === "running" || p.status === "queued"}
                  >
                    {p.status}
                  </Badge>
                </div>
              </Link>

              <div className="flex flex-1 flex-col p-4">
                <Link href={`/projects/${p.id}`} className="line-clamp-2 text-[13.5px] font-semibold leading-snug hover:text-brand-300">
                  {p.title}
                </Link>
                <p className="mt-1 truncate text-[12px] text-muted">
                  {p.channel} · {relativeTime(p.createdAt)}
                </p>

                {(p.status === "running" || p.status === "queued") && (
                  <div className="mt-3">
                    <div className="mb-1.5 flex items-center gap-2 text-[11.5px] text-ink-300">
                      <Loader2 className="h-3 w-3 animate-spin text-brand-400" />
                      {p.step.replace(/_/g, " ")}
                      <span className="ml-auto font-mono">{p.progress}%</span>
                    </div>
                    <Progress value={p.progress} />
                  </div>
                )}

                {p.error && (
                  <p className="mt-3 line-clamp-2 rounded-lg bg-red-500/8 px-2.5 py-1.5 text-[11.5px] text-red-300">
                    {p.error}
                  </p>
                )}

                <div className="mt-auto flex items-center justify-between pt-3">
                  <span className="text-[12px] text-ink-400">
                    {p.clipCount} clip{p.clipCount === 1 ? "" : "s"}
                  </span>
                  <button
                    onClick={() => remove(p)}
                    aria-label={`Delete ${p.title}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
