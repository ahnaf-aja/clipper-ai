"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Languages, Link2, Mic, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Segmented } from "@/components/ui/primitives";
import type { SpokenLanguage, TranscriptSource } from "@/lib/validation";

const SOURCE_HINT: Record<TranscriptSource, string> = {
  auto: "Whisper, falling back to YouTube's captions if it is unavailable.",
  whisper: "Most faithful to the audio, with punctuation. Runs faster than realtime.",
  youtube: "Skips the audio download, but YouTube's recogniser makes more mistakes.",
};
import { errorMessage, post } from "@/lib/client";
import { useToast } from "@/components/ui/toast";
import { parseYouTubeId } from "@/infra/youtube/url";
import type { PublicProject } from "@/lib/serializers";

/** Shared URL submit control used on the dashboard and the generate page. */
export function GenerateBar({
  onQueued,
  autoFocus,
}: {
  onQueued?: (project: PublicProject) => void;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState<SpokenLanguage>("auto");
  const [source, setSource] = useState<TranscriptSource>("auto");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Remember the choices — most people work in one language.
  useEffect(() => {
    const savedLang = localStorage.getItem("clipper:language") as SpokenLanguage | null;
    if (savedLang === "id" || savedLang === "en" || savedLang === "auto") setLanguage(savedLang);
    const savedSrc = localStorage.getItem("clipper:asr") as TranscriptSource | null;
    if (savedSrc === "auto" || savedSrc === "whisper" || savedSrc === "youtube") setSource(savedSrc);
  }, []);

  const pickLanguage = (v: SpokenLanguage) => {
    setLanguage(v);
    localStorage.setItem("clipper:language", v);
  };

  const pickSource = (v: TranscriptSource) => {
    setSource(v);
    localStorage.setItem("clipper:asr", v);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!parseYouTubeId(url)) {
      setError("That does not look like a YouTube video link.");
      return;
    }

    setLoading(true);
    try {
      const res = await post<{ project: PublicProject; reused: boolean }>("/api/projects", {
        url,
        language,
        transcriptSource: source,
      });
      if (res.reused) toast.info("Already processing", "That video is in the queue already.");
      else toast.success("Queued", "Analysis has started.");

      setUrl("");
      if (onQueued) onQueued(res.project);
      else router.push(`/generate?project=${res.project.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/8 bg-[var(--surface-2)] px-3 transition-shadow focus-within:border-brand-500/50 focus-within:ring-4 focus-within:ring-brand-500/10">
          <Link2 className="h-4 w-4 shrink-0 text-ink-400" />
          <input
            value={url}
            autoFocus={autoFocus}
            onChange={(e) => {
              setUrl(e.target.value);
              setError("");
            }}
            placeholder="https://www.youtube.com/watch?v=…"
            aria-label="YouTube video URL"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-500"
          />
        </div>
        <Button type="submit" size="lg" loading={loading} className="shrink-0">
          <Sparkles className="h-4 w-4" />
          Analyze Video
        </Button>
      </div>
      <div className="mt-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex w-[112px] shrink-0 items-center gap-1.5 text-[12.5px] text-ink-300">
            <Languages className="h-3.5 w-3.5 text-brand-400" />
            Language
          </span>
          <Segmented<SpokenLanguage>
            size="sm"
            value={language}
            onChange={pickLanguage}
            options={[
              { value: "auto", label: "Auto-detect" },
              { value: "id", label: "Bahasa Indonesia" },
              { value: "en", label: "English" },
            ]}
          />
          <span className="text-[11.5px] text-ink-500">
            {language === "auto"
              ? "Detection reads only the first 30 seconds — picking one is more reliable."
              : "Pinned, so the transcriber cannot mis-detect the language."}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex w-[112px] shrink-0 items-center gap-1.5 text-[12.5px] text-ink-300">
            <Mic className="h-3.5 w-3.5 text-brand-400" />
            Transcript
          </span>
          <Segmented<TranscriptSource>
            size="sm"
            value={source}
            onChange={pickSource}
            options={[
              { value: "auto", label: "Best for language" },
              { value: "whisper", label: "Whisper" },
              { value: "youtube", label: "YouTube captions" },
            ]}
          />
          <span className="text-[11.5px] text-ink-500">{SOURCE_HINT[source]}</span>
        </div>
      </div>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </form>
  );
}
