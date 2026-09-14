"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseYouTubeId } from "@/infra/youtube/url";
import { cn } from "@/lib/utils";

/**
 * Landing-page URL bar. Validates the link client-side, then hands it to the
 * signup flow so the generate page can pick it straight back up.
 */
export function LandingUrlBar() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseYouTubeId(url);
    if (!id) {
      setError("That does not look like a YouTube video link.");
      return;
    }
    sessionStorage.setItem("clipper:pending-url", `https://www.youtube.com/watch?v=${id}`);
    router.push(`/register?next=${encodeURIComponent("/generate")}`);
  };

  return (
    <form onSubmit={submit}>
      <div
        className={cn(
          "glass flex items-center gap-2 rounded-2xl p-1.5 transition-shadow",
          error ? "ring-1 ring-red-500/40" : "focus-within:shadow-[var(--shadow-glow)]",
        )}
      >
        <Link2 className="ml-2.5 h-4 w-4 shrink-0 text-ink-400" />
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError("");
          }}
          placeholder="Paste a YouTube link…"
          aria-label="YouTube video URL"
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-500"
        />
        <Button type="submit" size="md" className="shrink-0">
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">Generate Clips</span>
          <span className="sm:hidden">Go</span>
        </Button>
      </div>
      {error && <p className="mt-2 text-[12.5px] text-red-400">{error}</p>}
    </form>
  );
}
