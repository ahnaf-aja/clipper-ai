"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  {
    q: "How is this different from a tool that searches for viral keywords?",
    a: "Keyword tools look for words like “secret” or “crazy”. Clipper AI runs discourse analysis over the whole transcript: where topics shift, how emotion moves, where a joke is set up and where it lands, which questions get answered later, and how the speaking pace changes. A segment can score highly without containing a single “viral” word, and a segment stuffed with them can score badly if the story is incomplete.",
  },
  {
    q: "Will a clip ever cut off mid-sentence?",
    a: "No. Every proposed boundary is snapped onto real sentence edges using the word-level timings before the clip is created. If the punchline needs 30 seconds of setup, the clip starts 30 seconds earlier — that behaviour is deliberate, not a side effect.",
  },
  {
    q: "Does Viral Caption mode change what I actually said?",
    a: "It cannot. Viral Caption mode only changes presentation: how words are grouped, which ones are enlarged, colouring, and emoji. Before any clip is saved, an integrity check compares every caption token against the spoken transcript and rejects the result if a word appears that was not said. Filler words can be dropped by silence removal, but nothing is ever added or reworded.",
  },
  {
    q: "What video lengths and languages are supported?",
    a: "Up to 20 minutes on Free, 90 minutes on Creator, and 3 hours on Pro and Studio. Language is detected from the audio; the transcript, analysis and captions all follow the source language.",
  },
  {
    q: "Can I edit the clips afterwards?",
    a: "Yes. Every clip opens in a preview editor where you can trim, change aspect ratio, switch between eleven subtitle presets, adjust font, size, outline, shadow, opacity, alignment and animation, and toggle subtitles, viral captions, keyword highlighting, emoji, silence removal and smart zoom. Changes render live — there is no waiting on a re-render to see them.",
  },
  {
    q: "What do I actually get when I export?",
    a: "An MP4 at your chosen aspect ratio (9:16, 16:9 or 1:1), resolution (720p to 4K), frame rate (30 or 60) and codec (H.264 or H.265), with captions burned in. Watermark-free from the Creator plan up.",
  },
  {
    q: "How do credits work?",
    a: "One credit equals one minute of analysed source video, charged when a job starts. If a job fails the credits are returned automatically. Credits reset monthly with your plan.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="px-5 py-24">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <span className="text-[12px] font-semibold uppercase tracking-widest text-brand-400">
            FAQ
          </span>
          <h2 className="mt-3 text-[clamp(1.7rem,3.6vw,2.5rem)] font-bold tracking-tight">
            Questions people actually ask
          </h2>
        </div>

        <div className="mt-10 divide-y divide-white/6 overflow-hidden rounded-[18px] border border-white/6 bg-[var(--surface)]">
          {ITEMS.map((item, i) => (
            <div key={item.q}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[.025]"
              >
                <span className="text-[14px] font-medium">{item.q}</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-ink-400 transition-transform duration-200",
                    open === i && "rotate-180",
                  )}
                />
              </button>
              <div
                className="grid transition-[grid-template-rows] duration-300 ease-out"
                style={{ gridTemplateRows: open === i ? "1fr" : "0fr" }}
              >
                <div className="overflow-hidden">
                  <p className="px-5 pb-5 text-[13.5px] leading-relaxed text-muted">{item.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
