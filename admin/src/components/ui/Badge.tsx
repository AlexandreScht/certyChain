import type { HTMLAttributes, JSX, ReactNode } from "react";
import { cn } from "@/lib/utils";

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

const tones: Record<BadgeTone, ToneStyle> = {
  success: { chip: "bg-success/12 text-success", dot: "bg-success" },
  danger: { chip: "bg-danger/12 text-danger", dot: "bg-danger" },
  indigo: { chip: "bg-indigo-100 text-indigo-600", dot: "bg-indigo-500" },
  cyan: { chip: "bg-cyan-100 text-cyan-500", dot: "bg-cyan-500" },
  magenta: { chip: "bg-magenta-100 text-magenta-500", dot: "bg-magenta-500" },
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
