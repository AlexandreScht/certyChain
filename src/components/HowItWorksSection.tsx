"use client";

import { motion } from "framer-motion";
import { PenTool, Wallet, Share2, ShieldCheck } from "lucide-react";

const steps = [
  {
    icon: PenTool,
    title: "L'école signe",
    description:
      "L'établissement émet un diplôme numérique et le signe avec sa clé cryptographique privée. Le processus est automatique.",
    accent: "from-cta to-cta-hover",
  },
  {
    icon: Wallet,
    title: "L'élève reçoit",
    description:
      "Le diplômé reçoit son diplôme dans son wallet numérique personnel. Accessible depuis n'importe quel appareil.",
    accent: "from-cta-hover to-accent",
  },
  {
    icon: Share2,
    title: "L'élève partage",
    description:
      "Le candidat génère un lien de vérification unique qu'il peut intégrer dans son CV, LinkedIn ou envoyer par email.",
    accent: "from-accent to-cyan-400",
  },
  {
    icon: ShieldCheck,
    title: "Le recruteur vérifie",
    description:
      "Un clic suffit. Le recruteur obtient un résultat instantané — sans créer de compte et sans accéder au document.",
    accent: "from-cyan-400 to-success",
  },
];

export default function HowItWorksSection() {
  return (
    <section id="fonctionnement" className="py-24 lg:py-32 bg-surface relative noise-overlay">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="text-center mb-20"
        >
          <span className="inline-block text-sm font-semibold text-cta uppercase tracking-wider mb-3">
            Comment ça marche
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-primary tracking-tight mb-4">
            4 étapes. <span className="gradient-text">Zéro complexité.</span>
          </h2>
          <p className="text-lg text-text-muted max-w-2xl mx-auto leading-relaxed">
            De l&apos;émission à la vérification, tout est automatisé et sécurisé par 
            cryptographie Zero-Knowledge.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6">
          {/* Connector line (desktop) */}
          <div className="hidden lg:block absolute top-16 left-[12.5%] right-[12.5%] h-0.5 bg-gradient-to-r from-cta via-accent to-success opacity-20" aria-hidden="true" />

          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.12, duration: 0.5, ease: "easeOut" }}
              className="relative flex flex-col items-center text-center"
            >
              {/* Step number + icon */}
              <div className="relative mb-6">
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${step.accent} flex items-center justify-center shadow-soft`}>
                  <step.icon className="w-7 h-7 text-white" strokeWidth={2} />
                </div>
                {/* Step number */}
                <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white border-2 border-border flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">{i + 1}</span>
                </div>
              </div>

              <h3 className="text-lg font-bold text-primary mb-2">{step.title}</h3>
              <p className="text-sm text-text-muted leading-relaxed max-w-xs">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
