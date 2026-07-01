import type { JSX } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SpinnerSize = "sm" | "md" | "lg";

const sizeMap: Record<SpinnerSize, string> = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-7 h-7",
};

export interface SpinnerProps {
  /** Diameter of the spinner. */
  size?: SpinnerSize;
  /** Extra classes (color via `text-*`, etc.). */
  className?: string;
  /** Accessible label announced to assistive tech. */
  label?: string;
}

/**
 * Indeterminate loading spinner built on the lucide `Loader2` glyph.
 * Inherits its color from the surrounding `text-*` utility.
 */
export function Spinner({
  size = "md",
  className,
  label = "Chargement…",
}: SpinnerProps): JSX.Element {
  return (
    <span role="status" aria-live="polite" className="inline-flex">
      <Loader2
        aria-hidden
        className={cn("animate-spin text-current", sizeMap[size], className)}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
