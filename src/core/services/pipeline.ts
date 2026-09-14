import "server-only";
import type { Project } from "@prisma/client";
import type {
  AnalysisResult,
  ClipSettings,
  PipelineStep,
  Word,
} from "@/core/domain/types";
import { DEFAULT_CLIP_SETTINGS, PIPELINE_STEPS } from "@/core/domain/types";
import { clampDuration, overlapRatio } from "@/core/domain/clip-rules";
import { scoreSegment, type ScoredSegment } from "@/core/domain/scoring";
import { getPlan } from "@/core/domain/plans";
import { buildCaptions, assertMeaningPreserved } from "./caption-builder";
import { buildInsight } from "./insight";
import { prisma } from "@/infra/db/prisma";
import { logger } from "@/infra/log/logger";
import { fetchMetadata } from "@/infra/youtube/metadata";
import { detectSpokenLanguage, fetchTimedText } from "@/infra/youtube/captions";
import { detectCapabilities } from "@/infra/media/capabilities";
import { downloadAudioOnly } from "@/infra/media/ytdlp";
import { config } from "@/core/config";
import { projectDir } from "@/infra/media/storage";
import { transcribeAudio } from "@/infra/ai/asr";
import { synthesizeTranscript } from "@/infra/ai/synthetic-transcript";
import { analyzeLocally } from "@/infra/ai/local-analyzer";
import { analyzeWithLLM } from "@/infra/ai/llm-analyzer";
import { renderClip, estimateBytes } from "@/infra/media/renderer";

const log = logger("pipeline");

const TOTAL_WEIGHT = PIPELINE_STEPS.reduce((a, s) => a + s.weight, 0);

class Ctx {
  progress = 0;
  sourcePath = "";
  words: Word[] = [];
  language = "en";
  transcriptProvider = "synthetic";
  engine: "real" | "local" = "local";

  constructor(readonly projectId: string) {}

  async log(message: string, level: "info" | "warn" | "error" | "success" = "info", step = "") {
    await prisma.jobLog
      .create({ data: { projectId: this.projectId, message: message.slice(0, 800), level, step } })
      .catch(() => {});
  }

  async step(key: PipelineStep) {
    const idx = PIPELINE_STEPS.findIndex((s) => s.key === key);
    const done = PIPELINE_STEPS.slice(0, idx).reduce((a, s) => a + s.weight, 0);
    this.progress = Math.round((done / TOTAL_WEIGHT) * 100);
    const remainingWeight = TOTAL_WEIGHT - done;
    await prisma.project.update({
      where: { id: this.projectId },
      data: {
        step: key,
        progress: this.progress,
        etaSec: Math.round(remainingWeight * 1.6),
        status: "running",
      },
    });
    await this.log(PIPELINE_STEPS[idx]?.label ?? key, "info", key);
  }
}

/** Executes the full 16-stage pipeline for one project. */
export async function runPipeline(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return;
  if (project.status === "completed") return;

  const ctx = new Ctx(projectId);
  const started = Date.now();

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "running", startedAt: new Date(), error: "", progress: 0 },
  });

  try {
    const caps = await detectCapabilities();
    await ctx.log(
      `Toolchain: ffmpeg=${caps.ffmpeg ? "yes" : "no"} · yt-dlp=${caps.ytdlp ? "yes" : "no"} · whisper=${caps.whisper ? "yes" : "no"} · llm=${caps.llm ? "yes" : "no"}`,
      "info",
      "metadata",
    );

    /* 1-3. metadata / thumbnail / duration ------------------------------- */
    await ctx.step("metadata");
    const meta = await fetchMetadata(project.videoId);
    await ctx.log(`"${meta.title}" — ${meta.channel}`, "success", "metadata");

    await ctx.step("thumbnail");
    await ctx.step("duration");
    const durationSec = meta.durationSec || project.durationSec || 0;
    await ctx.log(
      durationSec ? `Duration ${Math.round(durationSec)}s` : "Duration unknown, inferring from transcript",
      "info",
      "duration",
    );

    await prisma.project.update({
      where: { id: projectId },
      data: {
        title: meta.title,
        channel: meta.channel,
        thumbnailUrl: meta.thumbnailUrl,
        durationSec: Math.round(durationSec),
      },
    });

    /* 4-5. download + audio ---------------------------------------------- */
    await ctx.step("download");
    let audioPath = "";

    // Only fetch audio when Whisper is actually going to run — either because
    // the user asked for it, or because there is no caption track to fall back
    // on. Downloading it for a job that will use YouTube's track is pure waste.
    const asrSource = project.asrSource || "auto";
    const spokenLang = detectSpokenLanguage(meta.captionTracks);
    const targetLang = project.requestedLang !== "auto" ? project.requestedLang : spokenLang;
    const hasUsableTrack = meta.captionTracks.some(
      (t) => !targetLang || t.lang.toLowerCase().split("-")[0] === targetLang,
    );
    // Whisper is the default engine now that it is both faster and more
    // accurate, so audio is fetched unless the user explicitly picked YouTube.
    const whisperWillRun = caps.whisper && asrSource !== "youtube";

    if (caps.ytdlp && caps.ffmpeg && whisperWillRun) {
      const dir = await projectDir(projectId);
      audioPath = await downloadAudioOnly(project.videoId, dir, (l) => {
        if (/\d+\.\d%/.test(l)) void ctx.log(l, "info", "download");
      });
      ctx.engine = "real";
      await ctx.log("Audio downloaded (16 kHz mono) for transcription", "success", "download");
    } else if (caps.ytdlp && caps.ffmpeg) {
      ctx.engine = "real";
      await ctx.log(
        hasUsableTrack
          ? "Using YouTube's caption track — no audio download needed; the video is fetched at export time"
          : "No Whisper engine available; the video download is deferred to export time",
        "info",
        "download",
      );
    } else {
      await ctx.log(
        "yt-dlp/ffmpeg not installed — using YouTube's own caption track for analysis; exports will be edit-decision packages",
        "warn",
        "download",
      );
    }
    await ctx.step("audio");

    /* 6-7. speech-to-text ------------------------------------------------ */
    await ctx.step("transcribe");
    const transcript = await obtainTranscript(
      ctx,
      meta,
      audioPath,
      durationSec,
      project.requestedLang || "auto",
      asrSource,
    );
    ctx.words = transcript.words;
    ctx.language = transcript.language;
    ctx.transcriptProvider = transcript.provider;

    await ctx.step("transcript");
    const textBody = ctx.words.map((w) => w.w).join(" ");
    const record = {
      language: ctx.language,
      provider: ctx.transcriptProvider,
      model: transcript.model,
      forced: transcript.forced,
      langConf: transcript.languageConfidence,
      wordConf: transcript.meanConfidence,
      wordsJson: JSON.stringify(ctx.words),
      textBody: textBody.slice(0, 200_000),
    };
    await prisma.transcript.upsert({
      where: { projectId },
      create: { projectId, ...record },
      update: record,
    });
    await ctx.log(
      `${ctx.words.length.toLocaleString()} words transcribed via ${transcript.model}`,
      "success",
      "transcript",
    );

    const effectiveDuration = durationSec || ctx.words[ctx.words.length - 1]?.e || 0;

    /* 8-10. analyse / segment / score ------------------------------------ */
    await ctx.step("analyze");
    const user = await prisma.user.findUnique({ where: { id: project.userId } });
    const plan = getPlan(user?.plan ?? "free");
    const maxClips = plan.id === "free" ? 4 : plan.id === "creator" ? 8 : 12;

    const analysis = await runAnalysis(ctx, meta, effectiveDuration, maxClips, caps.llm);
    await ctx.log(analysis.overview || "Analysis complete", "success", "analyze");

    await ctx.step("segment");
    await ctx.log(`${analysis.segments.length} candidate story units identified`, "info", "segment");

    await ctx.step("score");
    const scored = analysis.segments
      .map((seg) => {
        const clamped = clampDuration(seg.start, seg.end, effectiveDuration);
        return scoreSegment({ ...seg, ...clamped }, ctx.words);
      })
      .filter((s) => s.segment.end - s.segment.start >= 20)
      .sort((a, b) => b.score - a.score);

    for (const s of scored.slice(0, 5)) {
      await ctx.log(
        `${s.score}/100 · ${s.segment.title} · ${s.reasons.map((r) => r.label).join(", ")}`,
        "info",
        "score",
      );
    }

    /* 11. select ---------------------------------------------------------- */
    await ctx.step("select");
    const selected: ScoredSegment[] = [];
    for (const cand of scored) {
      if (selected.some((s) => overlapRatio(s.segment, cand.segment) > 0.35)) continue;
      selected.push(cand);
      if (selected.length >= maxClips) break;
    }
    selected.sort((a, b) => a.segment.start - b.segment.start);

    if (selected.length === 0) {
      throw new Error(
        "No segment satisfied the clip rules. The video may have too little continuous speech.",
      );
    }
    await ctx.log(`${selected.length} clips selected`, "success", "select");

    /* 12-13. subtitles + viral captions ---------------------------------- */
    await ctx.step("subtitle");
    const settings: ClipSettings = {
      ...DEFAULT_CLIP_SETTINGS,
      ...(safeParse(project.settingsJson) as Partial<ClipSettings>),
    };

    await ctx.step("caption");
    const created = [];
    for (let i = 0; i < selected.length; i++) {
      const s = selected[i];
      const clipWords = ctx.words.filter(
        (w) => w.e > s.segment.start && w.s < s.segment.end,
      );
      const cues = buildCaptions(clipWords, settings, s.segment.start);

      const violation = assertMeaningPreserved(clipWords, cues);
      if (violation) {
        await ctx.log(`Caption guard rejected styling: ${violation}`, "error", "caption");
        throw new Error(`Caption integrity check failed: ${violation}`);
      }

      const clip = await prisma.clip.create({
        data: {
          projectId,
          userId: project.userId,
          index: i,
          title: s.segment.title,
          startSec: s.segment.start,
          endSec: s.segment.end,
          score: s.score,
          retention: s.retention,
          confidence: s.confidence,
          reasonsJson: JSON.stringify(s.reasons),
          insight: s.segment.summary,
          hookText: s.segment.hook,
          captionsJson: JSON.stringify(cues),
          stylePreset: settings.stylePreset,
          settingsJson: JSON.stringify(settings),
          status: "ready",
        },
      });
      created.push({ clip, scored: s });
    }
    await ctx.log(`${created.length} clips captioned (${cueCount(created)} cues)`, "success", "caption");

    /* 14-15. render + preview -------------------------------------------- */
    await ctx.step("render");
    for (const { clip, scored: s } of created) {
      const duration = s.segment.end - s.segment.start;
      if (ctx.sourcePath) {
        try {
          const dir = await projectDir(projectId);
          const result = await renderClip({
            sourcePath: ctx.sourcePath,
            outDir: dir,
            outName: `clip-${clip.index + 1}`,
            startSec: s.segment.start,
            endSec: s.segment.end,
            cues: JSON.parse(clip.captionsJson),
            settings,
            aspect: settings.aspect,
            resolution: plan.maxResolution === "4K" ? "1080p" : plan.maxResolution,
            fps: 30,
            codec: "h264",
            watermark: !plan.watermarkFree,
          });
          await prisma.clip.update({
            where: { id: clip.id },
            data: { status: "rendered", renderPath: result.filePath, fileBytes: BigInt(result.bytes) },
          });
        } catch (err) {
          if (String(err).includes("RENDER_UNAVAILABLE")) {
            await markPreviewOnly(clip.id, duration);
          } else {
            await ctx.log(`Render failed for clip ${clip.index + 1}: ${String(err).slice(0, 200)}`, "warn", "render");
            await markPreviewOnly(clip.id, duration);
          }
        }
      } else {
        await markPreviewOnly(clip.id, duration);
      }
    }

    await ctx.step("preview");
    await ctx.log(
      ctx.sourcePath
        ? "Clips burned in and ready to download"
        : caps.ffmpeg && caps.ytdlp
          ? "Clips ready — preview live in the editor, then export to render a burned-in MP4"
          : "Clips ready — previewed live in the browser editor (install ffmpeg + yt-dlp for burned-in MP4 export)",
      "success",
      "preview",
    );

    /* 16. insight + finish ------------------------------------------------ */
    const insight = buildInsight(selected);
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "completed",
        step: "done",
        progress: 100,
        etaSec: 0,
        engine: analysis.engine === "llm" ? "real" : ctx.engine,
        insightJson: JSON.stringify(insight),
        language: ctx.language,
        finishedAt: new Date(),
      },
    });

    await ctx.log(
      `Done in ${((Date.now() - started) / 1000).toFixed(1)}s · ${insight.headline}`,
      "success",
      "done",
    );
    log.info("pipeline complete", { projectId, clips: created.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("pipeline failed", { projectId, error: message });
    await ctx.log(message, "error", "done");
    await prisma.project
      .update({
        where: { id: projectId },
        data: { status: "failed", error: message.slice(0, 500), finishedAt: new Date(), etaSec: 0 },
      })
      .catch(() => {});
    // Refund the credits — the user got nothing.
    await prisma.user
      .update({
        where: { id: project.userId },
        data: { credits: { increment: Math.ceil((project.durationSec || 60) / 60) } },
      })
      .catch(() => {});
  }
}

/* ------------------------------------------------------------------ helpers */

type TranscriptOutcome = {
  words: Word[];
  language: string;
  provider: string;
  model: string;
  forced: boolean;
  languageConfidence: number;
  meanConfidence: number;
};

/**
 * Obtains a transcript, in descending order of fidelity to the actual audio.
 *
 * Whisper is preferred over YouTube's captions because it is markedly more
 * accurate on non-English speech and can be pinned to a known language.
 * YouTube's own track is used when Whisper is unavailable — but only in the
 * spoken language, never a translation.
 *
 * If nothing verbatim can be obtained the run fails. Inventing text would put
 * words on screen that nobody said, which is the one failure subtitles must
 * never have.
 */
/**
 * Which engine to try first.
 *
 * Chosen from measurement on casual Indonesian speech, where YouTube's own
 * recogniser produced genuinely wrong words at zero reported confidence
 * ("xboyfriendfriend", "kanwan", "Harry Muire"). Whisper large-v3-turbo got
 * the same passage right, with punctuation, while running faster than
 * realtime — so it wins on accuracy and speed at once and is the default.
 *
 * YouTube's track stays as the fallback for when no Whisper engine is
 * installed, and can be selected deliberately to skip the audio download.
 */
function preferredOrder(source: string, hasCaptions: boolean): ("whisper" | "youtube")[] {
  if (source === "youtube") return ["youtube", "whisper"];
  if (source === "whisper") return ["whisper", "youtube"];
  return hasCaptions ? ["whisper", "youtube"] : ["whisper"];
}

async function obtainTranscript(
  ctx: Ctx,
  meta: Awaited<ReturnType<typeof fetchMetadata>>,
  audioPath: string,
  durationSec: number,
  requestedLang: string,
  asrSource: string,
): Promise<TranscriptOutcome> {
  const spoken = detectSpokenLanguage(meta.captionTracks);
  if (spoken) {
    await ctx.log(
      `YouTube reports the spoken language as "${spoken}"${
        requestedLang !== "auto" && requestedLang !== spoken
          ? ` — you selected "${requestedLang}", which will be used instead`
          : ""
      }`,
      "info",
      "transcribe",
    );
  }

  const wanted = requestedLang !== "auto" ? requestedLang : spoken;
  const hasUsableTrack = meta.captionTracks.some(
    (t) => !wanted || t.lang.toLowerCase().split("-")[0] === wanted,
  );
  const order = preferredOrder(asrSource, hasUsableTrack);
  await ctx.log(
    `Transcript source order: ${order.join(" → ")}${asrSource === "auto" ? " (auto)" : " (you chose " + asrSource + ")"}`,
    "info",
    "transcribe",
  );

  const attempts: Record<string, () => Promise<TranscriptOutcome | null>> = {
    whisper: () => tryWhisper(ctx, audioPath, requestedLang, durationSec),
    youtube: () => tryYouTube(ctx, meta, requestedLang),
  };

  for (const engine of order) {
    const result = await attempts[engine]();
    if (result) return result;
  }

  // Nothing verbatim is available.
  if (!config().ALLOW_SIMULATED_TRANSCRIPT) {
    const available = meta.captionTracks.map((t) => t.lang).join(", ") || "none";
    throw new Error(
      `No accurate transcript could be produced for this video. ` +
        `Captions available: ${available}. ` +
        `Install a Whisper engine (see README) or choose a video that has captions in the language actually spoken. ` +
        `Generating a guessed transcript is disabled because the subtitles would not match the audio.`,
    );
  }

  await ctx.log(
    "SIMULATED TRANSCRIPT: no real transcript was available and ALLOW_SIMULATED_TRANSCRIPT is on. The subtitles below do NOT match the audio.",
    "error",
    "transcribe",
  );
  const synth = synthesizeTranscript({
    title: meta.title,
    description: meta.description,
    keywords: meta.keywords,
    durationSec,
    seed: meta.videoId,
  });
  return {
    ...synth,
    provider: "synthetic",
    model: "simulated",
    forced: false,
    languageConfidence: 0,
    meanConfidence: 0,
  };
}

/** Rough CPU cost per model, as a multiple of the audio duration. */
const REALTIME_FACTOR: Record<string, number> = {
  tiny: 0.15, base: 0.3, small: 1.2, medium: 3.7, "large-v3": 7, "large-v3-turbo": 0.45,
};

async function tryWhisper(
  ctx: Ctx,
  audioPath: string,
  requestedLang: string,
  durationSec: number,
): Promise<TranscriptOutcome | null> {
  if (audioPath) {
    const cfg = config();
    if (cfg.WHISPER_DEVICE === "cpu") {
      const factor = REALTIME_FACTOR[cfg.WHISPER_MODEL] ?? 2;
      const estimate = Math.round((durationSec * factor) / 60);
      if (estimate >= 3) {
        await ctx.log(
          `Whisper "${cfg.WHISPER_MODEL}" on CPU will take roughly ${estimate} minutes for this video. ` +
            `Set WHISPER_MODEL=small for speed, or WHISPER_DEVICE=cuda if you have a GPU.`,
          "warn",
          "transcribe",
        );
      }
    }
    try {
      const result = await transcribeAudio(audioPath, {
        language: requestedLang,
        onLog: (l) => void ctx.log(l, "info", "transcribe"),
      });
      await ctx.log(
        `Whisper ${result.model} produced ${result.words.length.toLocaleString()} words · ` +
          `language ${result.language}${result.forced ? " (forced)" : ` (detected, ${(result.languageConfidence * 100).toFixed(0)}% confident)`} · ` +
          `mean word confidence ${(result.meanConfidence * 100).toFixed(0)}%`,
        "success",
        "transcribe",
      );
      if (result.meanConfidence < 0.55) {
        await ctx.log(
          `Word confidence is low (${(result.meanConfidence * 100).toFixed(0)}%). The audio may be noisy or the selected language wrong — check the transcript before publishing.`,
          "warn",
          "transcribe",
        );
      }
      return result;
    } catch (err) {
      await ctx.log(
        `Whisper failed (${String(err).slice(0, 160)})`,
        "warn",
        "transcribe",
      );
    }
  }
  return null;
}

async function tryYouTube(
  ctx: Ctx,
  meta: Awaited<ReturnType<typeof fetchMetadata>>,
  requestedLang: string,
): Promise<TranscriptOutcome | null> {
  if (meta.captionTracks.length === 0) return null;

  const tt = await fetchTimedText(meta.captionTracks, requestedLang);
  if (!tt) return null;

  await ctx.log(
    `Loaded YouTube ${tt.manual ? "human-written" : "auto-generated"} captions (${tt.language}) — ${tt.words.length} tokens`,
    "success",
    "transcribe",
  );
  if (!tt.manual) {
    await ctx.log(
      "Auto-generated captions carry no punctuation, so sentence boundaries are inferred from pauses.",
      "info",
      "transcribe",
    );
  }

  return {
    words: tt.words,
    language: tt.language,
    provider: "youtube",
    model: tt.manual ? "youtube-manual" : "youtube-asr",
    forced: requestedLang !== "auto",
    languageConfidence: tt.manual ? 1 : 0.8,
    meanConfidence: tt.manual ? 0.97 : 0.82,
  };
}

async function runAnalysis(
  ctx: Ctx,
  meta: Awaited<ReturnType<typeof fetchMetadata>>,
  durationSec: number,
  maxClips: number,
  llmAvailable: boolean,
): Promise<AnalysisResult> {
  if (llmAvailable) {
    try {
      return await analyzeWithLLM(
        ctx.words,
        {
          title: meta.title,
          channel: meta.channel,
          description: meta.description,
          durationSec,
        },
        maxClips,
        (l) => void ctx.log(l, "info", "analyze"),
      );
    } catch (err) {
      await ctx.log(
        `LLM analysis failed (${String(err).slice(0, 160)}) — falling back to the local discourse analyser`,
        "warn",
        "analyze",
      );
    }
  } else {
    await ctx.log(
      "ANTHROPIC_API_KEY not set — running the local discourse analyser (lexical cohesion + prosody)",
      "info",
      "analyze",
    );
  }

  return analyzeLocally(
    ctx.words,
    { title: meta.title, description: meta.description, durationSec },
    maxClips,
  );
}

async function markPreviewOnly(clipId: string, durationSec: number) {
  await prisma.clip.update({
    where: { id: clipId },
    data: {
      status: "ready",
      renderPath: "",
      fileBytes: BigInt(estimateBytes(durationSec, "1080p", 30)),
    },
  });
}

const cueCount = (created: { clip: { captionsJson: string } }[]) =>
  created.reduce((a, c) => a + (JSON.parse(c.clip.captionsJson) as unknown[]).length, 0);

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json || "{}");
  } catch {
    return {};
  }
}
