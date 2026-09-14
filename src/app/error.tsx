"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled render error", error);
  }, [error]);

  return (
    <div className="grid min-h-[70vh] place-items-center px-5">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-400 ring-1 ring-red-500/25">
          <TriangleAlert className="h-5 w-5" />
        </div>
        <h1 className="text-[22px] font-bold tracking-tight">Something broke on this page</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          The error has been logged. Retrying usually clears it — if it keeps happening, the details
          below help us track it down.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[11.5px] text-ink-500">digest: {error.digest}</p>
        )}
        <Button onClick={reset} className="mt-6">
          <RotateCcw className="h-4 w-4" />
          Try again
        </Button>
      </div>
    </div>
  );
}
