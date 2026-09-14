"use client";

import { useRef } from "react";
import { Scissors, Trash2 } from "lucide-react";
import {
  MIN_SCENE_SEC,
  PRESET_LABELS,
  sceneBounds,
  type Scene,
} from "@/core/domain/scenes";
import { Button } from "@/components/ui/button";
import { cn, timecode } from "@/lib/utils";

const SEGMENT_COLORS = [
  "from-brand-500/45 to-brand-600/25 border-brand-400/40",
  "from-sky-500/45 to-sky-600/25 border-sky-400/40",
  "from-emerald-500/45 to-emerald-600/25 border-emerald-400/40",
  "from-amber-500/45 to-amber-600/25 border-amber-400/40",
  "from-rose-500/45 to-rose-600/25 border-rose-400/40",
  "from-cyan-500/45 to-cyan-600/25 border-cyan-400/40",
];

/**
 * Video-editor style timeline. Each block is a scene; the gaps between them are
 * user-placed cut points. Clicking a block selects it for framing, clicking the
 * ruler scrubs, and Add Cut splits the scene under the playhead.
 */
export function SceneTimeline({
  scenes,
  duration,
  time,
  selectedId,
  onSelect,
  onSeek,
  onAddCut,
  onRemoveCut,
}: {
  scenes: Scene[];
  duration: number;
  time: number;
  selectedId: string;
  onSelect: (id: string) => void;
  onSeek: (t: number) => void;
  onAddCut: (t: number) => void;
  onRemoveCut: (id: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const pct = (t: number) => `${(t / Math.max(0.1, duration)) * 100}%`;

  const scrubTo = (clientX: number) => {
    const box = trackRef.current?.getBoundingClientRect();
    if (!box) return;
    const t = ((clientX - box.left) / box.width) * duration;
    onSeek(Math.max(0, Math.min(duration, t)));
  };

  // Can we cut here? Not on top of an existing cut or at the very edges.
  const activeIndex = scenes.reduce((acc, s, i) => (s.start <= time + 1e-6 ? i : acc), 0);
  const { start: aStart, end: aEnd } = sceneBounds(scenes, activeIndex, duration);
  const canCut = time - aStart >= MIN_SCENE_SEC && aEnd - time >= MIN_SCENE_SEC;

  // Roughly one tick every ~5s, snapped to something readable.
  const tickStep = duration <= 30 ? 5 : duration <= 90 ? 10 : duration <= 180 ? 20 : 30;
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += tickStep) ticks.push(t);

  return (
    <div className="rounded-xl border border-white/6 bg-[var(--surface-2)] p-3.5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
          <Scissors className="h-3.5 w-3.5 text-brand-400" />
          Scenes
          <span className="text-ink-500">
            · {scenes.length} segment{scenes.length === 1 ? "" : "s"}
          </span>
        </span>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onAddCut(time)}
            disabled={!canCut}
            title={
              canCut
                ? `Cut at ${timecode(time)}`
                : `A scene must be at least ${MIN_SCENE_SEC}s — move the playhead further from the nearest cut`
            }
          >
            <Scissors className="h-3.5 w-3.5" />
            Add Cut
          </Button>
          {scenes.length > 1 && (
            <button
              onClick={() => onRemoveCut(selectedId)}
              disabled={scenes[0]?.id === selectedId}
              title={
                scenes[0]?.id === selectedId
                  ? "The first scene has no cut before it"
                  : "Remove the cut that starts this scene"
              }
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ruler */}
      <div
        className="relative mb-1 h-4 cursor-pointer select-none"
        onPointerDown={(e) => {
          scrubTo(e.clientX);
          const move = (ev: PointerEvent) => scrubTo(ev.clientX);
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      >
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute top-0 font-mono text-[9.5px] text-ink-500"
            style={{ left: pct(t), transform: t === 0 ? "none" : "translateX(-50%)" }}
          >
            {timecode(t)}
          </span>
        ))}
      </div>

      {/* track */}
      <div ref={trackRef} className="relative h-14 select-none">
        <div className="flex h-full gap-[2px]">
          {scenes.map((scene, i) => {
            const { start, end } = sceneBounds(scenes, i, duration);
            const width = ((end - start) / Math.max(0.1, duration)) * 100;
            const selected = scene.id === selectedId;
            return (
              <button
                key={scene.id}
                onClick={() => onSelect(scene.id)}
                style={{ width: `${width}%` }}
                title={`${PRESET_LABELS[scene.framing.preset]} · ${timecode(start)}–${timecode(end)}`}
                className={cn(
                  "group relative min-w-0 overflow-hidden rounded-md border bg-gradient-to-b px-2 py-1.5 text-left transition-all",
                  SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                  selected
                    ? "ring-2 ring-white/70 ring-offset-1 ring-offset-[var(--surface-2)]"
                    : "opacity-70 hover:opacity-100",
                )}
              >
                <span className="block truncate text-[10.5px] font-semibold text-white">
                  {i + 1}. {PRESET_LABELS[scene.framing.preset]}
                </span>
                <span className="block truncate font-mono text-[9.5px] text-white/70">
                  {timecode(start)}–{timecode(end)}
                </span>
                {scene.framing.layout === "split" && (
                  <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-[2px] border border-white/60">
                    <span className="block h-[1px] w-full translate-y-[3px] bg-white/60" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* playhead */}
        <div
          className="pointer-events-none absolute -top-1 bottom-0 w-[2px] bg-white shadow-[0_0_6px_rgba(255,255,255,.7)]"
          style={{ left: pct(time) }}
        >
          <span className="absolute -left-[3px] -top-1 h-2 w-2 rotate-45 bg-white" />
        </div>
      </div>

      <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-500">
        Move the playhead, press <strong className="text-ink-300">Add Cut</strong>, then select a
        segment to frame it. Each segment keeps its own crop, zoom and layout — editing one never
        changes another.
      </p>
    </div>
  );
}
