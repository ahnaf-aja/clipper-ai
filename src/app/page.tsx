import Link from "next/link";
import {
  ArrowRight, Brain, Captions, Crop, Download, Gauge, Layers, MessageSquareQuote,
  Play, ScissorsLineDashed, Sparkles, Star, Timer, Wand2, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { MarketingFooter, MarketingNav } from "@/components/landing/chrome";
import { HeroDemo } from "@/components/landing/hero-demo";
import { PLANS } from "@/core/domain/plans";
import { LandingUrlBar } from "@/components/landing/url-bar";
import { Faq } from "@/components/landing/faq";

export default function LandingPage() {
  return (
    <>
      <MarketingNav />
      <main id="main" className="overflow-hidden">
        <Hero />
        <LogoStrip />
        <Features />
        <HowItWorks />
        <WhyUs />
        <Testimonials />
        <PricingPreview />
        <Faq />
        <FinalCta />
      </main>
      <MarketingFooter />
    </>
  );
}

/* ------------------------------------------------------------------ Hero */

function Hero() {
  return (
    <section className="relative px-5 pb-20 pt-32 sm:pt-36">
      <div className="grid-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(70%_50%_at_50%_0%,#000,transparent)]" />
      <div className="relative mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <Badge tone="brand" className="mb-6 animate-[rise_.5s_both]">
            <Sparkles className="h-3 w-3" />
            Understands context, not keywords
          </Badge>

          <h1 className="animate-[rise_.6s_.05s_both] text-[clamp(2.4rem,6.2vw,4.4rem)] font-extrabold leading-[1.04] tracking-[-0.03em]">
            Turn Any YouTube Video Into{" "}
            <span className="grad-text">Viral Shorts</span> With AI
          </h1>

          <p className="mx-auto mt-5 max-w-2xl animate-[rise_.6s_.12s_both] text-[clamp(1rem,1.6vw,1.15rem)] leading-relaxed text-muted">
            Paste a YouTube link and let AI automatically find the funniest, most engaging, most
            emotional, and highest-retention moments.
          </p>

          <div className="mx-auto mt-8 max-w-xl animate-[rise_.6s_.18s_both]">
            <LandingUrlBar />
          </div>

          <div className="mt-4 flex animate-[rise_.6s_.24s_both] flex-wrap items-center justify-center gap-3">
            <Button href="/register" size="lg">
              Generate Free Clips
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button href="#how" variant="outline" size="lg">
              <Play className="h-4 w-4" />
              Watch Demo
            </Button>
          </div>

          <p className="mt-4 animate-[rise_.6s_.3s_both] text-[12.5px] text-ink-400">
            No credit card · 60 free credits · Export in under a minute
          </p>
        </div>

        <div className="mx-auto mt-14 max-w-4xl animate-[rise_.8s_.35s_both]">
          <HeroDemo />
        </div>
      </div>
    </section>
  );
}

function LogoStrip() {
  const items = [
    "YouTube Shorts", "TikTok", "Instagram Reels", "Facebook Reels",
    "LinkedIn", "X / Twitter", "Snapchat Spotlight",
  ];
  return (
    <section className="border-y border-white/6 py-6">
      <div className="mx-auto max-w-6xl overflow-hidden px-5">
        <p className="mb-4 text-center text-[11.5px] font-medium uppercase tracking-widest text-ink-500">
          Exports ready for every vertical feed
        </p>
        <div className="flex gap-10 [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
          <div className="flex shrink-0 animate-[marquee_38s_linear_infinite] gap-10">
            {[...items, ...items].map((n, i) => (
              <span key={i} className="whitespace-nowrap text-[14px] font-semibold text-ink-500">
                {n}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Features */

const FEATURES = [
  {
    icon: Brain,
    title: "Real semantic understanding",
    body: "Discourse analysis, emotion tracking, speech-pacing and engagement prediction — not a keyword list. The model reads for storytelling, punchlines, conflict and curiosity gaps.",
  },
  {
    icon: ScissorsLineDashed,
    title: "Smart clip boundaries",
    body: "Clips never cut a sentence, a hook, or a punchline. If the payoff lands at 10:32, the clip starts at 09:58 so the joke actually makes sense.",
  },
  {
    icon: Gauge,
    title: "Viral scoring with reasons",
    body: "Every segment gets a 0–100 score, a retention prediction, a confidence level, and the specific reasons behind it — Strong Hook, Funny, High Curiosity, Story Complete.",
  },
  {
    icon: Captions,
    title: "Viral caption mode",
    body: "Word-by-word captions with emphasis, keyword colouring and tasteful emoji. Presentation only — an integrity check rejects any caption that would change what was said.",
  },
  {
    icon: Crop,
    title: "Smart zoom & auto reframe",
    body: "Auto crop and dynamic zoom keep the speaker in frame when a 16:9 recording becomes a 9:16 short.",
  },
  {
    icon: Timer,
    title: "Silence removal",
    body: "Long pauses, breaths and filler words are stripped so the clip stays tight without ever losing a word that was actually spoken.",
  },
  {
    icon: Layers,
    title: "11 subtitle presets",
    body: "Classic, TikTok, Podcast, Gaming, Education, MrBeast, Alex Hormozi, Minimal, Modern, Bold and Clean — swap any time, preview updates instantly.",
  },
  {
    icon: Download,
    title: "Export anywhere",
    body: "9:16, 16:9 or 1:1 · 720p to 4K · 30 or 60fps · H.264 or H.265 · watermark-free from the Creator plan up.",
  },
];

function Features() {
  return (
    <section id="features" className="px-5 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Features"
          title="Everything a shorts editor does, without the editor"
          subtitle="Nine steps of manual work collapsed into one paste-and-wait flow."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Card key={f.title} hover className="p-5">
              <div className="mb-3.5 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/20">
                <f.icon className="h-[18px] w-[18px]" />
              </div>
              <h3 className="text-[14.5px] font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{f.body}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- How it works */

const STEPS = [
  {
    n: "01",
    title: "Paste a YouTube link",
    body: "Any public video up to three hours. We pull the metadata, thumbnail and duration instantly, then queue the job.",
  },
  {
    n: "02",
    title: "AI reads the whole thing",
    body: "Speech-to-text produces word-level timings. A language model then performs discourse, emotion and pacing analysis across the entire transcript.",
  },
  {
    n: "03",
    title: "Best moments get scored",
    body: "Segments are cut on sentence boundaries, scored 0–100 on eleven signals, and de-duplicated so no two clips overlap.",
  },
  {
    n: "04",
    title: "Preview, tweak, export",
    body: "Trim, restyle captions, toggle emoji or silence removal — everything updates live. Then export in your format of choice.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="relative px-5 py-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_40%_at_50%_50%,rgba(124,92,255,.07),transparent)]" />
      <div className="relative mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="How it works"
          title="Four steps. One of them is yours."
          subtitle="From link to publishable vertical video, typically under two minutes for a 20-minute source."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.n} className="relative">
              <Card className="h-full p-5">
                <span className="font-mono text-[28px] font-bold leading-none text-brand-500/25">
                  {s.n}
                </span>
                <h3 className="mt-3 text-[15px] font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{s.body}</p>
              </Card>
              {i < STEPS.length - 1 && (
                <ArrowRight className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-ink-600 lg:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Why us */

function WhyUs() {
  const rows = [
    { label: "Finds moments by", us: "Full-context discourse analysis", them: "Keyword and loudness matching" },
    { label: "Clip boundaries", us: "Snapped to sentences, never cuts a punchline", them: "Fixed 60s windows" },
    { label: "Score transparency", us: "Score + reasons + retention + confidence", them: "A single opaque number" },
    { label: "Caption integrity", us: "Automated check rejects reworded captions", them: "Model may paraphrase" },
    { label: "Editing", us: "Live preview, every setting instant", them: "Re-render to see a change" },
    { label: "Time to first clip", us: "Under 2 minutes", them: "10–20 minutes" },
  ];

  return (
    <section className="px-5 py-24">
      <div className="mx-auto max-w-4xl">
        <SectionHeading
          eyebrow="Why Clipper AI"
          title="The difference is what the AI is actually doing"
          subtitle="Most tools search for viral words. We analyse how the story is told."
        />
        <Card className="mt-12 overflow-hidden">
          <div className="grid grid-cols-[1.1fr_1.3fr_1.1fr] border-b border-white/6 bg-[var(--surface-2)] px-5 py-3 text-[12px] font-semibold uppercase tracking-wider text-ink-400">
            <span />
            <span className="text-brand-300">Clipper AI</span>
            <span>Typical clip tools</span>
          </div>
          {rows.map((r) => (
            <div
              key={r.label}
              className="grid grid-cols-[1.1fr_1.3fr_1.1fr] items-start gap-3 border-b border-white/5 px-5 py-3.5 text-[13px] last:border-0"
            >
              <span className="text-ink-400">{r.label}</span>
              <span className="flex items-start gap-2 font-medium">
                <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" />
                {r.us}
              </span>
              <span className="text-ink-400">{r.them}</span>
            </div>
          ))}
        </Card>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ Testimonials */

const TESTIMONIALS = [
  {
    quote:
      "It found a 40-second stretch in the middle of a two-hour podcast that I would never have looked at. That clip is at 2.1M views.",
    name: "Dani Prakoso",
    role: "Podcast host · 340k subs",
  },
  {
    quote:
      "The scoring reasons are the actual product. Knowing why a clip is strong changed how I record, not just how I edit.",
    name: "Mara Whitfield",
    role: "Creator strategist",
  },
  {
    quote:
      "We cut a full-time editor's worth of repurposing work down to about an hour a week across four channels.",
    name: "Tobi Lund",
    role: "Head of content, Northlight",
  },
  {
    quote:
      "Every other tool chopped my sentences in half. This one starts the clip 30 seconds early because the joke needs the setup.",
    name: "Ayu Kartika",
    role: "YouTube educator",
  },
  {
    quote:
      "Captions match what I said, word for word, styled like a native TikTok. That combination did not exist before.",
    name: "Marcus Reyes",
    role: "Fitness creator · 1.2M followers",
  },
  {
    quote:
      "Six clips from one upload, all publishable without edits. The 9:16 reframe keeps me centred the whole time.",
    name: "Priya Raman",
    role: "Founder, Second Draft",
  },
];

function Testimonials() {
  return (
    <section id="testimonials" className="px-5 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Customers"
          title="Creators stopped scrubbing timelines"
          subtitle="What people say after their first week."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <Card key={t.name} hover className="flex flex-col p-5">
              <div className="mb-3 flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <MessageSquareQuote className="mb-2 h-4 w-4 text-brand-400/60" />
              <p className="flex-1 text-[13.5px] leading-relaxed text-ink-200">{t.quote}</p>
              <div className="mt-4 border-t border-white/6 pt-3">
                <p className="text-[13px] font-medium">{t.name}</p>
                <p className="text-[12px] text-ink-400">{t.role}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Pricing */

function PricingPreview() {
  return (
    <section id="pricing" className="px-5 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Pricing"
          title="Start free. Upgrade when it pays for itself."
          subtitle="One credit equals one minute of analysed source video."
        />
        <div className="mt-12 grid gap-4 lg:grid-cols-4">
          {PLANS.map((p) => (
            <Card
              key={p.id}
              hover
              className={`relative flex flex-col p-5 ${p.popular ? "ring-1 ring-brand-500/40" : ""}`}
            >
              {p.popular && (
                <span className="absolute -top-2.5 left-5 rounded-full bg-brand-500 px-2.5 py-0.5 text-[10.5px] font-semibold text-white">
                  Most popular
                </span>
              )}
              <h3 className="text-[15px] font-semibold">{p.name}</h3>
              <p className="mt-1 min-h-[34px] text-[12.5px] leading-snug text-muted">{p.tagline}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-[32px] font-bold tracking-tight">${p.priceMonthly}</span>
                <span className="text-[13px] text-ink-400">/mo</span>
              </div>
              <ul className="mt-5 flex-1 space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[12.5px] text-ink-200">
                    <Wand2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                href="/register"
                variant={p.popular ? "primary" : "secondary"}
                className="mt-5 w-full"
              >
                {p.priceMonthly === 0 ? "Start free" : `Choose ${p.name}`}
              </Button>
            </Card>
          ))}
        </div>
        <p className="mt-6 text-center text-[13px] text-muted">
          Need annual billing or an enterprise agreement?{" "}
          <Link href="/pricing" className="text-brand-300 underline-offset-4 hover:underline">
            See full pricing
          </Link>
        </p>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-5 py-24">
      <div className="mx-auto max-w-4xl">
        <Card className="relative overflow-hidden p-10 text-center sm:p-14">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 80% at 50% 0%, rgba(124,92,255,.18), transparent 65%)",
            }}
          />
          <div className="relative">
            <h2 className="text-[clamp(1.6rem,3.4vw,2.4rem)] font-bold tracking-tight">
              Your next viral clip is already in a video you uploaded
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-[14px] leading-relaxed text-muted">
              Paste the link. Sixty free credits, no card, first clips in under two minutes.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button href="/register" size="lg">
                Generate Free Clips
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button href="/login" variant="outline" size="lg">
                Sign in
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="text-[12px] font-semibold uppercase tracking-widest text-brand-400">
        {eyebrow}
      </span>
      <h2 className="mt-3 text-[clamp(1.7rem,3.6vw,2.5rem)] font-bold leading-tight tracking-tight">
        {title}
      </h2>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted">{subtitle}</p>
    </div>
  );
}
