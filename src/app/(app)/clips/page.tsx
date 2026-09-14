"use client";

import { useCallback, useEffect, useState } from "react";
import { Scissors, Search, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ClipCard } from "@/components/app/clip-card";
import { Card, EmptyState, Input, Segmented, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { api, del, post } from "@/lib/client";
import { useToast } from "@/components/ui/toast";
import type { PublicClip } from "@/lib/serializers";
import { ExportDialog } from "@/components/app/export-dialog";

type Sort = "recent" | "score" | "duration";

export default function ClipsPage() {
  const toast = useToast();
  const [clips, setClips] = useState<PublicClip[] | null>(null);
  const [sort, setSort] = useState<Sort>("recent");
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState<PublicClip | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ clips: PublicClip[] }>(
      `/api/clips?limit=60&sort=${sort}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
    );
    setClips(res.clips);
  }, [sort, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 280 : 0); // debounce search
    return () => clearTimeout(t);
  }, [load, q]);

  const remove = async (clip: PublicClip) => {
    if (!confirm(`Delete "${clip.title}"?`)) return;
    const prev = clips;
    setClips((c) => c?.filter((x) => x.id !== clip.id) ?? null);
    try {
      await del(`/api/clips/${clip.id}`);
      toast.success("Clip deleted");
    } catch {
      setClips(prev ?? null);
      toast.error("Could not delete clip");
    }
  };

  const duplicate = async (clip: PublicClip) => {
    try {
      await post(`/api/clips/${clip.id}/duplicate`);
      await load();
      toast.success("Clip duplicated");
    } catch {
      toast.error("Could not duplicate clip");
    }
  };

  const rename = async (clip: PublicClip) => {
    const title = prompt("Rename clip", clip.title);
    if (!title || title === clip.title) return;
    setClips((c) => c?.map((x) => (x.id === clip.id ? { ...x, title } : x)) ?? null);
    try {
      await api(`/api/clips/${clip.id}`, { method: "PATCH", body: JSON.stringify({ title }) });
    } catch {
      await load();
      toast.error("Could not rename clip");
    }
  };

  return (
    <>
      <PageHeader
        title="My Clips"
        subtitle="Everything the AI has cut for you."
        action={
          <Button href="/generate">
            <Sparkles className="h-4 w-4" />
            Generate more
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented<Sort>
          value={sort}
          onChange={setSort}
          options={[
            { value: "recent", label: "Newest" },
            { value: "score", label: "Highest score" },
            { value: "duration", label: "Longest" },
          ]}
        />
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clips…"
            className="pl-9"
            aria-label="Search clips"
          />
        </div>
      </div>

      {!clips ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-[420px]" />
          ))}
        </div>
      ) : clips.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Scissors className="h-6 w-6" />}
            title={q ? "No clips match that search" : "No clips yet"}
            description={
              q
                ? "Try a different search term."
                : "Run a video through the pipeline and its clips will collect here."
            }
            action={!q ? <Button href="/generate">Generate clips</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {clips.map((c) => (
            <ClipCard
              key={c.id}
              clip={c}
              onDelete={remove}
              onDuplicate={duplicate}
              onRename={rename}
              onExport={setExporting}
            />
          ))}
        </div>
      )}

      {exporting && <ExportDialog clip={exporting} onClose={() => setExporting(null)} />}
    </>
  );
}
