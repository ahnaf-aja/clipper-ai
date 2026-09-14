"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <span className="relative flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-brand-400 to-cyanish-500 shadow-[0_4px_16px_-4px_rgba(124,92,255,.8)]">
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white" aria-hidden>
          <path d="M8 5.5v13l10-6.5-10-6.5z" />
        </svg>
      </span>
      <span className="text-[15px]">Clipper AI</span>
    </Link>
  );
}

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#testimonials", label: "Customers" },
  { href: "/pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled ? "border-b border-white/6 bg-[var(--bg)]/80 backdrop-blur-xl" : "",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5">
        <Logo />

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-[13.5px] text-ink-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
            Sign in
          </Button>
          <Button href="/register" size="sm">
            Start free
          </Button>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-300 md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-white/6 bg-[var(--bg)]/95 px-5 py-3 backdrop-blur-xl md:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm text-ink-200 hover:bg-white/5"
            >
              {l.label}
            </Link>
          ))}
          <Link href="/login" className="block rounded-lg px-3 py-2.5 text-sm text-ink-200 hover:bg-white/5">
            Sign in
          </Link>
        </div>
      )}
    </header>
  );
}

export function MarketingFooter() {
  const groups = [
    {
      title: "Product",
      links: [
        { href: "#features", label: "Features" },
        { href: "/pricing", label: "Pricing" },
        { href: "#how", label: "How it works" },
        { href: "/register", label: "Get started" },
      ],
    },
    {
      title: "Formats",
      links: [
        { href: "#features", label: "YouTube Shorts" },
        { href: "#features", label: "TikTok" },
        { href: "#features", label: "Instagram Reels" },
        { href: "#features", label: "Facebook Reels" },
      ],
    },
    {
      title: "Company",
      links: [
        { href: "#testimonials", label: "Customers" },
        { href: "#faq", label: "FAQ" },
        { href: "/login", label: "Sign in" },
      ],
    },
  ];

  return (
    <footer className="border-t border-white/6 px-5 py-14">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-muted">
              AI that actually understands your video — then cuts, captions and exports the moments
              worth publishing.
            </p>
          </div>
          {groups.map((g) => (
            <div key={g.title}>
              <h4 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-ink-400">
                {g.title}
              </h4>
              <ul className="space-y-2">
                {g.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-[13.5px] text-ink-300 transition-colors hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/6 pt-6 sm:flex-row">
          <p className="text-[12.5px] text-ink-400">
            © {new Date().getFullYear()} Clipper AI. All rights reserved.
          </p>
          <p className="text-[12.5px] text-ink-400">
            Built with Next.js, Prisma, Whisper and Claude.
          </p>
        </div>
      </div>
    </footer>
  );
}
