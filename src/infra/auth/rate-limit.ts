import { config } from "@/core/config";
import { TooMany } from "@/core/errors";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Sliding-window-ish fixed bucket limiter. In-process; swap for Redis in a cluster. */
export function rateLimit(key: string, opts?: { max?: number; windowMs?: number }) {
  const cfg = config();
  const max = opts?.max ?? cfg.RATE_LIMIT_MAX;
  const windowMs = opts?.windowMs ?? cfg.RATE_LIMIT_WINDOW_MS;
  const now = Date.now();

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { remaining: max - 1, resetAt: now + windowMs };
  }

  bucket.count += 1;
  if (bucket.count > max) {
    const seconds = Math.ceil((bucket.resetAt - now) / 1000);
    throw TooMany(`Too many requests. Try again in ${seconds}s.`);
  }
  return { remaining: max - bucket.count, resetAt: bucket.resetAt };
}

export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    "127.0.0.1"
  );
}

// Opportunistic cleanup so the map cannot grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
}, 60_000).unref?.();
