"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Interactive dashboard illustration for the hero.
 * Replays the real pipeline stages on a loop so a first-time visitor sees
 * exactly what the product does before signing up.
 */

const STAGES = [
  "Fetching metadata",
  "Extracting audio",
  "Transcribing speech",
  "Analysing discourse",
  "Scoring 24 segments",
  "Cutting 6 clips",
];

const CLIPS = [
  { title: "The part nobody expects", range: "00:12 – 01:04", score: 98, tags: ["Strong Hook", "Funny"] },
  { title: "Why the numbers lied", range: "04:52 – 05:38", score: 94, tags: ["High Curiosity", "Surprising"] },
  { title: "One decision changed it", range: "09:11 – 10:25", score: 91, tags: ["Story Complete"] },
  { title: "What I would do again", range: "15:30 – 16:42", score: 87, tags: ["Motivational"] },
];

export function HeroDemo() {
  const [stage, setStage] = useState(0);
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStage((s) => {
        if (s < STAGES.length) return s + 1;
        return s;
      });
    }, 780);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (stage < STAGES.length) return;
    const id = setInterval(() => {
      setRevealed((r) => {
        if (r >= CLIPS.length) {
          // Restart the loop for the next visitor scroll-by.
          setTimeout(() => {
            setStage(0);
            setRevealed(0);
          }, 3400);
          return r;
        }
        return r + 1;
      });
    }, 420);
    return () => clearInterval(id);
  }, [stage]);

  const done = stage >= STAGES.length;
  const progress = done ? 100 : Math.round((stage / STAGES.length) * 100);

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute -inset-x-16 -top-16 h-72 opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 40%, rgba(124,92,255,.35), transparent 70%), radial-gradient(40% 50% at 80% 30%, rgba(77,216,255,.22), transparent 70%)",
        }}
        aria-hidden
      />

      <div className="glass relative rounded-2xl p-1.5 shadow-[var(--shadow-lift)]">
        <div className="rounded-[14px] bg-[var(--surface)] p-4 sm:p-5">
          {/* fake window chrome */}
          <div className="mb-4 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
            <div className="ml-3 flex-1 truncate rounded-md bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[11px] text-ink-400">
              youtube.com/watch?v=dQw4w9WgXcQ
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_1.15fr]">
            {/* pipeline */}
            <div className="rounded-xl border border-white/6 bg-[var(--surface-2)] p-3.5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[12px] font-medium text-ink-200">Pipeline</span>
                <span className="font-mono text-[11px] text-brand-300">{progress}%</span>
              </div>
              <div className="mb-3 h-1 overflow-hidden rounded-full bg-ink-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyanish-400 transition-[width] duration-700"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <ul className="space-y-1.5">
                {STAGES.map((s, i) => (
                  <li key={s} className="flex items-center gap-2 text-[11.5px]">
                    {i < stage ? (
                      <Check className="h-3 w-3 shrink-0 text-emerald-400" />
                    ) : i === stage ? (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-brand-400" />
                    ) : (
                      <span className="h-3 w-3 shrink-0 rounded-full border border-ink-600" />
                    )}
                    <span className={cn(i <= stage ? "text-ink-200" : "text-ink-500")}>{s}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* clips */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink-200">
                <Sparkles className="h-3.5 w-3.5 text-brand-400" />
                Clips found
              </div>
              {CLIPS.map((c, i) => (
                <div
                  key={c.title}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-white/6 bg-[var(--surface-2)] p-2.5 transition-all duration-500",
                    i < revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
                  )}
                >
                  <div className="grid h-11 w-7 shrink-0 place-items-center rounded-md bg-gradient-to-br from-brand-500/40 to-cyanish-500/20 text-[9px] font-bold text-white/80">
                    9:16
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium">{c.title}</p>
                    <p className="font-mono text-[10.5px] text-ink-400">{c.range}</p>
                    <div className="mt-1 flex gap-1">
                      {c.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded px-1.5 py-0.5 text-[9.5px] text-brand-300 ring-1 ring-inset ring-brand-400/25"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[15px] font-bold leading-none text-emerald-300">{c.score}</div>
                    <div className="text-[9px] text-ink-500">/ 100</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
