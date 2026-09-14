"use client";

import { TEMPLATES, type VideoTemplate } from "@/core/domain/templates";
import { cn } from "@/lib/utils";

/**
 * Schematic of a template's layout, drawn from the same numbers the renderer
 * uses — so a new template gets a correct thumbnail with no extra artwork.
 */
function TemplateThumb({ template, active }: { template: VideoTemplate; active: boolean }) {
  const { layout } = template;
  const bg = layout.background;

  const backdrop =
    bg.kind === "gradient"
      ? `linear-gradient(180deg, ${bg.from}, ${bg.to})`
      : bg.kind === "color"
        ? bg.color
        : bg.kind === "blur"
          ? "linear-gradient(135deg, #3a3550, #16141f)"
          : "#000";

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-md ring-1 transition-colors",
        active ? "ring-brand-400/70" : "ring-white/10",
      )}
      style={{ aspectRatio: "9 / 16", background: backdrop }}
      aria-hidden
    >
      {bg.kind === "blur" && (
        <div className="absolute inset-0 opacity-45 [background:radial-gradient(60%_40%_at_50%_35%,#8b7dff,transparent_70%)]" />
      )}

      {/* the video rect */}
      <div
        className="absolute bg-white/85"
        style={{
          left: `${layout.video.x * 100}%`,
          top: `${layout.video.y * 100}%`,
          width: `${layout.video.w * 100}%`,
          height: `${layout.video.h * 100}%`,
          borderRadius: layout.radius ? `${layout.radius * 120}%` : 2,
          border: layout.border ? `1.5px solid ${layout.border.color}` : undefined,
        }}
      />

      {/* subtitle marker */}
      <div
        className="absolute inset-x-[18%] rounded-[1px] bg-brand-300"
        style={{
          height: Math.max(3, 3 * layout.subtitle.scale),
          ...(layout.subtitle.align === "center"
            ? { top: "50%", transform: "translateY(-50%)" }
            : layout.subtitle.align === "top"
              ? { top: `${layout.subtitle.marginY}%` }
              : { bottom: `${layout.subtitle.marginY}%` }),
        }}
      />
    </div>
  );
}

export function TemplatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const active = TEMPLATES.find((t) => t.id === value) ?? TEMPLATES[0];

  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            title={`${t.name} — ${t.description}`}
            className={cn(
              "rounded-lg border p-1.5 text-left transition-all",
              t.id === value
                ? "border-brand-500/50 bg-brand-500/10"
                : "border-white/8 hover:border-white/16 hover:bg-white/[.03]",
            )}
          >
            <TemplateThumb template={t} active={t.id === value} />
            <span
              className={cn(
                "mt-1.5 block truncate text-[10.5px] font-medium",
                t.id === value ? "text-white" : "text-ink-300",
              )}
            >
              {t.name}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-2.5 rounded-lg border border-white/6 bg-[var(--surface-2)] px-3 py-2">
        <p className="text-[12px] font-medium">{active.name}</p>
        <p className="mt-0.5 text-[11.5px] leading-snug text-ink-400">{active.description}</p>
        <p className="mt-1 text-[11px] leading-snug text-ink-500">Best for: {active.bestFor}</p>
      </div>
    </div>
  );
}
