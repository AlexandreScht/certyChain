"use client";

import type { ReactNode } from "react";
import { AdminLogo } from "./AdminLogo";
import { FadeIn } from "./FadeIn";
import ThemeToggle from "@/components/ui/ThemeToggle";

export interface AuthShellProps {
  eyebrow: ReactNode;
  title: ReactNode;
  highlight?: ReactNode;
  subtitle?: ReactNode;
  maxWidthClass?: string;
  children: ReactNode;
}

/**
 * Centered glass card on the bg-mesh backdrop — the admin login canvas.
 * Pinned to the viewport (`h-svh`): content is vertically centered and the page
 * never scrolls (overflow is clipped, so the rotating halo can't push a bar in).
 */
export function AuthShell({
  eyebrow,
  title,
  highlight,
  subtitle,
  maxWidthClass = "max-w-md",
  children,
}: AuthShellProps) {
  return (
    <main className="relative h-svh overflow-hidden bg-mesh noise">
      <div
        aria-hidden
        className="absolute -top-32 -left-24 w-[380px] h-[380px] rounded-full animate-float-slow animate-morph"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(99,102,241,0.5), rgba(99,102,241,0) 70%)",
          filter: "blur(48px)",
        }}
      />
      <div
        aria-hidden
        className="absolute -bottom-32 -right-24 w-[420px] h-[420px] rounded-full animate-float-slower animate-morph"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(6,182,212,0.4), rgba(6,182,212,0) 70%)",
          filter: "blur(52px)",
        }}
      />
      <div aria-hidden className="absolute inset-0 bg-dots opacity-30" />

      {/* Content layer: centered, no scroll (overflow clipped). */}
      <div className="relative z-10 h-full overflow-hidden px-5">
        <div className={`mx-auto flex min-h-full w-full ${maxWidthClass} flex-col justify-center py-6`}>
          <FadeIn className="mb-6 flex items-center justify-center">
            <AdminLogo />
          </FadeIn>

          <FadeIn index={1} className="relative">
            <div
              aria-hidden
              className="absolute -inset-px rounded-[calc(1.75rem+1px)] opacity-50 blur-md animate-spin-slower grad-ring -z-10"
            />
            <div className="relative glass-strong rounded-[1.75rem] p-7 sm:p-8 overflow-hidden">
              {/* Corner control — wrapper absolutely positioned so it never shifts
                  the layout (ThemeToggle keeps its own `relative`). */}
              <div className="absolute top-4 right-4 z-20">
                <ThemeToggle />
              </div>
              <div className="inline-flex items-center gap-2 neumorph-pill rounded-full px-3 py-1 text-[11px] font-semibold text-ink-soft mb-4">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inset-0 rounded-full bg-indigo-500 animate-pulse-ring" />
                  <span className="relative rounded-full w-1.5 h-1.5 bg-indigo-500" />
                </span>
                {eyebrow}
              </div>

              <h1 className="font-display font-bold text-ink tracking-tight text-[clamp(1.6rem,4vw,2.1rem)] leading-[1.1]">
                {title}
                {highlight && (
                  <>
                    {" "}
                    <span className="grad-text-cool">{highlight}</span>
                  </>
                )}
              </h1>

              {subtitle && <p className="mt-2.5 text-sm text-muted leading-relaxed">{subtitle}</p>}

              <div className="mt-6">{children}</div>
            </div>
          </FadeIn>
        </div>
      </div>
    </main>
  );
}
