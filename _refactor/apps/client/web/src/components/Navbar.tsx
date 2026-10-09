"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Menu, X } from "lucide-react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import { useTheme } from "@certifychain/shared/hooks/useTheme";
import ThemeToggle from "@certifychain/shared/ui/ThemeToggle";

const links = [
  { label: "Principe", href: "#principe" },
  { label: "Pour les écoles", href: "#ecoles" },
  { label: "Sécurité", href: "#securite" },
  { label: "Tarifs", href: "#tarifs" },
];

const springConfig = {
  type: "spring" as const,
  stiffness: 260,
  damping: 30,
  mass: 1,
};

// Resting width of the minified bar. Expressed once as a CSS math expression so
// the cap (72rem) and the viewport share (85vw) never need unit conversion.
const MINIFY_WIDTH = "min(85vw, 72rem)";
// Slightly above half the bar height (62px, up to ~80px when the links wrap) on
// purpose: the browser clamps it, so the minified bar is a full pill while the
// radius still tweens over a small, visible range (0 -> 40px) instead of the
// old 0 -> 9999px, which snapped to a pill within two frames.
const MINIFY_RADIUS = 40;

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { theme } = useTheme();
  const reduce = useReducedMotion();
  const isDark = theme === "dark";

  // Glass tints are JS-driven (Framer animate), so they must follow the theme.
  const navBg = {
    top: isDark
      ? "linear-gradient(135deg, rgba(48,55,98,0.72) 0%, rgba(20,25,52,0.50) 100%)"
      : "linear-gradient(135deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.42) 100%)",
    minify: isDark
      ? "linear-gradient(135deg, rgba(56,64,112,0.45) 0%, rgba(26,31,62,0.20) 100%)"
      : "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.05) 100%)",
  };

  useEffect(() => {
    // Hysteresis (on >20, off <10) avoids re-launching the minify spring when the
    // scroll position jitters around a single threshold.
    const onScroll = () => setScrolled((prev) => window.scrollY > (prev ? 10 : 20));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isMinify = scrolled;

  // A single spring drives the whole top -> minified morph (0 = full-width bar,
  // 1 = floating pill). Width, radius, offset and tint are all derived from it, so
  // they move together along one continuous path. Animating each CSS property
  // separately forced framer-motion to convert mixed units by measuring the DOM
  // (width 85vw <-> 100%, max-width 72rem <-> 100%) and to tween the border
  // radius over 0 <-> 9999px: the bar jumped at the start/end of the animation.
  const progress = useMotionValue(0);
  useEffect(() => {
    const controls = animate(progress, isMinify ? 1 : 0, reduce ? { duration: 0 } : springConfig);
    return () => controls.stop();
  }, [isMinify, reduce, progress]);

  const width = useTransform(progress, (p) => `calc(100% - ${p} * (100% - ${MINIFY_WIDTH}))`);
  const y = useTransform(progress, [0, 1], [0, 16]);
  const borderRadius = useTransform(progress, [0, 1], [0, MINIFY_RADIUS]);
  const backgroundImage = useTransform(progress, [0, 1], [navBg.top, navBg.minify]);

  return (
    <motion.header
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-0 left-0 right-0 z-50 flex justify-center w-full pointer-events-none"
    >
      <motion.nav
        // No mount animation for the bar itself: it must paint at full width
        // immediately (SSR + first frame). `progress` starts at 0, i.e. the
        // full-width state; scroll-driven minify transitions animate it.
        style={{ width, y, borderRadius, backgroundImage }}
        className={`pointer-events-auto relative px-4 md:px-6 py-2.5 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-500 overflow-hidden backdrop-blur-md ${
          isMinify
            ? "glass shadow-[0_20px_50px_rgba(0,0,0,0.15)]"
            : "glass shadow-sm"
        }`}
        aria-label="Navigation principale"
      >
        <div className="flex items-center justify-between w-full">
          {/* Logo */}
          <a href="#top" className="flex items-center gap-2.5 group cursor-pointer shrink-0">
            <span className="relative grid place-items-center w-9 h-9 rounded-xl bg-linear-to-br from-indigo-600 to-indigo-500 text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.7)]">
              <ShieldCheck className="w-5 h-5" strokeWidth={2.2} />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-lime-500 ring-2 ring-white">
                <span className="absolute inset-0 rounded-full bg-lime-500 animate-pulse-ring" />
              </span>
            </span>
            <span className="font-display font-bold text-ink text-lg tracking-tight">
              Certify<span className="grad-text-cool">Chain</span>
            </span>
          </a>

          {/* Center Links */}
          <ul className="hidden md:flex items-center gap-1 mx-auto">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="relative px-3.5 py-1.5 text-sm font-medium text-muted hover:text-ink rounded-full transition-colors cursor-pointer"
                >
                  <span className="relative z-10">{l.label}</span>
                  <span className="absolute inset-0 rounded-full bg-white/0 hover:bg-white/60 dark:hover:bg-white/10 transition-colors" />
                </a>
              </li>
            ))}
          </ul>

          {/* Right Actions */}
          <div className="hidden md:flex items-center gap-2 ml-auto shrink-0">
            <ThemeToggle />
            <Link
              href="/ecole/login"
              className="text-sm font-medium text-muted hover:text-ink px-3 py-1.5 rounded-full transition-colors cursor-pointer"
            >
              Connexion
            </Link>
            <Link
              href="/ecole/register"
              className="cta-primary cursor-pointer text-sm font-semibold px-4 py-2 rounded-full"
            >
              Certifier mon école
            </Link>
          </div>

          {/* Mobile actions */}
          <div className="md:hidden ml-auto flex items-center gap-2 shrink-0">
            <ThemeToggle />
            <button
              className="neumorph-pill rounded-full w-10 h-10 grid place-items-center cursor-pointer"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={open}
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Animated Bottom Border (Only visible at top) */}
        <AnimatePresence>
          {!isMinify && (
            <>
              <motion.div
                key="bottom-border-left"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                exit={{ scaleX: 0 }}
                transition={{ duration: 0.4 }}
                className="absolute bottom-0 left-0 right-1/2 h-px z-10 bg-linear-to-r from-transparent to-indigo-500/30"
                style={{ transformOrigin: "right" }}
              />
              <motion.div
                key="bottom-border-right"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                exit={{ scaleX: 0 }}
                transition={{ duration: 0.4 }}
                className="absolute bottom-0 left-1/2 right-0 h-px z-10 bg-linear-to-r from-indigo-500/30 to-transparent"
                style={{ transformOrigin: "left" }}
              />
            </>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* Mobile Menu Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: isMinify ? 80 : 64 }}
            exit={{ opacity: 0, y: -20 }}
            transition={springConfig}
            className="pointer-events-auto md:hidden absolute left-4 right-4 max-w-md mx-auto glass rounded-2xl p-4 flex flex-col gap-1 z-40 backdrop-blur-md"
            style={{ backgroundImage: navBg.minify }}
          >
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="px-4 py-3 rounded-xl hover:bg-white/60 dark:hover:bg-white/10 font-medium text-ink cursor-pointer"
              >
                {l.label}
              </a>
            ))}
            <Link
              href="/ecole/login"
              onClick={() => setOpen(false)}
              className="px-4 py-3 rounded-xl hover:bg-white/60 dark:hover:bg-white/10 font-medium text-ink cursor-pointer"
            >
              Connexion
            </Link>
            <Link
              href="/ecole/register"
              onClick={() => setOpen(false)}
              className="cta-primary cursor-pointer text-sm font-semibold px-4 py-3 rounded-xl text-center mt-2"
            >
              Certifier mon école
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
