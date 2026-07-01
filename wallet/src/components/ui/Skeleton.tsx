import type { CSSProperties, HTMLAttributes, JSX } from "react";
import { cn } from "@/lib/utils";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** CSS width (number = px). */
  width?: number | string;
  /** CSS height (number = px). */
  height?: number | string;
  /** Render as a circle (avatars, dots). */
  circle?: boolean;
}

function toCss(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "number" ? `${value}px` : value;
}

/**
 * Loading placeholder with the shared `animate-shimmer` sweep on a neumorphic
 * inset base. Honors `prefers-reduced-motion` via the global CSS reset.
 */
export function Skeleton({
  width,
  height,
  circle = false,
  className,
  style,
  ...rest
}: SkeletonProps): JSX.Element {
  const merged: CSSProperties = {
    width: toCss(width),
    height: toCss(height),
    ...style,
  };
  return (
    <div
      aria-hidden
      {...rest}
      style={merged}
      className={cn(
        "relative overflow-hidden neumorph-inset",
        circle ? "rounded-full" : "rounded-lg",
        !height && "h-4",
        className,
      )}
    >
      <span aria-hidden className="absolute inset-0 animate-shimmer" />
    </div>
  );
}

export interface SkeletonTextProps {
  /** Number of lines to render. */
  lines?: number;
  className?: string;
}

/** Convenience: a stack of text-line skeletons (last line is shorter). */
export function SkeletonText({
  lines = 3,
  className,
}: SkeletonTextProps): JSX.Element {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={12}
          width={i === lines - 1 ? "60%" : "100%"}
        />
      ))}
    </div>
  );
}
