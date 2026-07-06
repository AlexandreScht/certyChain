"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

export interface FadeInProps {
  index?: number;
  delay?: number;
  y?: number;
  className?: string;
  children: ReactNode;
}

/** Reduced-motion-safe entrance wrapper (soft fade + rise). */
export function FadeIn({ index = 0, delay = 0, y = 14, className, children }: FadeInProps) {
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
