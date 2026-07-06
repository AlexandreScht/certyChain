"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

export interface FadeInProps {
  /** Stagger index — multiplies the base delay. */
  index?: number;
  /** Base delay in seconds (added on top of `index` stagger). */
  delay?: number;
  /** Vertical travel distance in px. */
  y?: number;
  className?: string;
  children: ReactNode;
}

/**
 * Reduced-motion-safe entrance wrapper: a soft fade + rise used across the
 * school portal. When the user prefers reduced motion, content appears
 * instantly with no transform.
 */
export function FadeIn({
  index = 0,
  delay = 0,
  y = 14,
  className,
  children,
}: FadeInProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduce ? 0.2 : 0.5,
        ease: [0.2, 0.8, 0.2, 1],
        delay: reduce ? 0 : delay + index * 0.07,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
