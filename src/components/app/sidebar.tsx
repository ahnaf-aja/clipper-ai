"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CreditCard, FolderKanban, LayoutDashboard, LogOut, Menu, Scissors,
  Settings, Upload, User, Video, Wand2, X,
} from "lucide-react";
import { Logo } from "@/components/landing/chrome";
import { ThemeToggle } from "@/components/ui/theme";
import { Progress } from "@/components/ui/primitives";
import { post } from "@/lib/client";
import { AVATAR_COLORS, cn, formatBytes, initials } from "@/lib/utils";
import type { PublicUser } from "@/lib/serializers";
import type { Plan } from "@/core/domain/plans";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/generate", label: "Generate Clip", icon: Wand2 },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/clips", label: "My Clips", icon: Scissors },
  { href: "/exports", label: "Exports", icon: Upload },
];

const SECONDARY = [
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/profile", label: "Profile", icon: User },
];

export function Sidebar({ user, plan }: { user: PublicUser; plan: Plan }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const signOut = async () => {
    await post("/api/auth/logout").catch(() => {});
    router.push("/login");
    router.refresh();
  };

  const creditPct = Math.min(100, (user.credits / Math.max(1, plan.creditsPerMonth)) * 100);
  const storagePct = Math.min(100, (user.storageBytes / (plan.storageGb * 1024 ** 3)) * 100);

  const content = (
    <>
      <div className="flex h-16 items-center justify-between px-5">
        <Logo />
        <button
          onClick={() => setOpen(false)}
          className="text-ink-400 lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV.map((item) => (
          <NavLink key={item.href} {...item} active={pathname.startsWith(item.href)} onNavigate={() => setOpen(false)} />
        ))}

        <div className="!my-4 border-t border-white/6" />

        {SECONDARY.map((item) => (
          <NavLink key={item.href} {...item} active={pathname.startsWith(item.href)} onNavigate={() => setOpen(false)} />
        ))}
      </nav>

      <div className="space-y-3 px-3 pb-3">
        <div className="rounded-xl border border-white/6 bg-[var(--surface-2)] p-3.5">
          <div className="mb-1.5 flex items-center justify-between text-[12px]">
            <span className="text-ink-300">Credits</span>
            <span className="font-mono text-ink-200">
              {user.credits}
              <span className="text-ink-500">/{plan.creditsPerMonth}</span>
            </span>
          </div>
          <Progress value={creditPct} tone={creditPct < 15 ? "danger" : "brand"} />

          <div className="mb-1.5 mt-3 flex items-center justify-between text-[12px]">
            <span className="text-ink-300">Storage</span>
            <span className="font-mono text-ink-200">{formatBytes(user.storageBytes)}</span>
          </div>
          <Progress value={storagePct} />

          {plan.id === "free" && (
            <Link
              href="/billing"
              className="mt-3 block rounded-lg bg-brand-500/15 px-3 py-2 text-center text-[12.5px] font-medium text-brand-200 transition-colors hover:bg-brand-500/25"
            >
              Upgrade plan
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2.5 rounded-xl p-2">
          <span
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br text-[12.5px] font-semibold text-white",
              AVATAR_COLORS[user.avatarColor] ?? AVATAR_COLORS.violet,
            )}
          >
            {initials(user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{user.name}</p>
            <p className="truncate text-[11.5px] capitalize text-ink-400">{plan.name} plan</p>
          </div>
          <ThemeToggle />
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-white/6 hover:text-red-300"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* mobile top bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/6 bg-[var(--bg)]/90 px-4 backdrop-blur-xl lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="text-ink-200">
          <Menu className="h-5 w-5" />
        </button>
        <Logo />
        <Link href="/generate" aria-label="Generate clip" className="text-brand-400">
          <Video className="h-5 w-5" />
        </Link>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-white/6 bg-[var(--surface)] transition-transform duration-300 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {content}
      </aside>
    </>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all",
        active
          ? "bg-brand-500/12 text-white shadow-[inset_0_0_0_1px_rgba(124,92,255,.25)]"
          : "text-ink-300 hover:bg-white/5 hover:text-white",
      )}
    >
      <Icon className={cn("h-[17px] w-[17px] shrink-0", active && "text-brand-400")} />
      {label}
    </Link>
  );
}
