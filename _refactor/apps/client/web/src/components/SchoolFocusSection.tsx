"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  BadgeCheck,
  Upload,
  LayoutDashboard,
  Users,
  FileCheck2,
  Zap,
  BookOpen,
  ArrowRight,
  TrendingUp,
} from "lucide-react";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const benefits = [
  {
    icon: BadgeCheck,
    title: "Statut Émetteur certifié",
    desc: "Publié sur le registre public certifychain.io/issuers — argument commercial fort auprès des familles et des recruteurs.",
  },
  {
    icon: Upload,
    title: "Import PDF, Excel ou CSV",
    desc: "L'IA extrait les champs (nom, formation, mention, date). Vous validez visuellement avant signature.",
  },
  {
    icon: Zap,
    title: "Émission en masse 1 clic",
    desc: "Signez une promotion entière (500 diplômes) en quelques secondes. Notifications automatiques aux élèves.",
  },
  {
    icon: LayoutDashboard,
    title: "Tableau de bord temps réel",
    desc: "Vérifications par filière, diplômes les plus consultés, rapport IA mensuel généré automatiquement.",
  },
  {
    icon: FileCheck2,
    title: "Révocation immédiate",
    desc: "En cas d'erreur ou de fraude, un diplôme devient « introuvable » en un clic. Audit log complet.",
  },
  {
    icon: Users,
    title: "Multi-admins & SSO",
    desc: "Déléguez l'émission aux responsables de filière. SSO disponible sur l'offre Enterprise.",
  },
];

export default function SchoolFocusSection() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) return;

      gsap.from("[data-title-focus]", {
        y: 20, opacity: 0, duration: 0.8, ease: "power3.out",
        scrollTrigger: { trigger: rootRef.current, start: "top 80%" },
      });

      gsap.from("[data-benefit]", {
        y: 24, opacity: 0, duration: 0.6, stagger: 0.08, ease: "power2.out",
        scrollTrigger: { trigger: rootRef.current, start: "top 70%" },
      });

      gsap.from("[data-dash]", {
        x: 40, opacity: 0, duration: 0.9, ease: "power3.out",
        scrollTrigger: { trigger: rootRef.current, start: "top 65%" },
      });

      // Animate mock bars
      gsap.from("[data-bar]", {
        scaleY: 0,
        transformOrigin: "bottom",
        duration: 0.8,
        ease: "power3.out",
        stagger: 0.06,
        scrollTrigger: { trigger: "[data-dash]", start: "top 80%" },
      });

      // Parallax to orbs
      gsap.to("[data-parallax]", {
        y: -60,
        ease: "none",
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });
    },
    { scope: rootRef }
  );

  return (
    <section
      ref={rootRef}
      id="ecoles"
      className="relative py-28 md:py-36 overflow-hidden"
    >
      <div
        aria-hidden
        data-parallax
        className="absolute top-20 left-0 w-[420px] h-[420px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(99,102,241,0.22), transparent 70%)",
          filter: "blur(50px)",
        }}
      />
      <div
        aria-hidden
        data-parallax
        className="absolute bottom-0 right-0 w-[380px] h-[380px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(6,182,212,0.2), transparent 70%)",
          filter: "blur(50px)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-12 gap-10 items-start">
          {/* LEFT — copy + benefits */}
          <div className="lg:col-span-7">
            <div data-title-focus>
              <div className="inline-flex items-center gap-2 neumorph-pill rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-soft mb-5">
                <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                Pour votre établissement
              </div>
              <h2 className="font-display font-bold text-ink tracking-tight text-4xl md:text-5xl leading-[1.05]">
                Un portail d&apos;émission{" "}
                <span className="grad-text">pensé pour l&apos;administratif scolaire</span>.
              </h2>
              <p className="mt-5 text-lg text-muted max-w-xl">
                Vos responsables pédagogiques n&apos;ont pas à devenir cryptographes.
                Ils importent leurs fichiers existants, valident, signent. Nous
                nous occupons de la chaîne de confiance, de la PKI et de la
                conformité RGPD.
              </p>
            </div>

            <div className="mt-10 grid sm:grid-cols-2 gap-4">
              {benefits.map((b) => {
                const Icon = b.icon;
                return (
                  <div
                    key={b.title}
                    data-benefit
                    className="group glass rounded-2xl p-5 lift cursor-default"
                  >
                    <div className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-600 to-indigo-500 text-white grid place-items-center shadow-[0_8px_20px_-8px_rgba(79,70,229,0.55)] group-hover:scale-110 transition-transform duration-300">
                      <Icon className="w-5 h-5" strokeWidth={2.1} />
                    </div>
                    <h3 className="mt-4 font-display font-bold text-ink text-base leading-tight">
                      {b.title}
                    </h3>
                    <p className="mt-1.5 text-sm text-muted leading-relaxed">
                      {b.desc}
                    </p>
                  </div>
                );
              })}
            </div>

            <a
              href="#cta"
              className="mt-10 cta-primary cursor-pointer inline-flex items-center gap-2 px-6 py-3.5 rounded-full font-semibold group"
            >
              Demander une démo pour mon école
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </a>
          </div>

          {/* RIGHT — Dashboard mock */}
          <div data-dash className="lg:col-span-5 lg:sticky lg:top-28">
            <div className="relative">
              <div className="absolute -inset-4 rounded-4xl opacity-40 blur-2xl grad-ring animate-spin-slower" aria-hidden />
              <div className="relative glass-strong rounded-[1.75rem] p-6">
                {/* Window header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-magenta-500/70" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
                    <span className="w-2.5 h-2.5 rounded-full bg-success/70" />
                  </div>
                  <div className="text-[11px] text-muted-soft font-mono">
                    admin.certifychain.io / dashboard
                  </div>
                </div>

                {/* KPI row */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Émis / mois", v: "1 248", delta: "+12%" },
                    { label: "Vérifications", v: "3 406", delta: "+38%" },
                    { label: "Taux fraude", v: "0 %", delta: "stable" },
                  ].map((k) => (
                    <div key={k.label} className="neumorph-inset rounded-xl px-3 py-3">
                      <div className="text-[10px] uppercase tracking-wider text-muted-soft font-semibold">
                        {k.label}
                      </div>
                      <div className="font-display font-bold text-ink text-lg leading-tight">
                        {k.v}
                      </div>
                      <div className="text-[10px] text-success font-semibold flex items-center gap-1 mt-0.5">
                        <TrendingUp className="w-3 h-3" /> {k.delta}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Chart */}
                <div className="mt-6 glass rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] uppercase tracking-wider text-muted-soft font-semibold">
                      Vérifications par filière
                    </div>
                    <div className="text-[10px] text-muted">30 derniers jours</div>
                  </div>
                  <div className="flex items-end gap-2 h-28">
                    {[42, 68, 55, 80, 72, 94, 60, 88, 73, 96, 65, 82].map((h, i) => (
                      <div
                        key={i}
                        data-bar
                        className="flex-1 rounded-t-md"
                        style={{
                          height: `${h}%`,
                          background:
                            i % 3 === 0
                              ? "linear-gradient(180deg, #4F46E5, #6366F1)"
                              : i % 3 === 1
                              ? "linear-gradient(180deg, #06B6D4, #22D3EE)"
                              : "linear-gradient(180deg, #EC4899, #F472B6)",
                          boxShadow:
                            "inset 0 1px 0 rgba(255,255,255,0.3), 0 6px 14px -8px rgba(79,70,229,0.4)",
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-3 text-[10px] text-muted">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-600" /> DevOps</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-500" /> Data</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-magenta-500" /> Marketing</span>
                  </div>
                </div>

                {/* Recent row */}
                <div className="mt-4 space-y-2">
                  {[
                    { n: "Promo 2025 · Master IA", s: "Émise", t: "il y a 2 min", c: "success" },
                    { n: "Vérification Recruteur × 4", s: "OK", t: "il y a 8 min", c: "indigo" },
                    { n: "IA : 1 anomalie détectée", s: "À valider", t: "il y a 20 min", c: "amber" },
                  ].map((r) => (
                    <div key={r.n} className="flex items-center justify-between glass rounded-xl px-3 py-2.5">
                      <div className="text-xs font-semibold text-ink">{r.n}</div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            r.c === "success"
                              ? "bg-emerald-100 text-emerald-700"
                              : r.c === "amber"
                              ? "bg-amber-500/15 text-amber-700"
                              : "bg-indigo-100 text-indigo-700"
                          }`}
                        >
                          {r.s}
                        </span>
                        <span className="text-[10px] text-muted-soft">{r.t}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
