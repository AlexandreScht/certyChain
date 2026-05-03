"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const links = [
  { label: "Principe", href: "#principe" },
  { label: "Pour les écoles", href: "#ecoles" },
  { label: "Sécurité", href: "#securite" },
  { label: "Tarifs", href: "#tarifs" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isMinify = scrolled;

  const springConfig = {
    type: "spring" as const,
    stiffness: 260,
    damping: 30,
    mass: 1,
  };

  return (
    <motion.header
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-0 left-0 right-0 z-50 flex justify-center w-full pointer-events-none"
    >
      <motion.nav
        animate={{
          width: isMinify ? "85vw" : "100%",
          maxWidth: isMinify ? "72rem" : "100%",
          y: isMinify ? 16 : 0,
          borderRadius: isMinify ? "9999px" : "0px",
          backgroundImage: isMinify 
            ? "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.05) 100%)"
            : "linear-gradient(135deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.42) 100%)",
        }}
        transition={springConfig}
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
                  <span className="absolute inset-0 rounded-full bg-white/0 hover:bg-white/60 transition-colors" />
                </a>
              </li>
            ))}
          </ul>

          {/* Right Actions */}
          <div className="hidden md:flex items-center gap-2 ml-auto shrink-0">
            <a
              href="#demo"
              className="text-sm font-medium text-muted hover:text-ink px-3 py-1.5 rounded-full transition-colors cursor-pointer"
            >
              Connexion
            </a>
            <a
              href="#cta"
              className="cta-primary cursor-pointer text-sm font-semibold px-4 py-2 rounded-full"
            >
              Certifier mon école
            </a>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden ml-auto neumorph-pill rounded-full w-10 h-10 grid place-items-center cursor-pointer shrink-0"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={open}
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
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
            style={{ backgroundImage: "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.05) 100%)" }}
          >
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="px-4 py-3 rounded-xl hover:bg-white/60 font-medium text-ink cursor-pointer"
              >
                {l.label}
              </a>
            ))}
            <a
              href="#cta"
              onClick={() => setOpen(false)}
              className="cta-primary cursor-pointer text-sm font-semibold px-4 py-3 rounded-xl text-center mt-2"
            >
              Certifier mon école
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
