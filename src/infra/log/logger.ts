import { isProd } from "@/core/config";

type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN = isProd ? ORDER.info : ORDER.debug;

function emit(level: Level, scope: string, message: string, meta?: Record<string, unknown>) {
  if (ORDER[level] < MIN) return;
  const line = {
    t: new Date().toISOString(),
    level,
    scope,
    message,
    ...(meta ?? {}),
  };
  const out = isProd ? JSON.stringify(line) : `[${level}] ${scope} · ${message}`;
  if (level === "error") console.error(out, isProd ? "" : (meta ?? ""));
  else if (level === "warn") console.warn(out, isProd ? "" : (meta ?? ""));
  else console.log(out, isProd ? "" : (meta ?? ""));
}

export function logger(scope: string) {
  return {
    debug: (m: string, meta?: Record<string, unknown>) => emit("debug", scope, m, meta),
    info: (m: string, meta?: Record<string, unknown>) => emit("info", scope, m, meta),
    warn: (m: string, meta?: Record<string, unknown>) => emit("warn", scope, m, meta),
    error: (m: string, meta?: Record<string, unknown>) => emit("error", scope, m, meta),
    child: (sub: string) => logger(`${scope}:${sub}`),
  };
}

export type Logger = ReturnType<typeof logger>;
