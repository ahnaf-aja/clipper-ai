"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download, Loader2, X } from "lucide-react";
import type { PublicClip, PublicExport } from "@/lib/serializers";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Progress, Segmented } from "@/components/ui/primitives";
import { getTemplate } from "@/core/domain/templates";
import { api, errorMessage, post } from "@/lib/client";
import { useToast } from "@/components/ui/toast";
import { formatBytes } from "@/lib/utils";

type Aspect = "9:16" | "16:9" | "1:1";
type Res = "720p" | "1080p" | "2K" | "4K";

export function ExportDialog({ clip, onClose }: { clip: PublicClip; onClose: () => void }) {
  const toast = useToast();
  const [aspect, setAspect] = useState<Aspect>(clip.settings.aspect);
  const [resolution, setResolution] = useState<Res>("1080p");
  const [fps, setFps] = useState<30 | 60>(30);
  const [codec, setCodec] = useState<"h264" | "h265">("h264");

  const [job, setJob] = useState<PublicExport | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  // Poll the job until it terminates.
  useEffect(() => {
    if (!job || job.status === "done" || job.status === "failed") return;
    const id = setInterval(async () => {
      try {
        const res = await api<{ export: PublicExport }>(`/api/exports/${job.id}`);
        setJob(res.export);
        if (res.export.status === "done") toast.success("Export ready", "Your download is available.");
        if (res.export.status === "failed") toast.error("Export failed", res.export.error);
      } catch {
        /* keep polling */
      }
    }, 1200);
    return () => clearInterval(id);
  }, [job, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const start = async () => {
    setError("");
    setStarting(true);
    try {
      const res = await post<{ export: PublicExport }>("/api/exports", {
        clipId: clip.id,
        aspect,
        resolution,
        fps,
        codec,
      });
      setJob(res.export);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/65 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Export clip"
    >
      <div className="w-full max-w-md animate-[rise_.28s_both] rounded-2xl border border-white/10 bg-[var(--surface)] shadow-[var(--shadow-lift)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/6 p-5">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight">Export clip</h2>
            <p className="mt-0.5 truncate text-[12.5px] text-muted">{clip.title}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-ink-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {job ? (
          <div className="p-5">
            {job.status === "done" ? (
              <>
                <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-3.5">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                  <div className="text-[13px]">
                    <p className="font-medium text-emerald-200">Export complete</p>
                    <p className="text-emerald-200/70">
                      {job.resolution} · {job.aspect} · {job.fps}fps · {formatBytes(job.fileBytes)}
                    </p>
                  </div>
                </div>
                <Button
                  href={`/api/exports/${job.id}/download`}
                  size="lg"
                  className="w-full"
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
                <Button variant="ghost" className="mt-2 w-full" onClick={onClose}>
                  Done
                </Button>
              </>
            ) : job.status === "failed" ? (
              <>
                <Alert>{job.error || "The export failed."}</Alert>
                <Button variant="secondary" className="mt-4 w-full" onClick={() => setJob(null)}>
                  Try again
                </Button>
              </>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2.5 text-[13px]">
                  <Loader2 className="h-4 w-4 animate-spin text-brand-400" />
                  <span>Rendering {job.resolution} {job.aspect}…</span>
                  <span className="ml-auto font-mono text-ink-300">{job.progress}%</span>
                </div>
                <Progress value={job.progress} />
                <p className="mt-3 text-[12px] leading-relaxed text-muted">
                  You can close this dialog — the export continues and appears under Exports when
                  it&apos;s ready.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4 p-5">
            {error && <Alert>{error}</Alert>}

            <Setting label="Aspect ratio">
              <Segmented<Aspect>
                value={aspect}
                onChange={setAspect}
                options={[
                  { value: "9:16", label: "9:16" },
                  { value: "1:1", label: "1:1" },
                  { value: "16:9", label: "16:9" },
                ]}
              />
            </Setting>

            <Setting label="Resolution">
              <Segmented<Res>
                value={resolution}
                onChange={setResolution}
                size="sm"
                options={[
                  { value: "720p", label: "720p" },
                  { value: "1080p", label: "1080p" },
                  { value: "2K", label: "2K" },
                  { value: "4K", label: "4K" },
                ]}
              />
            </Setting>

            <Setting label="Frame rate">
              <Segmented<"30" | "60">
                value={String(fps) as "30" | "60"}
                onChange={(v) => setFps(Number(v) as 30 | 60)}
                options={[
                  { value: "30", label: "30 fps" },
                  { value: "60", label: "60 fps" },
                ]}
              />
            </Setting>

            <Setting label="Codec">
              <Segmented<"h264" | "h265">
                value={codec}
                onChange={setCodec}
                options={[
                  { value: "h264", label: "H.264" },
                  { value: "h265", label: "H.265" },
                ]}
              />
            </Setting>

            <div className="space-y-2 rounded-xl border border-white/6 bg-[var(--surface-2)] px-3.5 py-2.5 text-[12.5px]">
              <div className="flex items-center justify-between">
                <span className="text-ink-300">Template</span>
                <Badge tone="brand">{getTemplate(clip.settings.template).name}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-300">Scenes</span>
                <Badge tone="neutral">
                  {clip.scenes.length} segment{clip.scenes.length === 1 ? "" : "s"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-300">Captions</span>
                <Badge tone={clip.settings.subtitles ? "success" : "neutral"}>
                  {clip.settings.subtitles ? `Burned in · ${clip.settings.stylePreset}` : "Off"}
                </Badge>
              </div>
              <p className="pt-0.5 text-[11px] leading-snug text-ink-500">
                Change the template in the editor&apos;s Style tab — it previews live.
              </p>
            </div>

            <Button size="lg" className="w-full" onClick={start} loading={starting}>
              <Download className="h-4 w-4" />
              Start export
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[13px] text-ink-200">{label}</span>
      {children}
    </div>
  );
}
