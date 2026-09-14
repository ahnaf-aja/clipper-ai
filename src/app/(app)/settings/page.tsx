"use client";

import { useEffect, useState } from "react";
import { Captions, Monitor, Save, Sliders, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, Segmented, Slider, Toggle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SUBTITLE_PRESETS, FONT_OPTIONS, getPreset } from "@/core/domain/subtitle-presets";
import { DEFAULT_CLIP_SETTINGS, type ClipSettings } from "@/core/domain/types";
import { useToast } from "@/components/ui/toast";
import { useTheme } from "@/components/ui/theme";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "clipper:default-settings";

/**
 * Workspace defaults. These are applied to every new project the browser
 * creates, so a user only configures their caption look once.
 */
export default function SettingsPage() {
  const toast = useToast();
  const { theme, toggle } = useTheme();
  const [settings, setSettings] = useState<ClipSettings>(DEFAULT_CLIP_SETTINGS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setSettings({ ...DEFAULT_CLIP_SETTINGS, ...JSON.parse(raw) });
      } catch {
        /* fall back to defaults */
      }
    }
  }, []);

  const update = (partial: Partial<ClipSettings>) => {
    setSettings((s) => ({ ...s, ...partial }));
    setDirty(true);
  };

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setDirty(false);
    toast.success("Defaults saved", "New projects will start with these settings.");
  };

  const reset = () => {
    setSettings(DEFAULT_CLIP_SETTINGS);
    setDirty(true);
  };

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Defaults applied to every new clip you generate."
        action={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={reset}>
              Reset
            </Button>
            <Button onClick={save} disabled={!dirty}>
              <Save className="h-4 w-4" />
              {dirty ? "Save defaults" : "Saved"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Caption defaults"
            subtitle="What every new clip starts with"
            action={<Captions className="h-4 w-4 text-ink-500" />}
          />
          <div className="space-y-1 px-4 pb-4">
            <Toggle checked={settings.subtitles} onChange={(v) => update({ subtitles: v })} label="Subtitles" description="Auto-generated and synced to the audio." />
            <Toggle checked={settings.viralCaption} onChange={(v) => update({ viralCaption: v })} label="Viral Caption" description="Punchy bursts with emphasis on the key words." />
            <Toggle checked={settings.keywordHighlight} onChange={(v) => update({ keywordHighlight: v })} label="Keyword Highlight" description="Colour names, numbers, money and hooks." />
            <Toggle checked={settings.autoEmoji} onChange={(v) => update({ autoEmoji: v })} label="Auto Emoji" description="One relevant emoji per cue, at most." />
            <Toggle checked={settings.uppercase} onChange={(v) => update({ uppercase: v })} label="Uppercase" description="Force capitals." />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Video defaults"
            subtitle="Framing and pacing"
            action={<Sliders className="h-4 w-4 text-ink-500" />}
          />
          <div className="space-y-1 px-4 pb-4">
            <div className="flex items-center justify-between px-2.5 py-2">
              <span className="text-[13px]">Aspect ratio</span>
              <Segmented
                size="sm"
                value={settings.aspect}
                onChange={(v) => update({ aspect: v })}
                options={[
                  { value: "9:16", label: "9:16" },
                  { value: "1:1", label: "1:1" },
                  { value: "16:9", label: "16:9" },
                ]}
              />
            </div>
            <Toggle
              checked={settings.smartZoom}
              onChange={(v) => update({ smartZoom: v })}
              label="Fill frame"
              description="Crop to fill vertical formats. Framing is repositionable per clip in the editor."
            />
            <Toggle checked={settings.silenceRemoval} onChange={(v) => update({ silenceRemoval: v })} label="Silence Removal" description="Trim long pauses and filler words." />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Default style"
            subtitle="Pick the look you use most"
            action={<Sparkles className="h-4 w-4 text-ink-500" />}
          />
          <div className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SUBTITLE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => update({ stylePreset: p.id, ...getPreset(p.id).defaults })}
                  className={cn(
                    "rounded-xl border p-2.5 text-left transition-all",
                    settings.stylePreset === p.id
                      ? "border-brand-500/50 bg-brand-500/10"
                      : "border-white/8 hover:border-white/16 hover:bg-white/[.03]",
                  )}
                >
                  <span
                    className="block truncate text-[12px]"
                    style={{
                      fontFamily: p.css.fontFamily,
                      fontWeight: p.css.fontWeight,
                      color: p.css.accent,
                      textTransform: p.css.textTransform,
                    }}
                  >
                    {p.name}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <p className="mb-1.5 text-[12.5px] text-ink-200">Font</p>
                <select
                  value={settings.font}
                  onChange={(e) => update({ font: e.target.value })}
                  aria-label="Default caption font"
                  className="h-10 w-full rounded-xl border border-white/8 bg-[var(--surface-2)] px-3 text-[13px] outline-none focus:border-brand-500/60"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <Slider label="Font size" value={settings.fontSize} min={16} max={96} unit="px" onChange={(v) => update({ fontSize: v })} />
              <Slider label="Outline" value={settings.outline} min={0} max={12} onChange={(v) => update({ outline: v })} />
              <Slider label="Vertical margin" value={settings.marginY} min={0} max={45} unit="%" onChange={(v) => update({ marginY: v })} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Appearance"
            subtitle="How the app looks"
            action={<Monitor className="h-4 w-4 text-ink-500" />}
          />
          <div className="px-4 pb-4">
            <div className="flex items-center justify-between rounded-xl border border-white/6 bg-[var(--surface-2)] px-3.5 py-3">
              <div>
                <p className="text-[13px] font-medium">Theme</p>
                <p className="text-[12px] text-muted">Dark is the default and what the app is designed for.</p>
              </div>
              <Segmented
                size="sm"
                value={theme}
                onChange={(v) => {
                  if (v !== theme) toggle();
                }}
                options={[
                  { value: "dark", label: "Dark" },
                  { value: "light", label: "Light" },
                ]}
              />
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
