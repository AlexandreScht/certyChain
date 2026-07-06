"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Check, Sparkles, ArrowRight } from "lucide-react";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const plans = [
  {
    name: "Starter",
    price: "49",
    tagline: "Petites écoles, CFA",
    cta: "Commencer",
    features: [
      "Jusqu'à 500 diplômes / an",
      "1 administrateur",
      "Signature Ed25519 + PKI",
      "Vérification publique illimitée",
      "Support email 48h",
    ],
    highlight: false,
  },
  {
    name: "Pro",
    price: "149",
    tagline: "Écoles de taille moyenne",
    cta: "Essayer Pro",
    features: [
      "Diplômes illimités",
      "5 administrateurs",
      "IA Beta : extraction, anomalies",
      "Assistant Élève LinkedIn",
      "Contextualisation Recruteur",
      "Statistiques avancées",
      "Support prioritaire",
    ],
    highlight: true,
    badge: "Le plus choisi",
  },
  {
    name: "Enterprise",
    price: "399+",
    tagline: "Universités & réseaux",
    cta: "Parler à l'équipe",
    features: [
      "Tout Pro, plus :",
      "API publique + SSO",
      "SLA 99,9 % garanti",
      "IA : scoring, traduction",
      "Ancrage blockchain Polygon",
      "Multi-établissements",
      "CSM dédié",
    ],
    highlight: false,
  },
];

export default function PricingSection() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) return;

      gsap.from("[data-plan]", {
        y: 40, opacity: 0, scale: 0.98,
        duration: 0.8, stagger: 0.12, ease: "power3.out",
        scrollTrigger: { trigger: rootRef.current, start: "top 75%" },
      });
      gsap.from("[data-price-title]", {
        y: 20, opacity: 0, duration: 0.7, ease: "power3.out",
        scrollTrigger: { trigger: rootRef.current, start: "top 80%" },
      });
    },
    { scope: rootRef }
  );

  return (
    <section
      ref={rootRef}
      id="tarifs"
      className="relative py-28 md:py-36 overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute top-0 right-0 w-[420px] h-[420px] rounded-full animate-float-slower"
        style={{
          background: "radial-gradient(circle, rgba(79,70,229,0.18), transparent 70%)",
          filter: "blur(48px)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6">
        <div data-price-title className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 neumorph-pill rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-soft mb-5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            Tarifs transparents
          </div>
          <h2 className="font-display font-bold text-ink tracking-tight text-4xl md:text-5xl leading-[1.05]">
            Trois offres, <span className="grad-text">une seule cryptographie</span>.
          </h2>
          <p className="mt-5 text-lg text-muted">
            Le cœur sécurité est identique à tous les niveaux. Vous payez
            l&apos;échelle, l&apos;IA et l&apos;intégration.
          </p>
        </div>

        <div className="mt-14 grid md:grid-cols-3 gap-5 items-stretch">
          {plans.map((p) => (
            <article
              key={p.name}
              data-plan
              className={`relative rounded-[1.75rem] p-7 flex flex-col lift ${
                p.highlight
                  ? "glass-strong md:-translate-y-4 ring-1 ring-indigo-200/70"
                  : "glass"
              }`}
            >
              {p.highlight && (
                <>
                  <div className="absolute -inset-0.5 rounded-[1.85rem] grad-ring opacity-30 blur-md animate-spin-slower -z-10" aria-hidden />
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 grad-ring text-[11px] font-bold text-white px-3 py-1 rounded-full shadow-lg uppercase tracking-wider">
                    {p.badge}
                  </div>
                </>
              )}

              <div>
                <div className="font-display font-semibold text-muted uppercase tracking-wider text-xs">
                  {p.name}
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="font-display font-bold text-ink text-5xl md:text-6xl tracking-tight">
                    {p.price} €
                  </span>
                  <span className="text-sm text-muted">/ mois</span>
                </div>
                <p className="mt-1 text-sm text-muted">{p.tagline}</p>
              </div>

              <ul className="mt-6 space-y-2.5 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <span
                      className={`shrink-0 mt-0.5 w-5 h-5 rounded-full grid place-items-center ${
                        p.highlight
                          ? "bg-linear-to-br from-indigo-600 to-indigo-500 text-white"
                          : "bg-indigo-100 text-indigo-600"
                      }`}
                    >
                      <Check className="w-3 h-3" strokeWidth={3} />
                    </span>
                    <span className="text-ink-soft">{f}</span>
                  </li>
                ))}
              </ul>

              <a
                href="#cta"
                className={`mt-7 cursor-pointer inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full font-semibold text-sm transition-colors ${
                  p.highlight
                    ? "cta-primary"
                    : "cta-ghost"
                }`}
              >
                {p.cta}
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </article>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-muted">
          Tous les plans incluent le certificat PKI signé par CertifyChain,
          TLS 1.3, RGPD et l&apos;audit log légal.
        </p>
      </div>
    </section>
  );
}
