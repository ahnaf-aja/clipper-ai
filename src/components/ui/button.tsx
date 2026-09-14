"use client";

import { forwardRef } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "glass";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[0_1px_0_rgba(255,255,255,.18)_inset,0_10px_28px_-10px_rgba(124,92,255,.85)] hover:from-brand-300 hover:to-brand-500 active:translate-y-px",
  secondary:
    "bg-ink-750 text-ink-100 border border-white/8 hover:bg-ink-700 hover:border-white/14 active:translate-y-px",
  ghost: "text-ink-200 hover:bg-white/6 hover:text-white",
  outline: "border border-white/14 text-ink-100 hover:bg-white/6 hover:border-white/25",
  danger: "bg-red-500/12 text-red-300 border border-red-500/25 hover:bg-red-500/20",
  glass: "glass text-ink-100 hover:bg-white/8",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-[15px] gap-2.5 rounded-xl",
  icon: "h-9 w-9 rounded-lg",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  href?: string;
};

const base =
  "relative inline-flex select-none items-center justify-center font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-45 whitespace-nowrap";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, children, href, disabled, ...props },
  ref,
) {
  const classes = cn(base, VARIANTS[variant], SIZES[size], className);

  if (href) {
    return (
      <Link href={href} className={classes} aria-disabled={disabled}>
        {children}
      </Link>
    );
  }

  return (
    <button ref={ref} className={classes} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
