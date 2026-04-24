"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Menu, X } from "lucide-react";

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

  return (
    <header className="fixed top-4 left-4 right-4 z-50 flex justify-center pointer-events-none">
      <nav
        className={`pointer-events-auto w-full max-w-6xl transition-all duration-500 ${
          scrolled ? "glass-strong" : "glass"
        } rounded-full px-4 md:px-6 py-2.5 flex items-center gap-6`}
        aria-label="Navigation principale"
      >
        <a href="#top" className="flex items-center gap-2.5 group cursor-pointer">
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

        <div className="hidden md:flex items-center gap-2 ml-auto">
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

        <button
          className="md:hidden ml-auto neumorph-pill rounded-full w-10 h-10 grid place-items-center cursor-pointer"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={open}
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </nav>

      {open && (
        <div className="pointer-events-auto md:hidden absolute top-full left-0 right-0 mt-2 mx-4 glass-strong rounded-2xl p-4 flex flex-col gap-1">
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
        </div>
      )}
    </header>
  );
}
