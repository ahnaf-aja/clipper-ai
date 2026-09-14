import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/landing/chrome";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-5">
      <div className="text-center">
        <Logo className="justify-center" />
        <p className="mt-8 font-mono text-[64px] font-bold leading-none text-brand-500/25">404</p>
        <h1 className="mt-2 text-[24px] font-bold tracking-tight">This page does not exist</h1>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-muted">
          The link may be out of date, or the project or clip was deleted.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button href="/dashboard">Go to dashboard</Button>
          <Link
            href="/"
            className="flex h-10 items-center rounded-xl border border-white/14 px-4 text-sm transition-colors hover:bg-white/6"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
