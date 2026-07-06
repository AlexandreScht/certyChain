import type { HTMLAttributes, JSX, ReactNode } from "react";
import { cn } from "../lib/cn";

export type BadgeTone =
  | "success"
  | "danger"
  | "indigo"
  | "cyan"
  | "magenta"
  | "neutral";

interface ToneStyle {
  /** Chip background + text. */
  chip: string;
  /** Solid dot color. */
  dot: string;
}

// Chip text is real `text-xs` content → WCAG AA needs 4.5:1. The pale tint
// backgrounds (cyan-100/magenta-100/success·danger/12) are near-white in light
// mode, so the vivid -500 accent used as *text* fails AA there (cyan 2.17:1,
// magenta 3.0:1, success 2.2:1, danger 3.2:1). We darken the text to the -700
// shade in light mode, and switch to the -300 shade in dark mode (where the tint
// backgrounds are remapped to deep colors), keeping the vivid -500 for the dot.
const tones: Record<BadgeTone, ToneStyle> = {
  success: { chip: "bg-success/12 text-emerald-700 dark:text-emerald-300", dot: "bg-success" },
  danger: { chip: "bg-danger/12 text-red-700 dark:text-red-300", dot: "bg-danger" },
  indigo: { chip: "bg-indigo-100 text-indigo-600", dot: "bg-indigo-500" },
  cyan: { chip: "bg-cyan-100 text-cyan-700 dark:text-cyan-300", dot: "bg-cyan-500" },
  magenta: { chip: "bg-magenta-100 text-pink-700 dark:text-pink-300", dot: "bg-magenta-500" },
  neutral: { chip: "neumorph-pill text-ink-soft", dot: "bg-muted-soft" },
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Color tone. */
  tone?: BadgeTone;
  /** Show a status dot before the label (animated ping when `pulse`). */
  dot?: boolean;
  /** Animate the leading dot with the `pulse-ring` halo. */
  pulse?: boolean;
  children: ReactNode;
}

/**
 * Compact pill label. Optionally shows a status dot with the shared
 * `pulse-ring` halo used across the marketing sections.
 */
export function Badge({
  tone = "neutral",
  dot = false,
  pulse = false,
  className,
  children,
  ...rest
}: BadgeProps): JSX.Element {
  const t = tones[tone];
  return (
    <span
      {...rest}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        t.chip,
        className,
      )}
    >
      {dot && (
        <span className="relative flex w-1.5 h-1.5">
          {pulse && (
            <span
              aria-hidden
              className={cn(
                "absolute inset-0 rounded-full animate-pulse-ring",
                t.dot,
              )}
            />
          )}
          <span className={cn("relative rounded-full w-1.5 h-1.5", t.dot)} />
        </span>
      )}
      {children}
    </span>
  );
}
