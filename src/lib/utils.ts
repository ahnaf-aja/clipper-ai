import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / k ** i).toFixed(decimals))} ${sizes[i]}`;
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

export function timecode(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function scoreTone(score: number): { text: string; bg: string; ring: string; label: string } {
  if (score >= 85)
    return { text: "text-emerald-300", bg: "bg-emerald-500/12", ring: "ring-emerald-400/30", label: "Elite" };
  if (score >= 70)
    return { text: "text-brand-300", bg: "bg-brand-500/12", ring: "ring-brand-400/30", label: "Strong" };
  if (score >= 55)
    return { text: "text-amber-300", bg: "bg-amber-500/12", ring: "ring-amber-400/30", label: "Decent" };
  return { text: "text-ink-300", bg: "bg-ink-600/40", ring: "ring-ink-500/40", label: "Weak" };
}

export const AVATAR_COLORS: Record<string, string> = {
  violet: "from-brand-500 to-brand-700",
  blue: "from-sky-500 to-indigo-600",
  emerald: "from-emerald-500 to-teal-600",
  amber: "from-amber-400 to-orange-600",
  rose: "from-rose-500 to-pink-600",
  cyan: "from-cyan-400 to-blue-600",
};

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
