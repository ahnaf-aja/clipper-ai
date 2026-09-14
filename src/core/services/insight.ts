import type { ProjectInsight } from "@/core/domain/types";
import type { ScoredSegment } from "@/core/domain/scoring";
import { formatTimecode } from "@/core/domain/clip-rules";

/** Builds the post-run "AI Insight" report shown on the project page. */
export function buildInsight(scored: ScoredSegment[]): ProjectInsight {
  if (scored.length === 0) {
    return {
      headline: "No clip met the quality bar for this video.",
      bestClipIndex: -1,
      bullets: [
        "The transcript did not contain a self-contained story unit between 20s and 5m.",
        "Try a video with more spoken content, or a longer recording.",
      ],
      predictions: { retention: 0, engagement: 0, share: 0 },
    };
  }

  const bestIdx = scored.reduce((bi, s, i) => (s.score > scored[bi].score ? i : bi), 0);
  const best = scored[bestIdx];
  const s = best.segment.signals;

  const bullets: string[] = [];
  bullets.push(
    s.hook >= 0.7
      ? `The hook lands inside the first 3 seconds: “${truncate(best.segment.hook, 70)}”.`
      : `The opening is functional but soft — consider trimming ${Math.round((best.segment.end - best.segment.start) * 0.06)}s off the front.`,
  );
  bullets.push(
    `Delivery holds at ${best.prosody.wpm} words per minute with ${best.prosody.dynamics}× tempo variation, which reads as energetic on vertical feeds.`,
  );
  if (s.humor >= 0.55) bullets.push("Humour arrives mid-clip, which is where most drop-off would otherwise occur.");
  if (s.surprise >= 0.55) bullets.push("A concrete, surprising number appears — this is the single strongest share trigger in the clip.");
  if (s.curiosity >= 0.6) bullets.push("The clip opens a curiosity gap and closes it before the end, so the viewer has a reason to stay.");
  bullets.push(
    s.ending >= 0.6
      ? "The ending leaves an open thread, which drives comments and rewatches."
      : "The ending resolves cleanly — strong for saves, weaker for comment volume.",
  );
  if (best.prosody.maxGap >= 0.6 && best.prosody.maxGap <= 1.6)
    bullets.push(`A ${best.prosody.maxGap}s dramatic pause sits right before the payoff.`);

  const avg = scored.reduce((a, b) => a + b.score, 0) / scored.length;
  bullets.push(
    `Across ${scored.length} clips the average viral score is ${Math.round(avg)}; clip #${bestIdx + 1} (${formatTimecode(best.segment.start)}–${formatTimecode(best.segment.end)}) is the one to publish first.`,
  );

  const engagement = Math.round(
    Math.min(97, 35 + s.humor * 22 + s.controversy * 20 + s.curiosity * 18 + s.emotion * 14),
  );
  const share = Math.round(
    Math.min(96, 28 + s.surprise * 30 + s.education * 20 + s.motivation * 16 + s.humor * 12),
  );

  return {
    headline: `Clip #${bestIdx + 1} has the highest chance of going viral (${best.score}/100).`,
    bestClipIndex: bestIdx,
    bullets: bullets.slice(0, 7),
    predictions: { retention: best.retention, engagement, share },
  };
}

const truncate = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
