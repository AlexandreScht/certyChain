"use client";

import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Sparkles, Users } from "lucide-react";
import { useState } from "react";

export default function HeroSection() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubmitted(true);
      setEmail("");
    }
  };

  return (
    <section className="relative min-h-screen flex items-center hero-gradient overflow-hidden pt-24 pb-16 lg:pt-32 lg:pb-24">
      {/* Animated orbs */}
      <div className="orb orb-1" aria-hidden="true" />
      <div className="orb orb-2" aria-hidden="true" />
      <div className="orb orb-3" aria-hidden="true" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: Copy */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full waitlist-counter mb-8">
              <Sparkles className="w-4 h-4 text-cta" />
              <span className="text-sm font-semibold text-cta">Lancement 2025</span>
              <span className="text-xs text-text-muted">•</span>
              <span className="text-sm text-text-muted flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                Accès anticipé
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-primary leading-[1.1] mb-6">
              Rendez la fraude aux diplômes{" "}
              <span className="gradient-text">techniquement impossible.</span>
            </h1>

            <p className="text-lg sm:text-xl text-text-muted leading-relaxed mb-8 max-w-xl">
              CertifyChain permet à votre établissement d&apos;émettre des diplômes numériques
              vérifiables en{" "}
              <strong className="text-primary font-semibold">moins de 10 secondes</strong>, grâce à
              la cryptographie Zero-Knowledge. Sans que le recruteur n&apos;accède jamais au document.
            </p>

            {/* Waitlist form */}
            {!submitted ? (
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 mb-6 max-w-lg">
                <label htmlFor="hero-email" className="sr-only">
                  Adresse email professionnelle
                </label>
                <input
                  id="hero-email"
                  type="email"
                  required
                  placeholder="votre@ecole.fr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 px-5 py-3.5 rounded-xl border border-border bg-white text-primary placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-cta/30 focus:border-cta transition-all duration-200 shadow-soft-sm text-sm"
                />
                <button
                  type="submit"
                  className="flex items-center justify-center gap-2 px-6 py-3.5 bg-cta hover:bg-cta-hover text-white font-semibold rounded-xl transition-all duration-200 shadow-soft glow-cta cursor-pointer group whitespace-nowrap"
                >
                  Rejoindre
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
                </button>
              </form>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-3 px-5 py-4 rounded-xl bg-green-50 border border-green-200 mb-6 max-w-lg"
              >
                <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
                <p className="text-sm text-green-800 font-medium">
                  Vous êtes sur la liste ! Nous vous contacterons très bientôt.
                </p>
              </motion.div>
            )}

            {/* Trust signals */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-text-subtle">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-success" />
                Gratuit pour les beta-testeurs
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-success" />
                Conforme RGPD
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-success" />
                Aucune installation
              </span>
            </div>
          </motion.div>

          {/* Right: Visual */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            className="hidden lg:block"
          >
            <div className="relative">
              {/* Main card - Diploma preview */}
              <div className="relative bg-white rounded-3xl shadow-soft-xl border border-border p-8 max-w-md mx-auto">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cta to-accent flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-white" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                      <path d="M6 12v5c3 3 6 3 12 0v-5" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-cta uppercase tracking-wider">Diplôme vérifié</p>
                    <p className="text-sm text-text-muted">CertifyChain</p>
                  </div>
                  <div className="ml-auto">
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                      <CheckCircle2 className="w-3 h-3" />
                      Authentique
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-text-subtle mb-1">Titulaire</p>
                    <p className="text-sm font-semibold text-primary">Marie Dupont</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-subtle mb-1">Formation</p>
                    <p className="text-sm font-semibold text-primary">Master Ingénierie Logicielle</p>
                  </div>
                  <div className="flex gap-6">
                    <div>
                      <p className="text-xs text-text-subtle mb-1">Établissement</p>
                      <p className="text-sm font-semibold text-primary">École Polytechnique</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-subtle mb-1">Date</p>
                      <p className="text-sm font-semibold text-primary">Juin 2025</p>
                    </div>
                  </div>
                </div>

                {/* Signature bar */}
                <div className="mt-6 pt-4 border-t border-border-light flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-success pulse-ring" />
                    <span className="text-xs text-success font-medium">Signature cryptographique valide</span>
                  </div>
                  <span className="text-xs text-text-subtle font-mono">ZKP-NIZK</span>
                </div>
              </div>

              {/* Floating badge - Verification time */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.5 }}
                className="absolute -bottom-10 -left-8"
                style={{ willChange: "transform" }}
              >
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{
                    duration: 6,
                    repeat: Infinity,
                    ease: [0.45, 0, 0.55, 1],
                    repeatType: "loop",
                  }}
                  className="bg-white rounded-2xl shadow-soft-lg border border-border px-5 py-3.5"
                  style={{ willChange: "transform", backfaceVisibility: "hidden", transform: "translateZ(0)" }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent-warm/10 flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-accent-warm" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-text-subtle">Vérification en</p>
                      <p className="text-lg font-bold text-primary">&lt; 10 sec</p>
                    </div>
                  </div>
                </motion.div>
              </motion.div>

              {/* Floating badge - Fraud impossible */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.0, duration: 0.5 }}
                className="absolute -top-6 -right-6"
                style={{ willChange: "transform" }}
              >
                <motion.div
                  animate={{ y: [0, 10, 0] }}
                  transition={{
                    duration: 6,
                    repeat: Infinity,
                    ease: [0.45, 0, 0.55, 1],
                    repeatType: "loop",
                  }}
                  className="bg-white rounded-2xl shadow-soft-lg border border-border px-5 py-3.5"
                  style={{ willChange: "transform", backfaceVisibility: "hidden", transform: "translateZ(0)" }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-error" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-text-subtle">Fraude</p>
                      <p className="text-sm font-bold text-primary">Impossible</p>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
