"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  Brain,
  FileSearch,
  Languages,
  Target,
  Sparkles,
  BarChart3,
  Linkedin,
  Globe2,
  ArrowUpRight,
} from "lucide-react";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

/* Per-card glow tint fed to the `.hover-glow` cursor spotlight via the --glow
   CSS variable. Each card lights up in its own accent — no card movement. */
const glow = {
  indigo: "rgba(99,102,241,0.20)",
  cyan: "rgba(6,182,212,0.20)",
  magenta: "rgba(236,72,153,0.20)",
  amber: "rgba(245,158,11,0.22)",
  lime: "rgba(132,204,22,0.22)",
} as const;

const cardVar = (c: string) => ({ ["--glow"]: c } as React.CSSProperties);

const mapping = [
  { src: "Nom complet", dst: "holder_name" },
  { src: "Parcours", dst: "program" },
  { src: "Date diplôme", dst: "issued_at" },
  { src: "Mention obtenue", dst: "grade" },
];

const scoreBreakdown = [
  { k: "Data Engineering", v: 92 },
  { k: "Cloud AWS", v: 78 },
  { k: "Soft skills", v: 84 },
];

export default function FeaturesGrid() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) return;

      // Entrance reveal. clearProps hands the transform back to CSS afterwards
      // so the `lift` hover works without an inline transform fighting it.
      gsap.set("[data-bento]", { y: 44, opacity: 0, scale: 0.98 });
      gsap.to("[data-bento]", {
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 0.8,
        stagger: 0.07,
        ease: "power3.out",
        clearProps: "transform,opacity",
        scrollTrigger: { trigger: rootRef.current, start: "top 72%", once: true },
      });
    },
    { scope: rootRef }
  );

  // Cursor spotlight: only updates the glow position, never moves the card.
  const handleGlow = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  // Shared card chrome. Big cards swap in `glass-strong`.
  const card =
    "group relative overflow-hidden rounded-[1.75rem] glass glass-sheen hover-glow lift";
  const cardBig =
    "group relative overflow-hidden rounded-[1.75rem] glass-strong glass-sheen hover-glow lift flex flex-col";
  const iconMotion =
    "transition-transform duration-500 ease-out group-hover:scale-110 group-hover:-rotate-3";

  return (
    <section ref={rootRef} id="ia" className="relative py-28 md:py-36 overflow-hidden">
      <div
        aria-hidden
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(236,72,153,0.18), transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 neumorph-pill rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-soft mb-5">
            <Sparkles className="w-3.5 h-3.5 text-magenta-500" />
            Couche IA native
          </div>
          <h2 className="font-display font-bold text-ink tracking-tight text-4xl md:text-5xl leading-[1.05] text-balance">
            L&apos;IA assiste. <span className="grad-text">La cryptographie garantit.</span>
          </h2>
          <p className="mt-5 text-lg text-muted max-w-2xl text-pretty">
            Les fonctionnalités IA n&apos;altèrent jamais la preuve cryptographique.
            Elles fluidifient l&apos;import, l&apos;analyse, la traduction et le scoring —
            tout en restant sous contrôle humain.
          </p>
        </div>

        {/* Bento grid — 12-col at lg, tiles with no gaps; single column below. */}
        <div className="mt-14 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:auto-rows-[12rem]">
          {/* ── Extraction (hero feature) ─────────────────────────────── */}
          <article
            data-bento
            onMouseMove={handleGlow}
            style={cardVar(glow.indigo)}
            className={`${cardBig} p-6 lg:p-7 lg:col-span-7 lg:row-span-2`}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-70"
              style={{ background: "radial-gradient(circle, rgba(99,102,241,0.18), transparent 70%)" }}
            />
            <div className="relative flex items-start justify-between">
              <div
                className={`w-12 h-12 rounded-2xl bg-linear-to-br from-indigo-600 to-indigo-500 text-white grid place-items-center shadow-[0_10px_24px_-10px_rgba(79,70,229,0.55)] ${iconMotion}`}
              >
                <FileSearch className="w-5.5 h-5.5" strokeWidth={2.1} />
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-600 bg-indigo-100 rounded-full px-2.5 py-1">
                École · Beta
              </span>
            </div>
            <h3 className="relative mt-5 font-display font-bold text-ink text-2xl lg:text-[1.7rem] leading-tight">
              Extraction intelligente <span className="grad-text-cool">PDF &amp; Excel</span>
            </h3>
            <p className="relative mt-2.5 text-sm text-muted max-w-md leading-relaxed">
              Uploadez vos relevés de notes bruts. Le LLM identifie nom, formation,
              mention et date, puis propose un mapping visuel que vous validez en
              un clic avant signature.
            </p>

            {/* Mock mapping — anchored to the bottom of the tall card */}
            <div className="relative mt-auto pt-5 grid grid-cols-2 gap-2 max-w-md">
              {mapping.map((m) => (
                <div
                  key={m.src}
                  className="neumorph-sm rounded-xl px-3 py-2 flex items-center gap-2 text-[11px]"
                >
                  <span className="font-mono text-muted truncate">{m.src}</span>
                  <span className="text-indigo-500 transition-transform duration-300 group-hover:translate-x-0.5">
                    →
                  </span>
                  <span className="font-mono text-ink font-semibold truncate">{m.dst}</span>
                </div>
              ))}
            </div>
          </article>

          {/* ── Anomaly detection (wide short) ────────────────────────── */}
          <article
            data-bento
            onMouseMove={handleGlow}
            style={cardVar(glow.magenta)}
            className={`${card} p-5 lg:col-span-5 flex items-center gap-4`}
          >
            <div
              className={`shrink-0 w-11 h-11 rounded-xl bg-linear-to-br from-magenta-500 to-pink-500 text-white grid place-items-center shadow-[0_8px_20px_-8px_rgba(236,72,153,0.55)] ${iconMotion}`}
            >
              <Brain className="w-5 h-5" strokeWidth={2.1} />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-bold text-ink text-base leading-tight">
                Détection d&apos;anomalies
              </h3>
              <p className="mt-0.5 text-xs text-muted leading-relaxed">
                Doublons, dates incohérentes, fautes. L&apos;IA alerte sans bloquer.
              </p>
            </div>
            <div aria-hidden className="ml-auto hidden sm:flex flex-col gap-1.5 shrink-0">
              {[0, 1, 2].map((i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-magenta-500 animate-pulse-soft" />
                  <span className="w-10 h-1 rounded-full bg-magenta-100" />
                </span>
              ))}
            </div>
          </article>

          {/* ── LinkedIn assistant (wide short) ───────────────────────── */}
          <article
            data-bento
            onMouseMove={handleGlow}
            style={cardVar(glow.cyan)}
            className={`${card} p-5 lg:col-span-5 flex items-center gap-4`}
          >
            <div
              className={`shrink-0 w-11 h-11 rounded-xl bg-linear-to-br from-cyan-500 to-cyan-400 text-white grid place-items-center shadow-[0_8px_20px_-8px_rgba(6,182,212,0.55)] ${iconMotion}`}
            >
              <Linkedin className="w-5 h-5" strokeWidth={2.1} />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-bold text-ink text-base leading-tight">
                Assistant Élève · LinkedIn
              </h3>
              <p className="mt-0.5 text-xs text-muted leading-relaxed">
                Rédige posts, résumés CV et lettres de motivation.
              </p>
            </div>
            <span className="ml-auto hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-cyan-500 bg-cyan-100 rounded-full px-2.5 py-1 shrink-0">
              <ArrowUpRight className="w-3 h-3" /> Viral
            </span>
          </article>

          {/* ── Analytics (very wide short) ───────────────────────────── */}
          <article
            data-bento
            onMouseMove={handleGlow}
            style={cardVar(glow.amber)}
            className={`${card} p-5 lg:col-span-7 flex items-center gap-4`}
          >
            <div
              className={`shrink-0 w-11 h-11 rounded-xl bg-linear-to-br from-amber-500 to-orange-500 text-white grid place-items-center shadow-[0_8px_20px_-8px_rgba(245,158,11,0.55)] ${iconMotion}`}
            >
              <BarChart3 className="w-5 h-5" strokeWidth={2.1} />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-bold text-ink text-base leading-tight">
                Rapport IA mensuel
              </h3>
              <p className="mt-0.5 text-xs text-muted leading-relaxed">
                Résumé naturel par filière. Pilotage simplifié, sans tableur.
              </p>
            </div>
            <div aria-hidden className="ml-auto hidden sm:flex items-end gap-1 h-10 shrink-0">
              {[42, 66, 50, 82, 58, 74, 46].map((h, i) => (
                <span
                  key={i}
                  style={{ height: `${h}%` }}
                  className="w-1.5 rounded-full bg-linear-to-t from-amber-500/35 to-amber-500 origin-bottom transition-transform duration-300 group-hover:scale-y-110"
                />
              ))}
            </div>
          </article>

          {/* ── Scoring (secondary feature, tall) ─────────────────────── */}
          <article
            data-bento
            onMouseMove={handleGlow}
            style={cardVar(glow.magenta)}
            className={`${cardBig} p-6 lg:col-span-5 lg:row-span-2`}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-16 -right-16 w-56 h-56 rounded-full opacity-70"
              style={{ background: "radial-gradient(circle, rgba(236,72,153,0.16), transparent 70%)" }}
            />
            <div className="relative flex items-start justify-between">
              <div
                className={`w-12 h-12 rounded-2xl bg-linear-to-br from-magenta-500 to-orange-500 text-white grid place-items-center shadow-[0_10px_24px_-10px_rgba(236,72,153,0.55)] ${iconMotion}`}
              >
                <Target className="w-5.5 h-5.5" strokeWidth={2.1} />
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-magenta-500 bg-magenta-100 rounded-full px-2.5 py-1">
                Recruteur · V1.0
              </span>
            </div>
            <h3 className="relative mt-5 font-display font-bold text-ink text-2xl leading-tight">
              Scoring diplôme / fiche de poste
            </h3>
            <p className="relative mt-2.5 text-sm text-muted">
              Le recruteur colle une fiche de poste : l&apos;IA calcule un score
              d&apos;adéquation, les forces, les manques, et suggère des questions
              d&apos;entretien ciblées.
            </p>

            <div className="relative mt-auto pt-5 flex items-center gap-4">
              <div className="relative w-24 h-24 shrink-0">
                <svg viewBox="0 0 100 100" className="w-24 h-24 -rotate-90">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth="10" />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="url(#scoreGrad)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${(87 / 100) * 251.3} 251.3`}
                  />
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" x2="1" y1="0" y2="1">
                      <stop offset="0%" stopColor="#4F46E5" />
                      <stop offset="100%" stopColor="#EC4899" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 grid place-items-center font-display font-bold text-ink text-xl">
                  87<span className="text-xs text-muted">/100</span>
                </div>
              </div>
              <div className="flex-1 space-y-1.5 text-xs">
                {scoreBreakdown.map((s) => (
                  <div key={s.k}>
                    <div className="flex justify-between">
                      <span className="text-muted">{s.k}</span>
                      <span className="font-semibold text-ink">{s.v}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-hairline overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${s.v}%`,
                          background: "linear-gradient(90deg, #4F46E5, #EC4899)",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </article>

          {/* ── Translation (wide short) ──────────────────────────────── */}
          <article
            data-bento
            onMouseMove={handleGlow}
            style={cardVar(glow.indigo)}
            className={`${card} p-5 lg:col-span-4 flex items-center gap-4`}
          >
            <div
              className={`shrink-0 w-11 h-11 rounded-xl bg-linear-to-br from-indigo-500 to-cyan-500 text-white grid place-items-center shadow-[0_8px_20px_-8px_rgba(79,70,229,0.55)] ${iconMotion}`}
            >
              <Languages className="w-5 h-5" strokeWidth={2.1} />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-bold text-ink text-base leading-tight">
                Traduction multilingue
              </h3>
              <p className="mt-0.5 text-xs text-muted leading-relaxed">
                Diplôme localisé sans altérer la signature source.
              </p>
            </div>
            <div aria-hidden className="ml-auto hidden xl:flex gap-1 shrink-0">
              {["FR", "EN", "ES"].map((l) => (
                <span
                  key={l}
                  className="text-[10px] font-bold text-indigo-600 bg-indigo-100 rounded-md px-1.5 py-0.5"
                >
                  {l}
                </span>
              ))}
            </div>
          </article>

          {/* ── Skills mapping (short) ────────────────────────────────── */}
          <article
            data-bento
            onMouseMove={handleGlow}
            style={cardVar(glow.lime)}
            className={`${card} p-5 lg:col-span-3 flex items-center gap-4`}
          >
            <div
              className={`shrink-0 w-11 h-11 rounded-xl bg-linear-to-br from-lime-500 to-cyan-500 text-white grid place-items-center shadow-[0_8px_20px_-8px_rgba(132,204,22,0.55)] ${iconMotion}`}
            >
              <Globe2 className="w-5 h-5" strokeWidth={2.1} />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-bold text-ink text-base leading-tight">
                Mapping ROME / ESCO
              </h3>
              <p className="mt-0.5 text-xs text-muted leading-relaxed">
                Compétences alignées aux standards européens.
              </p>
            </div>
          </article>
        </div>

        {/* Marquee of partners (loop animation) with faded edges */}
        <div className="mt-16 glass rounded-full py-4 overflow-hidden">
          <div
            className="flex items-center gap-12 animate-marquee whitespace-nowrap"
            style={{
              maskImage:
                "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)",
              WebkitMaskImage:
                "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)",
            }}
          >
            {[...Array(2)].map((_, dup) =>
              [
                "SIRET · INSEE",
                "RNCP · France Compétences",
                "EQAR · European Quality",
                "W3C Verifiable Credentials",
                "Polygon · Anchor",
                "Ed25519 · SnarkJS",
                "RGPD · TLS 1.3",
              ].map((l) => (
                <span
                  key={`${dup}-${l}`}
                  className="text-sm font-semibold text-muted flex items-center gap-3"
                >
                  <span className="w-1 h-1 rounded-full bg-indigo-500" />
                  {l}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
