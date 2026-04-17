"use client";

import { motion } from "framer-motion";
import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    quote:
      "CertifyChain a transformé notre processus de remise de diplômes. Nos recruteurs partenaires vérifient l'authenticité en un clic — la confiance est immédiate.",
    name: "Dr. Sophie Martin",
    role: "Directrice académique",
    school: "École Supérieure du Digital",
    initials: "SM",
  },
  {
    quote:
      "L'import CSV nous a permis de numériser 3 ans d'archives en une après-midi. L'interface est intuitive et le support réactif. Un vrai game-changer pour notre CFA.",
    name: "Pierre Lemoine",
    role: "Responsable administratif",
    school: "CFA des Métiers du Numérique",
    initials: "PL",
  },
  {
    quote:
      "Le respect du RGPD était notre priorité. Avec la preuve Zero-Knowledge, nos étudiants contrôlent exactement quelles informations sont partagées. C'est révolutionnaire.",
    name: "Amina Benali",
    role: "Vice-Présidente Innovation",
    school: "Université Paris-Saclay",
    initials: "AB",
  },
];

export default function TestimonialsSection() {
  return (
    <section className="py-24 lg:py-32 bg-surface relative noise-overlay">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="inline-block text-sm font-semibold text-cta uppercase tracking-wider mb-3">
            Témoignages
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-primary tracking-tight mb-4">
            Ils nous font{" "}
            <span className="gradient-text">confiance.</span>
          </h2>
          <p className="text-lg text-text-muted max-w-2xl mx-auto leading-relaxed">
            Des établissements pionniers qui ont déjà adopté CertifyChain pour sécuriser 
            leurs certifications.
          </p>
        </motion.div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.1, duration: 0.5, ease: "easeOut" }}
              className="relative bg-white rounded-2xl p-7 border border-border shadow-soft-sm card-hover cursor-default"
            >
              {/* Quote icon */}
              <Quote className="w-8 h-8 text-cta/15 mb-4" strokeWidth={2} />

              {/* Stars */}
              <div className="flex gap-0.5 mb-4" aria-label="5 étoiles sur 5">
                {[...Array(5)].map((_, j) => (
                  <Star
                    key={j}
                    className="w-4 h-4 text-accent-warm fill-accent-warm"
                  />
                ))}
              </div>

              {/* Quote */}
              <p className="text-sm text-text-muted leading-relaxed mb-6">
                &ldquo;{t.quote}&rdquo;
              </p>

              {/* Author */}
              <div className="flex items-center gap-3 pt-4 border-t border-border-light">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cta to-accent flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-primary">{t.name}</p>
                  <p className="text-xs text-text-subtle">
                    {t.role} — {t.school}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Trust bar */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="mt-16 flex flex-col items-center"
        >
          <p className="text-sm font-semibold text-text-subtle uppercase tracking-wider mb-6">
            Reconnu par les acteurs de l&apos;éducation
          </p>
          <div className="flex flex-wrap justify-center gap-x-12 gap-y-4 items-center opacity-40">
            <span className="text-lg font-bold text-primary tracking-tight">EdTech France</span>
            <span className="text-lg font-bold text-primary tracking-tight">CNIL</span>
            <span className="text-lg font-bold text-primary tracking-tight">France Compétences</span>
            <span className="text-lg font-bold text-primary tracking-tight">Campus France</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
