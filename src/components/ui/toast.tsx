"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "error" | "info";
type Toast = { id: number; tone: Tone; title: string; description?: string };

const ToastContext = createContext<{
  push: (t: Omit<Toast, "id">) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 5200);
  }, []);

  const value = useMemo(
    () => ({
      push,
      success: (title: string, description?: string) => push({ tone: "success", title, description }),
      error: (title: string, description?: string) => push({ tone: "error", title, description }),
      info: (title: string, description?: string) => push({ tone: "info", title, description }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => {
          const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "error" ? AlertCircle : Info;
          return (
            <div
              key={t.id}
              className={cn(
                "glass pointer-events-auto flex animate-[rise_.35s_cubic-bezier(.16,1,.3,1)_both] items-start gap-3 rounded-xl p-3.5 shadow-[var(--shadow-lift)]",
                t.tone === "success" && "border-emerald-500/25",
                t.tone === "error" && "border-red-500/25",
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 h-4.5 w-4.5 shrink-0",
                  t.tone === "success" && "text-emerald-400",
                  t.tone === "error" && "text-red-400",
                  t.tone === "info" && "text-sky-400",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium leading-tight">{t.title}</p>
                {t.description && (
                  <p className="mt-1 text-[12.5px] leading-snug text-muted">{t.description}</p>
                )}
              </div>
              <button
                onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}
                className="text-ink-400 transition-colors hover:text-ink-100"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
