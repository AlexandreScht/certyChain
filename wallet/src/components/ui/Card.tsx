"use client";

import type { HTMLAttributes, JSX, MouseEvent } from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Use the heavier `glass-strong` surface instead of `glass`. */
  strong?: boolean;
  /** Wrap the card in a rotating conic `grad-ring` halo. */
  halo?: boolean;
  /** Enable the cursor-following `hover-glow` (tracks the mouse). */
  glow?: boolean;
  /** Add the `lift` hover translate. */
  lift?: boolean;
  /** Inner padding (Tailwind class). Defaults to `p-6`. */
  padding?: string;
}

/**
 * Rounded glass surface — the canonical CertifyChain card.
 * Mirrors the `rounded-[1.75rem] glass` cards from the marketing sections,
 * with optional grad-ring halo and mouse-tracked hover glow.
 */
export function Card({
  strong = false,
  halo = false,
  glow = false,
  lift = false,
  padding = "p-6",
  className,
  children,
  onMouseMove,
  ...rest
}: CardProps): JSX.Element {
  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    if (glow) {
      const rect = e.currentTarget.getBoundingClientRect();
      e.currentTarget.style.setProperty("--mx", `${e.clientX - rect.left}px`);
      e.currentTarget.style.setProperty("--my", `${e.clientY - rect.top}px`);
    }
    onMouseMove?.(e);
  };

  const card = (
    <div
      {...rest}
      onMouseMove={glow || onMouseMove ? handleMove : undefined}
      className={cn(
        "relative rounded-[1.75rem] overflow-hidden",
        strong ? "glass-strong" : "glass",
        glow && "hover-glow",
        lift && "lift",
        padding,
        className,
      )}
    >
      {children}
    </div>
  );

  if (!halo) return card;

  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-px rounded-[calc(1.75rem+1px)] opacity-60 blur-md animate-spin-slower grad-ring -z-10"
      />
      {card}
    </div>
  );
}

/** Alias for {@link Card} — semantic name when used as a static panel. */
export const GlassPanel = Card;
export type GlassPanelProps = CardProps;
