"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Captions, Check, Download, Film, Gauge, Image as ImageIcon, Move,
  Palette, RotateCcw, Save, Scissors, Sliders, Smile, Sparkles, Type, ZoomIn,
} from "lucide-react";
import type { PublicClip } from "@/lib/serializers";
import type { CaptionCue, ClipSettings } from "@/core/domain/types";
import { ASPECT_RATIO, computeCrop, SOURCE_ASPECT } from "@/core/domain/types";
import { CLIP_RULES } from "@/core/domain/clip-rules";
import { SUBTITLE_PRESETS, FONT_OPTIONS, getPreset } from "@/core/domain/subtitle-presets";
import {
  framingForPreset, MIN_SCENE_SEC, newSceneId, normalizeScenes, PRESET_LABELS,
  sceneBounds, type Scene, type SceneFraming, type ScenePreset,
} from "@/core/domain/scenes";
import { ClipPlayer, type FramingPatch } from "@/components/editor/clip-player";
import { SceneTimeline } from "@/components/editor/scene-timeline";
import { TemplatePicker } from "@/components/editor/template-picker";
import {
  backgroundIsAdjustable, backgroundWindow, DEFAULT_BACKGROUND_FRAMING, getTemplate,
} from "@/core/domain/templates";
import { ExportDialog } from "@/components/app/export-dialog";
import { Button } from "@/components/ui/button";
import {
  Alert, Badge, Card, Input, Progress, Segmented, Skeleton, Slider, Toggle,
} from "@/components/ui/primitives";
import { api, errorMessage, patch } from "@/lib/client";
import { useToast } from "@/components/ui/toast";
import { cn, scoreTone, timecode } from "@/lib/utils";

type Tab = "scenes" | "captions" | "style" | "timing" | "insight";

export default function ClipEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();

  const [clip, setClip] = useState<PublicClip | null>(null);
  const [settings, setSettings] = useState<ClipSettings | null>(null);
  const [cues, setCues] = useState<CaptionCue[]>([]);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [title, setTitle] = useState("");
  const [tab, setTab] = useState<Tab>("scenes");
  const [dirty, setDirty] = useState(false);

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState("");
  const [playhead, setPlayhead] = useState(0);
  const [seekRequest, setSeekRequest] = useState({ t: 0, nonce: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ clip: PublicClip }>(`/api/clips/${id}`);
    setClip(res.clip);
    setSettings(res.clip.settings);
    setCues(res.clip.captions);
    setStart(res.clip.startSec);
    setEnd(res.clip.endSec);
    setTitle(res.clip.title);
    setScenes(res.clip.scenes);
    setSelectedSceneId((prev) =>
      res.clip.scenes.some((s) => s.id === prev) ? prev : (res.clip.scenes[0]?.id ?? ""),
    );
    setDirty(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Warn before losing unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const update = useCallback((partial: Partial<ClipSettings>) => {
    setSettings((s) => (s ? { ...s, ...partial } : s));
    setDirty(true);
  }, []);

  const applyPreset = (presetId: string) => {
    const preset = getPreset(presetId);
    update({ stylePreset: presetId, ...preset.defaults });
  };

  /* ------------------------------------------------------------- scenes */

  const clipDuration = Math.max(0.1, end - start);
  const selectedIndex = Math.max(0, scenes.findIndex((s) => s.id === selectedSceneId));
  const selectedScene = scenes[selectedIndex];

  const patchFraming = useCallback((sceneId: string, framing: Partial<SceneFraming>) => {
    setScenes((prev) =>
      prev.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              framing: {
                ...s.framing,
                ...framing,
                // Any manual nudge stops the scene claiming to be a preset.
                preset: framing.preset ?? "custom",
              },
            }
          : s,
      ),
    );
    setDirty(true);
  }, []);

  // Dragging in the preview always edits the scene under the playhead, which is
  // the one on screen — editing an off-screen scene would be invisible.
  const onDragFraming = useCallback(
    (sceneId: string, p: FramingPatch) => patchFraming(sceneId, p),
    [patchFraming],
  );

  const addCut = (t: number) => {
    const idx = scenes.reduce((acc, s, i) => (s.start <= t + 1e-6 ? i : acc), 0);
    const { start: aStart, end: aEnd } = sceneBounds(scenes, idx, clipDuration);
    if (t - aStart < MIN_SCENE_SEC || aEnd - t < MIN_SCENE_SEC) {
      toast.error("Too close to an existing cut", `Scenes must be at least ${MIN_SCENE_SEC}s long.`);
      return;
    }
    // The new scene inherits the framing it was split from, so a cut alone
    // changes nothing visually until the user reframes it.
    const created: Scene = {
      id: newSceneId(),
      start: Math.round(t * 100) / 100,
      framing: { ...scenes[idx].framing },
    };
    const next = normalizeScenes([...scenes, created], clipDuration);
    setScenes(next);
    setSelectedSceneId(created.id);
    setDirty(true);
  };

  const removeCut = (sceneId: string) => {
    if (scenes.length <= 1 || scenes[0]?.id === sceneId) return;
    const next = normalizeScenes(
      scenes.filter((s) => s.id !== sceneId),
      clipDuration,
    );
    setScenes(next);
    setSelectedSceneId(next[Math.max(0, selectedIndex - 1)]?.id ?? next[0].id);
    setDirty(true);
  };

  const selectScene = (sceneId: string) => {
    setSelectedSceneId(sceneId);
    const idx = scenes.findIndex((s) => s.id === sceneId);
    if (idx >= 0) {
      // Jump to the scene so the preview shows what is being edited.
      const t = scenes[idx].start + 0.05;
      setSeekRequest((r) => ({ t, nonce: r.nonce + 1 }));
      setPlayhead(t);
    }
  };

  const seekTo = (t: number) => {
    setSeekRequest((r) => ({ t, nonce: r.nonce + 1 }));
    setPlayhead(t);
  };

  // Runs on every animation frame, so it must not allocate or chain state
  // updates. Scenes are read through a ref; both setState calls bail out when
  // the value is unchanged.
  const scenesRef = useRef<Scene[]>([]);
  scenesRef.current = scenes;

  const onTimeChange = useCallback((t: number) => {
    setPlayhead(t);
    // Keep the selection on the scene actually on screen, so the framing
    // controls always target what the user is looking at.
    const list = scenesRef.current;
    let under = list[0];
    for (const s of list) {
      if (s.start <= t + 1e-6) under = s;
      else break;
    }
    if (under) setSelectedSceneId((cur) => (cur === under.id ? cur : under.id));
  }, []);

  const save = async () => {
    if (!clip || !settings) return;
    setSaving(true);
    setError("");
    try {
      const res = await patch<{ clip: PublicClip }>(`/api/clips/${clip.id}`, {
        title,
        startSec: start,
        endSec: end,
        settings,
        scenes,
      });
      setClip(res.clip);
      setCues(res.clip.captions);
      setSettings(res.clip.settings);
      setScenes(res.clip.scenes);
      setSelectedSceneId((prev) =>
        res.clip.scenes.some((s) => s.id === prev) ? prev : (res.clip.scenes[0]?.id ?? ""),
      );
      setDirty(false);
      toast.success("Saved", "Captions were rebuilt from the transcript.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Local preview of caption cues while the user drags sliders. The server is
   * still the source of truth (and re-runs the integrity check on save), but
   * this keeps every control instant.
   */
  const previewCues = useLocalCues(cues, settings, clip, start);

  if (!clip || !settings) {
    return (
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Skeleton className="h-[560px]" />
        <Skeleton className="h-[560px]" />
      </div>
    );
  }

  const duration = end - start;
  const tone = scoreTone(clip.score);
  const sourceDuration = clip.video?.durationSec ?? end;

  return (
    <>
      <Link
        href="/clips"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All clips
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            aria-label="Clip title"
            className="w-full max-w-xl truncate rounded-lg bg-transparent text-[24px] font-bold tracking-tight outline-none focus:bg-white/5 focus:px-2"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={cn("rounded-lg px-2 py-0.5 text-[12px] font-bold ring-1 ring-inset", tone.bg, tone.text, tone.ring)}
            >
              {clip.score}/100 · {tone.label}
            </span>
            <Badge>{timecode(duration)}</Badge>
            <Badge>
              {timecode(start)} – {timecode(end)}
            </Badge>
            {clip.video && (
              <Link href={`/projects/${clip.projectId}`} className="text-[12.5px] text-brand-300 hover:underline">
                {clip.video.title}
              </Link>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={save} loading={saving} disabled={!dirty}>
            <Save className="h-4 w-4" />
            {dirty ? "Save changes" : "Saved"}
          </Button>
          <Button onClick={() => setExporting(true)}>
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        {/* preview */}
        <Card className="p-5">
          {clip.video ? (
            <ClipPlayer
              videoId={clip.video.videoId}
              startSec={start}
              endSec={end}
              cues={previewCues}
              settings={settings}
              scenes={scenes}
              posterUrl={clip.video.thumbnailUrl}
              onFramingChange={onDragFraming}
              onBackgroundChange={update}
              onTimeChange={onTimeChange}
              seekRequest={seekRequest}
            />
          ) : (
            <p className="text-[13px] text-muted">Source video unavailable.</p>
          )}

          <div className="mt-5">
            <SceneTimeline
              scenes={scenes}
              duration={clipDuration}
              time={playhead}
              selectedId={selectedSceneId}
              onSelect={selectScene}
              onSeek={seekTo}
              onAddCut={addCut}
              onRemoveCut={removeCut}
            />
          </div>

          <div className="mt-5 rounded-xl border border-white/6 bg-[var(--surface-2)] p-4">
            <div className="mb-3 flex items-center gap-2 text-[12.5px] font-medium">
              <Scissors className="h-3.5 w-3.5 text-brand-400" />
              Trim
              <span className="ml-auto font-mono text-ink-400">
                {timecode(start)} → {timecode(end)} ({duration.toFixed(1)}s)
              </span>
            </div>
            <div className="space-y-3">
              <Slider
                label="Start"
                value={Math.round(start * 10) / 10}
                min={0}
                max={Math.max(0, sourceDuration - CLIP_RULES.MIN_SEC)}
                step={0.1}
                unit="s"
                onChange={(v) => {
                  setStart(Math.min(v, end - CLIP_RULES.MIN_SEC));
                  setDirty(true);
                }}
              />
              <Slider
                label="End"
                value={Math.round(end * 10) / 10}
                min={CLIP_RULES.MIN_SEC}
                max={sourceDuration || end + 60}
                step={0.1}
                unit="s"
                onChange={(v) => {
                  setEnd(Math.max(v, start + CLIP_RULES.MIN_SEC));
                  setDirty(true);
                }}
              />
            </div>
            {(duration < CLIP_RULES.MIN_SEC || duration > CLIP_RULES.MAX_SEC) && (
              <p className="mt-3 text-[12px] text-amber-300">
                Clips must be between {CLIP_RULES.MIN_SEC}s and {CLIP_RULES.MAX_SEC / 60} minutes.
              </p>
            )}
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-500">
              Captions are rebuilt from the word-level transcript when you save, so trimming never
              orphans a half-spoken word.
            </p>
          </div>
        </Card>

        {/* controls */}
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="flex border-b border-white/6">
              {(
                [
                  ["scenes", Film, "Scenes"],
                  ["captions", Captions, "Captions"],
                  ["style", Palette, "Style"],
                  ["timing", Sliders, "Video"],
                  ["insight", Gauge, "Score"],
                ] as const
              ).map(([key, Icon, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1 py-3 text-[11.5px] font-medium transition-colors",
                    tab === key
                      ? "border-b-2 border-brand-500 text-white"
                      : "text-ink-400 hover:text-ink-100",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <div className="max-h-[62vh] overflow-y-auto p-4">
              {tab === "scenes" && selectedScene && (
                <SceneEditor
                  scene={selectedScene}
                  index={selectedIndex}
                  bounds={sceneBounds(scenes, selectedIndex, clipDuration)}
                  fillEnabled={settings.smartZoom}
                  aspect={settings.aspect}
                  onChange={(f) => patchFraming(selectedScene.id, f)}
                />
              )}

              {tab === "captions" && (
                <div className="space-y-1">
                  <Toggle
                    checked={settings.subtitles}
                    onChange={(v) => update({ subtitles: v })}
                    label="Subtitles"
                    description="Auto-generated from the transcript and synced to the audio."
                  />
                  <Toggle
                    checked={settings.viralCaption}
                    onChange={(v) => update({ viralCaption: v })}
                    label="Viral Caption"
                    description="Short punchy bursts with emphasis on the words that carry the beat."
                    badge={<Badge tone="brand" className="text-[9.5px]">Popular</Badge>}
                    disabled={!settings.subtitles}
                  />
                  <Toggle
                    checked={settings.keywordHighlight}
                    onChange={(v) => update({ keywordHighlight: v })}
                    label="Keyword Highlight"
                    description="Colours names, numbers, money figures, hooks and quotes."
                    disabled={!settings.subtitles}
                  />
                  <Toggle
                    checked={settings.autoEmoji}
                    onChange={(v) => update({ autoEmoji: v })}
                    label="Auto Emoji"
                    description="At most one relevant emoji per cue. Never overdone."
                    disabled={!settings.subtitles}
                  />
                  <Toggle
                    checked={settings.uppercase}
                    onChange={(v) => update({ uppercase: v })}
                    label="Uppercase"
                    description="Force capitals for maximum punch."
                    disabled={!settings.subtitles}
                  />

                  <div className="!mt-4 rounded-xl border border-brand-500/20 bg-brand-500/[.06] p-3">
                    <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-brand-200">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Viral Caption changes presentation only. Every caption is checked against the
                      spoken transcript on save — a caption that adds or reworks a word is rejected.
                    </p>
                  </div>
                </div>
              )}

              {tab === "style" && (
                <div className="space-y-5">
                  <div>
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-ink-400">
                      Output template
                    </p>
                    <TemplatePicker
                      value={settings.template}
                      onChange={(id) => update({ template: id })}
                    />
                    <p className="mt-2 text-[11.5px] leading-relaxed text-ink-500">
                      Layout only — the template moves the video and subtitles around the frame.
                      Your clip, scenes and captions are untouched, so switching is free.
                    </p>

                    {backgroundIsAdjustable(getTemplate(settings.template).layout) && (
                      <BackgroundControls
                        settings={settings}
                        aspect={settings.aspect}
                        onChange={update}
                      />
                    )}
                  </div>

                  <div className="border-t border-white/6 pt-4">
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-ink-400">
                      Caption preset
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {SUBTITLE_PRESETS.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => applyPreset(p.id)}
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
                          <span className="mt-0.5 block truncate text-[10.5px] text-ink-500">
                            {p.description}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-ink-400">
                      Font
                    </p>
                    <select
                      value={settings.font}
                      onChange={(e) => update({ font: e.target.value })}
                      aria-label="Caption font"
                      className="h-10 w-full rounded-xl border border-white/8 bg-[var(--surface-2)] px-3 text-[13px] outline-none focus:border-brand-500/60"
                    >
                      {FONT_OPTIONS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-4">
                    <Slider label="Size" value={settings.fontSize} min={16} max={96} unit="px" onChange={(v) => update({ fontSize: v })} />
                    <Slider label="Outline" value={settings.outline} min={0} max={12} onChange={(v) => update({ outline: v })} />
                    <Slider label="Shadow" value={settings.shadow} min={0} max={20} onChange={(v) => update({ shadow: v })} />
                    <Slider label="Opacity" value={settings.opacity} min={10} max={100} unit="%" onChange={(v) => update({ opacity: v })} />
                    <Slider label="Vertical margin" value={settings.marginY} min={0} max={45} unit="%" onChange={(v) => update({ marginY: v })} />
                  </div>

                  <Control label="Background">
                    <Segmented
                      size="sm"
                      value={settings.background}
                      onChange={(v) => update({ background: v })}
                      options={[
                        { value: "none", label: "None" },
                        { value: "solid", label: "Solid" },
                        { value: "blur", label: "Blur" },
                      ]}
                    />
                  </Control>

                  <Control label="Alignment">
                    <Segmented
                      size="sm"
                      value={settings.align}
                      onChange={(v) => update({ align: v })}
                      options={[
                        { value: "top", label: "Top" },
                        { value: "center", label: "Mid" },
                        { value: "bottom", label: "Bottom" },
                      ]}
                    />
                  </Control>

                  <Control label="Reveal">
                    <Segmented
                      size="sm"
                      value={settings.reveal}
                      onChange={(v) => update({ reveal: v })}
                      options={[
                        { value: "word", label: "Word by word" },
                        { value: "line", label: "Line by line" },
                      ]}
                    />
                  </Control>

                  <div>
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-ink-400">
                      Animation
                    </p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {(["none", "pop", "fade", "bounce", "slide"] as const).map((a) => (
                        <button
                          key={a}
                          onClick={() => update({ animation: a })}
                          className={cn(
                            "rounded-lg border py-2 text-[11px] capitalize transition-colors",
                            settings.animation === a
                              ? "border-brand-500/50 bg-brand-500/12 text-white"
                              : "border-white/8 text-ink-300 hover:bg-white/5",
                          )}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {tab === "timing" && (
                <div className="space-y-1">
                  <Control label="Aspect ratio">
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
                  </Control>

                  <Toggle
                    checked={settings.smartZoom}
                    onChange={(v) => update({ smartZoom: v })}
                    label="Fill frame"
                    description="Crop the source to fill the whole frame. Turn off to fit the entire video inside it with bars."
                    badge={<ZoomIn className="h-3 w-3 text-brand-400" />}
                  />

                  {settings.smartZoom && (
                    <button
                      onClick={() => setTab("scenes")}
                      className="!mt-3 flex w-full items-center gap-3 rounded-xl border border-white/6 bg-[var(--surface-2)] p-3.5 text-left transition-colors hover:border-white/14"
                    >
                      <Move className="h-4 w-4 shrink-0 text-brand-400" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-medium">Framing is per scene</span>
                        <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-500">
                          {scenes.length === 1
                            ? "This clip has one scene. Open Scenes to cut it up and frame each part separately."
                            : `${scenes.length} scenes, each with its own crop. Open Scenes to edit them.`}
                        </span>
                      </span>
                      <Film className="h-3.5 w-3.5 shrink-0 text-ink-500" />
                    </button>
                  )}
                  <Toggle
                    checked={settings.silenceRemoval}
                    onChange={(v) => update({ silenceRemoval: v })}
                    label="Silence Removal"
                    description="Strips long pauses, breaths and filler words like uh, um and anu."
                  />

                  <div className="!mt-4 space-y-2 rounded-xl border border-white/6 bg-[var(--surface-2)] p-3.5 text-[12px]">
                    <p className="font-medium text-ink-200">Clip structure</p>
                    {[
                      ["Hook", clip.hookText || "—"],
                      ["Summary", clip.insight || "—"],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <span className="text-ink-500">{k}: </span>
                        <span className="text-ink-300">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === "insight" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ["Score", clip.score],
                      ["Retention", clip.retention],
                      ["Confidence", clip.confidence],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-white/6 bg-[var(--surface-2)] p-3 text-center">
                        <p className="text-[20px] font-bold leading-none">{value}</p>
                        <p className="mt-1 text-[10.5px] text-ink-400">{label}</p>
                      </div>
                    ))}
                  </div>

                  <div>
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-ink-400">
                      Why this scored {clip.score}
                    </p>
                    <div className="space-y-2">
                      {clip.reasons.length === 0 && (
                        <p className="text-[12.5px] text-muted">No standout signals were detected.</p>
                      )}
                      {clip.reasons.map((r) => (
                        <div key={r.label} className="rounded-xl border border-white/6 bg-[var(--surface-2)] p-3">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
                              <Sparkles className="h-3 w-3 text-brand-400" />
                              {r.label}
                            </span>
                            <span className="font-mono text-[11px] text-ink-400">{r.weight}</span>
                          </div>
                          <p className="text-[11.5px] leading-relaxed text-ink-400">{r.detail}</p>
                          <Progress value={r.weight} className="mt-2 h-1" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2 text-[12.5px] font-medium">
              <Type className="h-3.5 w-3.5 text-brand-400" />
              Caption preview
              <span className="ml-auto text-[11.5px] text-ink-500">{previewCues.length} cues</span>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {previewCues.slice(0, 24).map((c, i) => (
                <div key={i} className="flex gap-2 text-[11.5px]">
                  <span className="shrink-0 font-mono text-ink-600">{c.start.toFixed(1)}s</span>
                  <span className="text-ink-300">
                    {c.tokens.map((t) => t.text).join(" ")}
                    {c.tokens.find((t) => t.emoji)?.emoji ?? ""}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted">
              <Smile className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
              Changes preview instantly. Press <strong className="text-ink-200">Save changes</strong>{" "}
              to rebuild the cues server-side and run the caption integrity check before export.
            </p>
          </Card>
        </div>
      </div>

      {exporting && <ExportDialog clip={{ ...clip, settings }} onClose={() => setExporting(false)} />}
    </>
  );
}

/**
 * Reposition controls for a template's backdrop.
 *
 * Rendered for any template whose background is derived from the video, and
 * driven entirely by `backgroundWindow()` — so a new template with a blurred
 * backdrop gets these controls with no extra code.
 */
function BackgroundControls({
  settings,
  aspect,
  onChange,
}: {
  settings: ClipSettings;
  aspect: ClipSettings["aspect"];
  onChange: (patch: Partial<ClipSettings>) => void;
}) {
  const win = backgroundWindow({
    frameAspect: ASPECT_RATIO[aspect],
    sourceAspect: SOURCE_ASPECT,
    zoom: settings.bgZoom,
    offsetX: settings.bgX,
    offsetY: settings.bgY,
  });

  const isDefault = settings.bgZoom === 1 && settings.bgX === 0 && settings.bgY === 0;

  return (
    <div className="mt-3 rounded-xl border border-white/6 bg-[var(--surface-2)] p-3.5">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
          <ImageIcon className="h-3.5 w-3.5 text-brand-400" />
          Background position
        </span>
        <button
          onClick={() => onChange({ ...DEFAULT_BACKGROUND_FRAMING })}
          disabled={isDefault}
          className="flex items-center gap-1 text-[11.5px] text-ink-400 transition-colors hover:text-white disabled:opacity-35"
        >
          <RotateCcw className="h-3 w-3" />
          Reset position
        </button>
      </div>

      <div className="space-y-3.5">
        <Slider
          label="Zoom"
          value={Math.round(settings.bgZoom * 100) / 100}
          min={1}
          max={3}
          step={0.05}
          unit="×"
          onChange={(v) => onChange({ bgZoom: v })}
        />
        <Slider
          label="Position X"
          value={Math.round(settings.bgX)}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => onChange({ bgX: v })}
        />
        <Slider
          label="Position Y"
          value={Math.round(settings.bgY)}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => onChange({ bgY: v })}
        />
      </div>

      <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-500">
        {win.panY <= 0.001
          ? "Drag the background in the preview, outside the video. Vertical movement unlocks past 1× — the full height is already visible."
          : "Drag the background in the preview, outside the video, or use the sliders."}
      </p>
    </div>
  );
}

/**
 * Framing controls for one scene. Everything here writes only to the selected
 * scene, so a change can never leak into a neighbouring segment.
 */
function SceneEditor({
  scene,
  index,
  bounds,
  fillEnabled,
  aspect,
  onChange,
}: {
  scene: Scene;
  index: number;
  bounds: { start: number; end: number };
  fillEnabled: boolean;
  aspect: ClipSettings["aspect"];
  onChange: (framing: Partial<SceneFraming>) => void;
}) {
  const f = scene.framing;
  const split = f.layout === "split";

  if (!fillEnabled) {
    return (
      <Alert tone="info">
        Scene framing needs <strong>Fill frame</strong> switched on — with it off the whole video is
        letterboxed and there is nothing to crop. Turn it on in the <strong>Video</strong> tab.
      </Alert>
    );
  }

  const presets: ScenePreset[] = ["full", "left", "right", "split"];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-white/6 bg-[var(--surface-2)] p-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold">
            Scene {index + 1}
            <span className="ml-1.5 font-normal text-ink-400">
              {PRESET_LABELS[f.preset]}
            </span>
          </span>
          <span className="font-mono text-[11.5px] text-ink-400">
            {timecode(bounds.start)}–{timecode(bounds.end)} ·{" "}
            {(bounds.end - bounds.start).toFixed(1)}s
          </span>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-ink-400">
          Preset
        </p>
        <div className="grid grid-cols-2 gap-2">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => onChange(framingForPreset(p, ASPECT_RATIO[aspect], SOURCE_ASPECT))}
              className={cn(
                "flex items-center gap-2 rounded-xl border p-2.5 text-left text-[12px] transition-all",
                f.preset === p
                  ? "border-brand-500/50 bg-brand-500/10 text-white"
                  : "border-white/8 text-ink-300 hover:border-white/16 hover:bg-white/[.03]",
              )}
            >
              <PresetGlyph preset={p} />
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>
        {f.preset === "custom" && (
          <p className="mt-2 text-[11.5px] text-ink-500">
            Custom framing — pick a preset above to start over.
          </p>
        )}
      </div>

      <PaneControls
        title={split ? "Top pane" : "Framing"}
        zoom={f.zoom}
        x={f.x}
        y={f.y}
        aspect={aspect}
        split={split}
        onChange={(v) => onChange(v)}
      />

      {split && (
        <PaneControls
          title="Bottom pane"
          zoom={f.zoomB}
          x={f.xB}
          y={f.yB}
          aspect={aspect}
          split
          onChange={(v) =>
            onChange({
              ...(v.zoom !== undefined ? { zoomB: v.zoom } : {}),
              ...(v.x !== undefined ? { xB: v.x } : {}),
              ...(v.y !== undefined ? { yB: v.y } : {}),
            })
          }
        />
      )}

      <p className="text-[11.5px] leading-relaxed text-ink-500">
        Drag directly on the preview to reposition{split ? " either pane" : ""}. Only this scene
        changes.
      </p>
    </div>
  );
}

function PaneControls({
  title,
  zoom,
  x,
  y,
  aspect,
  split,
  onChange,
}: {
  title: string;
  zoom: number;
  x: number;
  y: number;
  aspect: ClipSettings["aspect"];
  split: boolean;
  onChange: (v: { zoom?: number; x?: number; y?: number }) => void;
}) {
  // A split pane is twice as wide relative to its height, so its pan headroom
  // differs from a full-frame scene.
  const frameAspect = ASPECT_RATIO[aspect] * (split ? 2 : 1);
  const crop = computeCrop({
    frameAspect,
    sourceAspect: SOURCE_ASPECT,
    zoom,
    offsetX: x,
    offsetY: y,
    fill: true,
  });

  return (
    <div className="rounded-xl border border-white/6 bg-[var(--surface-2)] p-3.5">
      <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-ink-400">{title}</p>
      <div className="space-y-3.5">
        <Slider
          label="Zoom"
          value={Math.round(zoom * 100) / 100}
          min={1}
          max={3}
          step={0.05}
          unit="×"
          onChange={(v) => onChange({ zoom: v })}
        />
        <Slider
          label="Position X"
          value={Math.round(x)}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => onChange({ x: v })}
        />
        <Slider
          label="Position Y"
          value={Math.round(y)}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => onChange({ y: v })}
        />
      </div>
      {crop.panY <= 0.001 && (
        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-500">
          Vertical movement is locked at this zoom — the full height of the source is already
          visible. Zoom past 1× to unlock it.
        </p>
      )}
    </div>
  );
}

function PresetGlyph({ preset }: { preset: ScenePreset }) {
  const box = "flex h-5 w-4 shrink-0 overflow-hidden rounded-[3px] border border-current";
  if (preset === "split") {
    return (
      <span className={cn(box, "flex-col")}>
        <span className="h-1/2 w-full border-b border-current bg-current/25" />
        <span className="h-1/2 w-full bg-current/50" />
      </span>
    );
  }
  return (
    <span className={box}>
      <span
        className={cn(
          "h-full bg-current/45",
          preset === "left" ? "w-1/2" : preset === "right" ? "ml-auto w-1/2" : "w-full",
        )}
      />
    </span>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[12.5px] text-ink-200">{label}</span>
      {children}
    </div>
  );
}

/**
 * Recomputes caption grouping locally when a setting that affects grouping
 * changes, so the preview never lags behind the controls. Purely visual —
 * the server rebuilds and validates on save.
 */
function useLocalCues(
  serverCues: CaptionCue[],
  settings: ClipSettings | null,
  clip: PublicClip | null,
  start: number,
): CaptionCue[] {
  const baseline = useRef({ start: clip?.startSec ?? 0 });
  baseline.current.start = clip?.startSec ?? 0;

  return useMemo(() => {
    if (!settings || !clip) return serverCues;
    const shift = baseline.current.start - start;

    return serverCues
      .map((cue) => ({
        start: cue.start + shift,
        end: cue.end + shift,
        tokens: cue.tokens.map((t) => ({
          ...t,
          start: t.start + shift,
          end: t.end + shift,
          text: settings.uppercase ? t.text.toUpperCase() : t.text,
          emph: settings.viralCaption ? t.emph : false,
          hl: settings.keywordHighlight ? t.hl : undefined,
          emoji: settings.autoEmoji ? t.emoji : undefined,
        })),
      }))
      .filter((cue) => cue.end > 0 && cue.start < clip.endSec - start + 1);
  }, [serverCues, settings, clip, start]);
}
