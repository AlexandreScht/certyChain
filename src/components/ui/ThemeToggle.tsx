"use client";

import { Moon, Sun } from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "@/hooks/useTheme";

/** Liquid-glass day/night toggle. Matches the neumorph-pill design language. */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Activer le thème clair" : "Activer le thème sombre"}
      title={isDark ? "Thème clair" : "Thème sombre"}
      className={`neumorph-pill relative grid h-10 w-10 place-items-center overflow-hidden rounded-full text-ink transition-colors cursor-pointer hover-glow ${className}`}
    >
      <motion.span
        key={isDark ? "moon" : "sun"}
        initial={{ rotate: -90, scale: 0, opacity: 0 }}
        animate={{ rotate: 0, scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 22 }}
        className="grid place-items-center"
      >
        {isDark ? (
          <Moon className="h-[18px] w-[18px] text-indigo-500" strokeWidth={2.1} />
        ) : (
          <Sun className="h-[18px] w-[18px] text-amber-500" strokeWidth={2.1} />
        )}
      </motion.span>
    </button>
  );
}
