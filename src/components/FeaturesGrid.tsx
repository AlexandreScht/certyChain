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
} from "lucide-react";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

export default function FeaturesGrid() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) return;

      gsap.from("[data-bento]", {
        y: 40, opacity: 0, scale: 0.98,
        duration: 0.8, stagger: 0.08, ease: "power3.out",
        scrollTrigger: { trigger: rootRef.current, start: "top 70%" },
      });
    },
    { scope: rootRef }
  );

  // Interactive magnetic hover on bento
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 10;
    const y = ((e.clientY - r.top) / r.height - 0.5) * 10;
    el.style.transform = `translate3d(${x * 0.6}px, ${y * 0.6}px, 0)`;
  };
  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = "translate3d(0,0,0)";
  };

  return (
    <section
      ref={rootRef}
      id="ia"
      className="relative py-28 md:py-36 overflow-hidden"
    >
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
          <h2 className="font-display font-bold text-ink tracking-tight text-4xl md:text-5xl leading-[1.05]">
            L&apos;IA assiste. <span className="grad-text">La cryptographie garantit.</span>
          </h2>
          <p className="mt-5 text-lg text-muted max-w-2xl">
            Les fonctionnalités IA n&apos;altèrent jamais la preuve cryptographique.
            Elles fluidifient l&apos;import, l&apos;analyse, la traduction et le scoring —
            tout en restant sous contrôle humain.
          </p>
        </div>

        {/* Bento grid */}
        <div className="mt-14 grid grid-cols-6 gap-4 auto-rows-[160px]">
          {/* Big: extraction */}
          <div
            data-bento
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="col-span-6 lg:col-span-4 lg:row-span-2 glass-strong rounded-[1.75rem] p-7 relative overflow-hidden transition-transform duration-300 will-change-transform cursor-default"
          >
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-indigo-600 to-indigo-500 text-white grid place-items-center shadow-[0_10px_24px_-10px_rgba(79,70,229,0.55)]">
                <FileSearch className="w-5.5 h-5.5" strokeWidth={2.1} />
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-600 bg-indigo-100 rounded-full px-2.5 py-1">
                École · Beta
              </span>
            </div>
            <h3 className="mt-6 font-display font-bold text-ink text-2xl md:text-3xl leading-tight">
              Extraction intelligente <span className="grad-text-cool">PDF & Excel</span>
            </h3>
            <p className="mt-3 text-muted max-w-md">
              Uploadez directement vos relevés de notes bruts. Le LLM identifie
              nom, formation, mention, date, puis propose un mapping visuel que
              vous validez en un clic avant signature.
            </p>

            {/* Mock mapping */}
            <div className="mt-6 grid grid-cols-2 gap-2 max-w-md">
              {[
                { src: "Nom complet", dst: "holder_name" },
                { src: "Parcours", dst: "program" },
                { src: "Date diplôme", dst: "issued_at" },
                { src: "Mention obtenue", dst: "grade" },
              ].map((m) => (
                <div key={m.src} className="neumorph-sm rounded-xl px-3 py-2 flex items-center gap-2 text-[11px]">
                  <span className="font-mono text-muted truncate">{m.src}</span>
                  <span className="text-indigo-500">→</span>
                  <span className="font-mono text-ink font-semibold truncate">{m.dst}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Anomaly detection */}
          <div
            data-bento
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="col-span-3 lg:col-span-2 lg:row-span-1 glass rounded-[1.75rem] p-5 relative overflow-hidden transition-transform duration-300 will-change-transform cursor-default"
          >
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-magenta-500 to-pink-500 text-white grid place-items-center shadow-[0_8px_20px_-8px_rgba(236,72,153,0.55)]">
              <Brain className="w-5 h-5" strokeWidth={2.1} />
            </div>
            <h3 className="mt-3 font-display font-bold text-ink text-base leading-tight">
              Détection d&apos;anomalies
            </h3>
            <p className="mt-1 text-xs text-muted leading-relaxed">
              Doublons, dates incohérentes, fautes. L&apos;IA alerte sans bloquer.
            </p>
          </div>

          {/* LinkedIn assistant */}
          <div
            data-bento
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="col-span-3 lg:col-span-2 lg:row-span-1 glass rounded-[1.75rem] p-5 relative overflow-hidden transition-transform duration-300 will-change-transform cursor-default"
          >
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-cyan-500 to-cyan-400 text-white grid place-items-center shadow-[0_8px_20px_-8px_rgba(6,182,212,0.55)]">
              <Linkedin className="w-5 h-5" strokeWidth={2.1} />
            </div>
            <h3 className="mt-3 font-display font-bold text-ink text-base leading-tight">
              Assistant Élève · LinkedIn
            </h3>
            <p className="mt-1 text-xs text-muted leading-relaxed">
              Rédige posts, résumés CV et lettres de motivation. Effet viral.
            </p>
          </div>

          {/* Scoring recruiter */}
          <div
            data-bento
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="col-span-6 lg:col-span-3 lg:row-span-2 glass rounded-[1.75rem] p-6 relative overflow-hidden transition-transform duration-300 will-change-transform cursor-default"
          >
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-magenta-500 to-orange-500 text-white grid place-items-center shadow-[0_10px_24px_-10px_rgba(236,72,153,0.55)]">
                <Target className="w-5.5 h-5.5" strokeWidth={2.1} />
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-magenta-500 bg-magenta-100 rounded-full px-2.5 py-1">
                Recruteur · V1.0
              </span>
            </div>
            <h3 className="mt-5 font-display font-bold text-ink text-2xl leading-tight">
              Scoring diplôme / fiche de poste
            </h3>
            <p className="mt-3 text-sm text-muted">
              Le recruteur colle une fiche de poste : l&apos;IA calcule un score
              d&apos;adéquation, les forces, les manques, et suggère des questions
              d&apos;entretien ciblées.
            </p>

            {/* Mock score ring */}
            <div className="mt-5 flex items-center gap-4">
              <div className="relative w-24 h-24">
                <svg viewBox="0 0 100 100" className="w-24 h-24 -rotate-90">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth="10" />
                  <circle
                    cx="50" cy="50" r="40" fill="none"
                    stroke="url(#scoreGrad)" strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${(87/100) * 251.3} 251.3`}
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
                {[
                  { k: "Data Engineering", v: 92 },
                  { k: "Cloud AWS", v: 78 },
                  { k: "Soft skills", v: 84 },
                ].map((s) => (
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
          </div>

          {/* Analytics */}
          <div
            data-bento
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="col-span-3 lg:col-span-2 lg:row-span-1 glass rounded-[1.75rem] p-5 relative overflow-hidden transition-transform duration-300 will-change-transform cursor-default"
          >
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-amber-500 to-orange-500 text-white grid place-items-center shadow-[0_8px_20px_-8px_rgba(245,158,11,0.55)]">
              <BarChart3 className="w-5 h-5" strokeWidth={2.1} />
            </div>
            <h3 className="mt-3 font-display font-bold text-ink text-base leading-tight">
              Rapport IA mensuel
            </h3>
            <p className="mt-1 text-xs text-muted leading-relaxed">
              Résumé naturel par filière. Pilotage simplifié.
            </p>
          </div>

          {/* Translation */}
          <div
            data-bento
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="col-span-3 lg:col-span-2 lg:row-span-1 glass rounded-[1.75rem] p-5 relative overflow-hidden transition-transform duration-300 will-change-transform cursor-default"
          >
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-500 to-cyan-500 text-white grid place-items-center shadow-[0_8px_20px_-8px_rgba(79,70,229,0.55)]">
              <Languages className="w-5 h-5" strokeWidth={2.1} />
            </div>
            <h3 className="mt-3 font-display font-bold text-ink text-base leading-tight">
              Traduction multilingue
            </h3>
            <p className="mt-1 text-xs text-muted leading-relaxed">
              Diplôme localisé sans altérer la signature source.
            </p>
          </div>

          {/* Skills */}
          <div
            data-bento
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="col-span-6 lg:col-span-2 lg:row-span-1 glass rounded-[1.75rem] p-5 relative overflow-hidden transition-transform duration-300 will-change-transform cursor-default"
          >
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-lime-500 to-cyan-500 text-white grid place-items-center shadow-[0_8px_20px_-8px_rgba(132,204,22,0.55)]">
              <Globe2 className="w-5 h-5" strokeWidth={2.1} />
            </div>
            <h3 className="mt-3 font-display font-bold text-ink text-base leading-tight">
              Mapping ROME / ESCO
            </h3>
            <p className="mt-1 text-xs text-muted leading-relaxed">
              Extraction de compétences alignée aux standards européens.
            </p>
          </div>
        </div>

        {/* Marquee of partners (loop animation) */}
        <div className="mt-16 relative overflow-hidden glass rounded-full py-4">
          <div className="flex items-center gap-12 animate-marquee whitespace-nowrap">
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
