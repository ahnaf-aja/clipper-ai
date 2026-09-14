import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { MarketingFooter, MarketingNav } from "@/components/landing/chrome";
import { Faq } from "@/components/landing/faq";
import { Badge, Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { PLANS } from "@/core/domain/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Clipper AI pricing. Start free with 60 credits, upgrade for longer videos, 4K exports and no watermark.",
};

const MATRIX: { label: string; get: (p: (typeof PLANS)[number]) => string | boolean }[] = [
  { label: "Analysis credits / month", get: (p) => p.creditsPerMonth.toLocaleString() },
  { label: "Max source length", get: (p) => `${p.maxSourceMinutes} min` },
  { label: "Max export resolution", get: (p) => p.maxResolution },
  { label: "Watermark-free export", get: (p) => p.watermarkFree },
  { label: "60 fps export", get: (p) => p.id !== "free" },
  { label: "H.265 codec", get: (p) => p.id === "pro" || p.id === "studio" },
  { label: "Concurrent renders", get: (p) => String(p.concurrency) },
  { label: "Clip storage", get: (p) => `${p.storageGb} GB` },
  { label: "All 11 caption presets", get: (p) => p.id !== "free" },
  { label: "Smart zoom & reframe", get: (p) => p.id !== "free" },
  { label: "Silence removal", get: (p) => p.id !== "free" },
  { label: "AI insight report", get: (p) => p.id === "pro" || p.id === "studio" },
  { label: "Priority queue", get: (p) => p.id === "pro" || p.id === "studio" },
  { label: "API access", get: (p) => p.id === "studio" },
];

export default function PricingPage() {
  return (
    <>
      <MarketingNav />
      <main id="main">
        <section className="px-5 pb-16 pt-32">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <span className="text-[12px] font-semibold uppercase tracking-widest text-brand-400">
                Pricing
              </span>
              <h1 className="mt-3 text-[clamp(2rem,4.6vw,3.2rem)] font-bold leading-tight tracking-tight">
                Pay for minutes analysed, not seats
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                One credit equals one minute of source video. Credits are returned automatically if a
                job fails.
              </p>
            </div>

            <div className="mt-12 grid gap-4 lg:grid-cols-4">
              {PLANS.map((p) => (
                <Card
                  key={p.id}
                  hover
                  className={`relative flex flex-col p-6 ${p.popular ? "ring-1 ring-brand-500/45" : ""}`}
                >
                  {p.popular && (
                    <span className="absolute -top-2.5 left-6 rounded-full bg-brand-500 px-2.5 py-0.5 text-[10.5px] font-semibold text-white">
                      Most popular
                    </span>
                  )}
                  <h2 className="text-[16px] font-semibold">{p.name}</h2>
                  <p className="mt-1 min-h-[36px] text-[12.5px] leading-snug text-muted">{p.tagline}</p>

                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-[34px] font-bold tracking-tight">${p.priceMonthly}</span>
                    <span className="text-[13px] text-ink-400">/mo</span>
                  </div>
                  {p.priceYearly > 0 && (
                    <p className="mt-1 text-[12px] text-ink-500">
                      or ${p.priceYearly}/yr — two months free
                    </p>
                  )}

                  <ul className="mt-5 flex-1 space-y-2">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-[12.5px] text-ink-200">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Button
                    href="/register"
                    variant={p.popular ? "primary" : "secondary"}
                    size="lg"
                    className="mt-6 w-full"
                  >
                    {p.priceMonthly === 0 ? "Start free" : `Choose ${p.name}`}
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-16">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-8 text-center text-[24px] font-bold tracking-tight">
              Full comparison
            </h2>
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead>
                  <tr className="border-b border-white/6 bg-[var(--surface-2)]">
                    <th className="px-5 py-3 text-left font-semibold text-ink-300">Feature</th>
                    {PLANS.map((p) => (
                      <th key={p.id} className="px-4 py-3 text-center font-semibold">
                        {p.name}
                        {p.popular && (
                          <Badge tone="brand" className="ml-1.5 text-[9.5px]">
                            Popular
                          </Badge>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MATRIX.map((row) => (
                    <tr key={row.label} className="border-b border-white/5 last:border-0">
                      <td className="px-5 py-3 text-ink-300">{row.label}</td>
                      {PLANS.map((p) => {
                        const value = row.get(p);
                        return (
                          <td key={p.id} className="px-4 py-3 text-center">
                            {typeof value === "boolean" ? (
                              value ? (
                                <Check className="mx-auto h-4 w-4 text-emerald-400" />
                              ) : (
                                <Minus className="mx-auto h-4 w-4 text-ink-600" />
                              )
                            ) : (
                              <span className="font-mono text-[12.5px]">{value}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </section>

        <Faq />
      </main>
      <MarketingFooter />
    </>
  );
}
