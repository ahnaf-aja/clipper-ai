"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, Loader2, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Badge, Card, EmptyState, Progress, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { api, del } from "@/lib/client";
import { useToast } from "@/components/ui/toast";
import type { PublicExport } from "@/lib/serializers";
import { formatBytes, relativeTime } from "@/lib/utils";

export default function ExportsPage() {
  const toast = useToast();
  const [exports, setExports] = useState<PublicExport[] | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ exports: PublicExport[] }>("/api/exports?limit=60");
    setExports(res.exports);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!exports?.some((e) => e.status === "queued" || e.status === "rendering")) return;
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [exports, load]);

  const remove = async (job: PublicExport) => {
    if (!confirm("Delete this export? The file will be removed from your storage.")) return;
    const prev = exports;
    setExports((e) => e?.filter((x) => x.id !== job.id) ?? null);
    try {
      await del(`/api/exports/${job.id}`);
      toast.success("Export deleted");
    } catch {
      setExports(prev ?? null);
      toast.error("Could not delete export");
    }
  };

  return (
    <>
      <PageHeader
        title="Exports"
        subtitle="Every render you have queued, with its download."
        action={<Button href="/clips">Go to clips</Button>}
      />

      {!exports ? (
        <Skeleton className="h-72 w-full" />
      ) : exports.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Upload className="h-6 w-6" />}
            title="No exports yet"
            description="Open any clip, choose an aspect ratio and resolution, and your render will land here."
            action={<Button href="/clips">Browse clips</Button>}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 border-b border-white/6 bg-[var(--surface-2)] px-5 py-3 text-[11.5px] font-semibold uppercase tracking-wider text-ink-400 md:grid">
            <span>Clip</span>
            <span>Format</span>
            <span>Size</span>
            <span>Status</span>
            <span />
          </div>

          <div className="divide-y divide-white/5">
            {exports.map((job) => (
              <div
                key={job.id}
                className="grid grid-cols-1 items-center gap-3 px-5 py-3.5 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:gap-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/clips/${job.clipId}`}
                    className="block truncate text-[13.5px] font-medium hover:text-brand-300"
                  >
                    {job.clipTitle || "Untitled clip"}
                  </Link>
                  <p className="text-[12px] text-muted">{relativeTime(job.createdAt)}</p>
                </div>

                <div className="text-[12.5px] text-ink-300">
                  <span className="font-mono">{job.resolution}</span> · {job.aspect} · {job.fps}fps
                  <span className="block text-[11.5px] uppercase text-ink-500">{job.codec}</span>
                </div>

                <span className="font-mono text-[12.5px] text-ink-300">
                  {formatBytes(job.fileBytes)}
                </span>

                <div>
                  {job.status === "done" ? (
                    <Badge tone="success">Ready</Badge>
                  ) : job.status === "failed" ? (
                    <Badge tone="danger">Failed</Badge>
                  ) : (
                    <div className="w-full max-w-[120px]">
                      <div className="mb-1 flex items-center gap-1.5 text-[11.5px] text-brand-300">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {job.progress}%
                      </div>
                      <Progress value={job.progress} className="h-1" />
                    </div>
                  )}
                  {job.watermark && job.status === "done" && (
                    <p className="mt-1 text-[10.5px] text-ink-500">watermarked</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {job.status === "done" && (
                    <a
                      href={`/api/exports/${job.id}/download`}
                      className="flex h-8 items-center gap-1.5 rounded-lg bg-brand-500/15 px-2.5 text-[12.5px] font-medium text-brand-300 transition-colors hover:bg-brand-500/25"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </a>
                  )}
                  <button
                    onClick={() => remove(job)}
                    aria-label="Delete export"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {job.error && (
                  <p className="col-span-full rounded-lg bg-red-500/8 px-2.5 py-1.5 text-[11.5px] text-red-300">
                    {job.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
