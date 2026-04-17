"use client";

import { motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";

const tiers = [
  {
    name: "Starter",
    price: "49",
    description: "Pour les petites écoles et CFA",
    features: [
      "500 diplômes / an",
      "1 administrateur",
      "Signature cryptographique",
      "Page de vérification publique",
      "Support par email",
    ],
    cta: "Rejoindre la waitlist",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "149",
    description: "Pour les écoles de taille moyenne",
    features: [
      "Diplômes illimités",
      "5 administrateurs",
      "Import CSV en masse",
      "QR codes",
      "Statistiques avancées",
      "Support prioritaire",
    ],
    cta: "Rejoindre la waitlist",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "399",
    suffix: "+",
    description: "Pour les universités et réseaux",
    features: [
      "Tout du plan Pro",
      "API publique",
      "SSO (SAML, OIDC)",
      "SLA 99,9%",
      "Accompagnement dédié",
      "Intégration LinkedIn",
    ],
    cta: "Nous contacter",
    highlighted: false,
  },
];

export default function PricingSection() {
  return (
    <section id="tarifs" className="py-24 lg:py-32 bg-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="inline-block text-sm font-semibold text-cta uppercase tracking-wider mb-3">
            Tarifs
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-primary tracking-tight mb-4">
            Un prix adapté à{" "}
            <span className="gradient-text">chaque établissement.</span>
          </h2>
          <p className="text-lg text-text-muted max-w-2xl mx-auto leading-relaxed">
            Rentable dès 2 écoles Starter. Pas de frais cachés. Les beta-testeurs 
            bénéficient de 3 mois gratuits.
          </p>
        </motion.div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {tiers.map((tier, i) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.1, duration: 0.5, ease: "easeOut" }}
              className={`relative rounded-2xl p-7 border flex flex-col ${
                tier.highlighted
                  ? "bg-primary border-primary-light shadow-soft-xl ring-2 ring-cta/20"
                  : "bg-white border-border shadow-soft-sm card-hover"
              }`}
            >
              {/* Popular badge */}
              {tier.highlighted && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <div className="flex items-center gap-1.5 px-4 py-1.5 bg-cta text-white text-xs font-bold rounded-full shadow-soft">
                    <Sparkles className="w-3.5 h-3.5" />
                    Le plus populaire
                  </div>
                </div>
              )}

              <div className="mb-6">
                <h3
                  className={`text-lg font-bold mb-1 ${
                    tier.highlighted ? "text-white" : "text-primary"
                  }`}
                >
                  {tier.name}
                </h3>
                <p
                  className={`text-sm ${
                    tier.highlighted ? "text-slate-400" : "text-text-muted"
                  }`}
                >
                  {tier.description}
                </p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span
                    className={`text-4xl font-extrabold ${
                      tier.highlighted ? "text-white" : "text-primary"
                    }`}
                  >
                    {tier.price}€
                  </span>
                  {tier.suffix && (
                    <span
                      className={`text-xl font-bold ${
                        tier.highlighted ? "text-slate-400" : "text-text-subtle"
                      }`}
                    >
                      {tier.suffix}
                    </span>
                  )}
                  <span
                    className={`text-sm ${
                      tier.highlighted ? "text-slate-400" : "text-text-subtle"
                    }`}
                  >
                    / mois
                  </span>
                </div>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className={`flex items-start gap-2.5 text-sm ${
                      tier.highlighted ? "text-slate-300" : "text-text-muted"
                    }`}
                  >
                    <Check
                      className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                        tier.highlighted ? "text-cta" : "text-success"
                      }`}
                      strokeWidth={2.5}
                    />
                    {feature}
                  </li>
                ))}
              </ul>

              <a
                href="#waitlist"
                className={`block text-center px-5 py-3 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer ${
                  tier.highlighted
                    ? "bg-cta hover:bg-cta-hover text-white shadow-soft glow-cta"
                    : "bg-surface hover:bg-border-light text-primary border border-border"
                }`}
              >
                {tier.cta}
              </a>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
