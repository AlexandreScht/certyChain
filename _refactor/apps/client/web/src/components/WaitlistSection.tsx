"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Mail, ArrowRight, CheckCircle2, Building2 } from "lucide-react";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

export default function WaitlistSection() {
  const rootRef = useRef<HTMLElement>(null);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useGSAP(
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) return;

      gsap.from("[data-cta-content]", {
        y: 30, opacity: 0, duration: 0.9, ease: "power3.out",
        scrollTrigger: { trigger: rootRef.current, start: "top 80%" },
      });

      // Scaling breathing on card
      gsap.to("[data-cta-card]", {
        scale: 1.01,
        duration: 3,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
    },
    { scope: rootRef }
  );

  return (
    <section
      ref={rootRef}
      id="cta"
      className="relative py-28 md:py-36 overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-mesh opacity-70"
      />
      <div
        aria-hidden
        className="absolute -top-10 left-1/4 w-[380px] h-[380px] rounded-full animate-float-slow"
        style={{
          background: "radial-gradient(circle, rgba(99,102,241,0.28), transparent 70%)",
          filter: "blur(48px)",
        }}
      />
      <div
        aria-hidden
        className="absolute bottom-0 right-1/4 w-[320px] h-[320px] rounded-full animate-float-slower"
        style={{
          background: "radial-gradient(circle, rgba(236,72,153,0.24), transparent 70%)",
          filter: "blur(48px)",
          animationDelay: "-5s",
        }}
      />

      <div className="relative max-w-4xl mx-auto px-6">
        <div
          data-cta-card
          className="relative glass-strong rounded-4xl p-8 md:p-14 text-center overflow-hidden"
        >
          <div
            className="absolute -inset-2 rounded-[2.1rem] grad-ring opacity-25 blur-md animate-spin-slower -z-10"
            aria-hidden
          />

          <div data-cta-content>
            <div className="inline-flex items-center gap-2 neumorph-pill rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-soft mb-6">
              <Building2 className="w-3.5 h-3.5 text-indigo-600" />
              Réservé aux établissements
            </div>
            <h2 className="font-display font-bold text-ink tracking-tight text-4xl md:text-5xl lg:text-6xl leading-[1.02] max-w-3xl mx-auto">
              Faites de votre école{" "}
              <span className="grad-text">un émetteur certifié</span>.
            </h2>
            <p className="mt-5 text-lg text-muted max-w-2xl mx-auto">
              Rejoignez le pilote CertifyChain. Trois écoles partenaires
              déjà sélectionnées pour la phase Beta. Onboarding KYB accompagné
              en 48h.
            </p>

            {submitted ? (
              <div className="mt-8 inline-flex items-center gap-2.5 glass rounded-full px-5 py-3 text-success font-semibold">
                <CheckCircle2 className="w-5 h-5" />
                Merci ! Notre équipe vous contacte sous 24h ouvrées.
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (email.trim()) setSubmitted(true);
                }}
                className="mt-8 max-w-lg mx-auto"
              >
                <div className="relative neumorph-sm rounded-full p-1.5 flex items-center gap-1 focus-within:ring-2 focus-within:ring-indigo-300 transition-shadow">
                  <label htmlFor="cta-email" className="sr-only">
                    Email professionnel
                  </label>
                  <div className="pl-4 text-muted-soft">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="cta-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@votre-ecole.fr"
                    className="flex-1 bg-transparent outline-none px-2 py-2.5 text-sm text-ink placeholder:text-muted-soft min-w-0"
                  />
                  <button
                    type="submit"
                    className="cta-primary cursor-pointer px-5 py-2.5 rounded-full font-semibold text-sm inline-flex items-center gap-1.5 shrink-0"
                  >
                    Rejoindre
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
                <p className="mt-3 text-xs text-muted-soft">
                  Aucun engagement · Désinscription en 1 clic · Données
                  hébergées en France
                </p>
              </form>
            )}

            <p className="mt-5 text-sm text-muted">
              Déjà décidé ?{" "}
              <Link
                href="/ecole/register"
                className="font-semibold text-indigo-600 hover:text-indigo-500 underline underline-offset-4 decoration-indigo-300 transition-colors"
              >
                Créer mon espace établissement
              </Link>
            </p>

            <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-muted">
              {[
                "RGPD conforme",
                "Chiffrement TLS 1.3",
                "Clés privées HSM",
                "SLA 99,5 % Beta",
              ].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-success" /> {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
