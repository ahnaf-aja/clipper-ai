"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Copy, Download, MoreVertical, Pencil, Play, Sparkles, Trash2,
} from "lucide-react";
import type { PublicClip } from "@/lib/serializers";
import { Badge, Card } from "@/components/ui/primitives";
import { cn, formatBytes, relativeTime, scoreTone, timecode } from "@/lib/utils";

export function ClipCard({
  clip,
  onRename,
  onDuplicate,
  onDelete,
  onExport,
}: {
  clip: PublicClip;
  onRename?: (clip: PublicClip) => void;
  onDuplicate?: (clip: PublicClip) => void;
  onDelete?: (clip: PublicClip) => void;
  onExport?: (clip: PublicClip) => void;
}) {
  const [menu, setMenu] = useState(false);
  const tone = scoreTone(clip.score);
  const thumb = clip.video?.thumbnailUrl;

  return (
    <Card hover className="group relative flex flex-col overflow-hidden">
      <Link href={`/clips/${clip.id}`} className="relative block aspect-[9/16] max-h-[260px] overflow-hidden bg-ink-900">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="h-full w-full scale-[1.9] object-cover opacity-70 transition-transform duration-500 group-hover:scale-[2]"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-ink-800 to-ink-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/40" />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
          <span
            className={cn(
              "rounded-lg px-2 py-1 text-[11px] font-bold ring-1 ring-inset backdrop-blur-sm",
              tone.bg,
              tone.text,
              tone.ring,
            )}
          >
            {clip.score}
          </span>
          <span className="rounded-md bg-black/55 px-1.5 py-0.5 font-mono text-[10.5px] text-white/90 backdrop-blur-sm">
            {timecode(clip.durationSec)}
          </span>
        </div>

        <span className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/12 opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100">
          <Play className="ml-0.5 h-5 w-5 text-white" />
        </span>

        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-white">
            {clip.title}
          </p>
          <p className="mt-0.5 font-mono text-[10.5px] text-white/60">
            {timecode(clip.startSec)} – {timecode(clip.endSec)}
          </p>
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex flex-wrap gap-1">
          {clip.reasons.slice(0, 2).map((r) => (
            <Badge key={r.label} tone="brand" className="text-[10px]">
              {r.label}
            </Badge>
          ))}
          {clip.settings.subtitles && (
            <Badge tone="neutral" className="text-[10px]">
              CC
            </Badge>
          )}
        </div>

        <div className="mt-2.5 flex items-center justify-between text-[11.5px] text-ink-400">
          <span>{relativeTime(clip.createdAt)}</span>
          <span className="font-mono">{formatBytes(clip.fileBytes)}</span>
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          <Link
            href={`/clips/${clip.id}`}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-ink-750 text-[12.5px] font-medium text-ink-100 transition-colors hover:bg-ink-700"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Link>
          {onExport && (
            <button
              onClick={() => onExport(clip)}
              aria-label="Export clip"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300 transition-colors hover:bg-brand-500/25"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setMenu((m) => !m)}
              aria-label="More actions"
              aria-expanded={menu}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-white/6 hover:text-white"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute bottom-full right-0 z-20 mb-1 w-40 overflow-hidden rounded-xl border border-white/10 bg-[var(--surface-2)] py-1 shadow-[var(--shadow-lift)]">
                  {onRename && (
                    <MenuItem icon={Pencil} label="Rename" onClick={() => { setMenu(false); onRename(clip); }} />
                  )}
                  {onDuplicate && (
                    <MenuItem icon={Copy} label="Duplicate" onClick={() => { setMenu(false); onDuplicate(clip); }} />
                  )}
                  <Link
                    href={`/projects/${clip.projectId}`}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-[12.5px] text-ink-200 hover:bg-white/6"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    View project
                  </Link>
                  {onDelete && (
                    <MenuItem
                      icon={Trash2}
                      label="Delete"
                      danger
                      onClick={() => { setMenu(false); onDelete(clip); }}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 text-[12.5px] transition-colors hover:bg-white/6",
        danger ? "text-red-300" : "text-ink-200",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
