"use client";

import { useRef } from "react";
import { Check } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export default function Pricing() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: sectionRef.current,
        start: "top 70%",
      }
    });

    // Animate headers
    tl.fromTo(
      ".pricing-header",
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }
    );

    // Animate cards staggering in
    const cards = gsap.utils.toArray(".pricing-card");
    tl.fromTo(
      cards,
      { opacity: 0, y: 100, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.8, stagger: 0.2, ease: "back.out(1.2)" },
      "-=0.2"
    );

    // Special animation for the Pro card
    tl.fromTo(
      ".pro-card-highlight",
      { opacity: 0, scale: 0 },
      { opacity: 1, scale: 1, duration: 0.5, ease: "elastic.out(1, 0.5)" },
      "-=0.4"
    );

  }, { scope: sectionRef });

  return (
    <section id="tarifs" className="py-24 bg-slate-50 border-t border-slate-200" ref={sectionRef}>
      <div className="container mx-auto px-6">
        <div className="pricing-header text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-6">Des tarifs adaptés à chaque établissement</h2>
          <p className="text-lg text-slate-600 font-medium">
            Commencez petit ou déployez à grande échelle. Des forfaits transparents sans frais cachés.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto perspective-1000">
          {/* Starter */}
          <div className="pricing-card bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col hover:shadow-xl transition-shadow duration-300">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Starter</h3>
            <p className="text-slate-500 text-sm mb-6">Pour les petites écoles et CFA.</p>
            <div className="mb-6">
              <span className="text-4xl font-extrabold text-slate-900">49 €</span>
              <span className="text-slate-500 font-medium"> / mois</span>
            </div>
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                <span className="text-slate-600">500 diplômes par an</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                <span className="text-slate-600">1 Administrateur</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                <span className="text-slate-600">KYB & Registre public</span>
              </li>
              <li className="flex items-start gap-3 opacity-40">
                <Check className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
                <span className="text-slate-400 line-through">Fonctionnalités IA</span>
              </li>
            </ul>
            <button className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 py-3.5 rounded-xl font-semibold transition-colors">
              Commencer
            </button>
          </div>

          {/* Pro */}
          <div className="pricing-card relative flex flex-col">
            <div className="absolute inset-0 bg-gradient-to-b from-primary to-indigo-600 rounded-3xl blur-[10px] opacity-20" />
            <div className="bg-white rounded-3xl p-8 border-2 border-primary shadow-2xl relative flex flex-col flex-1 transform md:-translate-y-4">
              <div className="pro-card-highlight absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-white px-5 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg shadow-primary/30">
                Le plus populaire
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2 mt-2">Pro</h3>
              <p className="text-slate-500 text-sm mb-6">Pour les écoles de taille moyenne.</p>
              <div className="mb-6">
                <span className="text-4xl font-extrabold text-slate-900">149 €</span>
                <span className="text-slate-500 font-medium"> / mois</span>
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-slate-600 font-bold">Diplômes illimités</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-slate-600">Jusqu'à 5 Administrateurs</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-slate-600">Statistiques avancées</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-slate-600 font-bold">IA Beta (Extraction)</span>
                </li>
              </ul>
              <button className="w-full bg-primary hover:bg-blue-700 text-white py-3.5 rounded-xl font-semibold transition-colors shadow-lg shadow-primary/30">
                Essai gratuit 14 jours
              </button>
            </div>
          </div>

          {/* Enterprise */}
          <div className="pricing-card bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col hover:shadow-xl transition-shadow duration-300">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Enterprise</h3>
            <p className="text-slate-500 text-sm mb-6">Universités et grands réseaux.</p>
            <div className="mb-6">
              <span className="text-4xl font-extrabold text-slate-900">399 €+</span>
              <span className="text-slate-500 font-medium"> / mois</span>
            </div>
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                <span className="text-slate-600">API Publique & SSO</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                <span className="text-slate-600">Ancrage Blockchain optionnel</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                <span className="text-slate-600">SLA 99.9% garanti</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                <span className="text-slate-600">Toutes les fonctionnalités IA</span>
              </li>
            </ul>
            <button className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 py-3.5 rounded-xl font-semibold transition-colors">
              Contacter les ventes
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
