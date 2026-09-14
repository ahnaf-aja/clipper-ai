export type PlanId = "free" | "creator" | "pro" | "studio";

export type Plan = {
  id: PlanId;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  tagline: string;
  creditsPerMonth: number;
  /** 1 credit == 1 minute of analysed source video */
  maxSourceMinutes: number;
  maxResolution: "720p" | "1080p" | "2K" | "4K";
  watermarkFree: boolean;
  concurrency: number;
  storageGb: number;
  features: string[];
  popular?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    priceYearly: 0,
    tagline: "Try the full pipeline, no card required.",
    creditsPerMonth: 60,
    maxSourceMinutes: 20,
    maxResolution: "720p",
    watermarkFree: false,
    concurrency: 1,
    storageGb: 1,
    features: [
      "60 analysis credits / month",
      "Up to 20 min source videos",
      "AI clip discovery + viral scoring",
      "Auto subtitles & viral captions",
      "720p export with watermark",
    ],
  },
  {
    id: "creator",
    name: "Creator",
    priceMonthly: 19,
    priceYearly: 190,
    tagline: "For solo creators shipping shorts weekly.",
    creditsPerMonth: 600,
    maxSourceMinutes: 90,
    maxResolution: "1080p",
    watermarkFree: true,
    concurrency: 2,
    storageGb: 25,
    features: [
      "600 analysis credits / month",
      "Up to 90 min source videos",
      "1080p exports, no watermark",
      "All 11 subtitle presets",
      "Smart zoom & face tracking",
      "Silence removal",
    ],
    popular: true,
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 49,
    priceYearly: 490,
    tagline: "For teams running a real shorts engine.",
    creditsPerMonth: 2000,
    maxSourceMinutes: 180,
    maxResolution: "4K",
    watermarkFree: true,
    concurrency: 4,
    storageGb: 200,
    features: [
      "2,000 analysis credits / month",
      "Up to 3 hour source videos",
      "2K & 4K exports, 60fps, H.265",
      "AI insight reports per project",
      "Priority processing queue",
      "Bulk export",
    ],
  },
  {
    id: "studio",
    name: "Studio",
    priceMonthly: 149,
    priceYearly: 1490,
    tagline: "Agencies and media studios at volume.",
    creditsPerMonth: 8000,
    maxSourceMinutes: 300,
    maxResolution: "4K",
    watermarkFree: true,
    concurrency: 10,
    storageGb: 1000,
    features: [
      "8,000 analysis credits / month",
      "10 concurrent renders",
      "1 TB clip storage",
      "Custom brand caption presets",
      "API access",
      "Dedicated support",
    ],
  },
];

export const getPlan = (id: string): Plan => PLANS.find((p) => p.id === id) ?? PLANS[0];

export const RESOLUTION_ORDER = ["720p", "1080p", "2K", "4K"] as const;
export type Resolution = (typeof RESOLUTION_ORDER)[number];

export function resolutionAllowed(plan: Plan, res: Resolution) {
  return RESOLUTION_ORDER.indexOf(res) <= RESOLUTION_ORDER.indexOf(plan.maxResolution);
}

export const RESOLUTION_DIMS: Record<Resolution, { w: number; h: number }> = {
  "720p": { w: 720, h: 1280 },
  "1080p": { w: 1080, h: 1920 },
  "2K": { w: 1440, h: 2560 },
  "4K": { w: 2160, h: 3840 },
};
