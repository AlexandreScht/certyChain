"use client";

import { type JSX, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

const COLORS = ["#4F46E5", "#06B6D4", "#EC4899", "#F97316", "#10B981"] as const;
const COUNT = 18;

/** Deterministic pseudo-random in [0,1) — pure (no Math.random), stable across renders. */
const rnd = (n: number): number => {
  const x = Math.sin(n) * 43758.5453;
  return x - Math.floor(x);
};

interface Piece {
  id: number;
  x: number;
  delay: number;
  duration: number;
  rotate: number;
  color: string;
  size: number;
}

/**
 * Tasteful one-shot confetti burst for the "verified" celebration.
 * Renders nothing when the user prefers reduced motion.
 */
export function Confetti(): JSX.Element | null {
  const reduce = useReducedMotion();

  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: COUNT }, (_, i) => ({
        id: i,
        x: (i / COUNT) * 100,
        delay: rnd(i + 1) * 0.4,
        duration: 1.8 + rnd((i + 1) * 2.7) * 1.2,
        rotate: rnd((i + 1) * 5.3) * 360,
        color: COLORS[i % COLORS.length],
        size: 6 + rnd((i + 1) * 9.1) * 6,
      })),
    [],
  );

  if (reduce) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ y: "-10%", x: `${p.x}%`, opacity: 0, rotate: 0 }}
          animate={{
            y: "120%",
            opacity: [0, 1, 1, 0],
            rotate: p.rotate,
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: "easeIn",
          }}
          style={{
            position: "absolute",
            top: 0,
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}
