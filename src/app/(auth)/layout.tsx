import Link from "next/link";
import { Logo } from "@/components/landing/chrome";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-dvh lg:grid-cols-2">
      <div className="grid-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(60%_50%_at_30%_0%,#000,transparent)]" />

      <div className="relative flex flex-col px-5 py-8 sm:px-10">
        <Logo />
        <main id="main" className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm animate-[rise_.5s_both]">{children}</div>
        </main>
        <p className="text-center text-[12px] text-ink-500">
          © {new Date().getFullYear()} Clipper AI ·{" "}
          <Link href="/" className="hover:text-ink-300">
            Back to home
          </Link>
        </p>
      </div>

      <aside className="relative hidden overflow-hidden border-l border-white/6 lg:block">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(70% 60% at 70% 20%, rgba(124,92,255,.22), transparent 70%), radial-gradient(50% 50% at 30% 80%, rgba(77,216,255,.14), transparent 70%)",
          }}
        />
        <div className="relative flex h-full flex-col justify-center px-14">
          <blockquote className="max-w-md">
            <p className="text-[22px] font-semibold leading-snug tracking-tight">
              “It found a 40-second stretch in the middle of a two-hour podcast that I would never
              have looked at. That clip is at 2.1M views.”
            </p>
            <footer className="mt-5 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[13px] font-semibold text-white">
                DP
              </span>
              <span>
                <span className="block text-[13.5px] font-medium">Dani Prakoso</span>
                <span className="block text-[12.5px] text-muted">Podcast host · 340k subs</span>
              </span>
            </footer>
          </blockquote>

          <dl className="mt-14 grid grid-cols-3 gap-6 border-t border-white/8 pt-8">
            {[
              ["2 min", "to first clip"],
              ["11", "caption presets"],
              ["4K", "max export"],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="text-[26px] font-bold tracking-tight">{v}</dt>
                <dd className="mt-0.5 text-[12.5px] text-muted">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </div>
  );
}
