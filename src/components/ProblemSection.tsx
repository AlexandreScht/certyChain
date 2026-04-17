"use client";

import { motion, Variants } from "framer-motion";
import { AlertTriangle, TrendingUp, FileWarning, Globe } from "lucide-react";

const stats = [
  {
    icon: AlertTriangle,
    value: "68%",
    label: "des recruteurs ont déjà reçu un faux CV",
    color: "text-error",
    bg: "bg-red-50",
  },
  {
    icon: TrendingUp,
    value: "+30%",
    label: "d'augmentation de la fraude aux diplômes en 5 ans",
    color: "text-accent-warm",
    bg: "bg-amber-50",
  },
  {
    icon: FileWarning,
    value: "40%",
    label: "des diplômes non vérifiés par les entreprises",
    color: "text-cta",
    bg: "bg-sky-50",
  },
  {
    icon: Globe,
    value: "0",
    label: "standard mondial de vérification instantanée",
    color: "text-accent",
    bg: "bg-cyan-50",
  },
];

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" },
  }),
};

export default function ProblemSection() {
  return (
    <section id="probleme" className="py-24 lg:py-32 bg-white relative">
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
            Le problème
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-primary tracking-tight mb-4">
            La confiance dans les diplômes est{" "}
            <span className="gradient-text">brisée.</span>
          </h2>
          <p className="text-lg text-text-muted max-w-2xl mx-auto leading-relaxed">
            Chaque année, des milliers de faux diplômes circulent. Les recruteurs n&apos;ont aucun 
            moyen fiable de vérifier l&apos;authenticité d&apos;une certification, et les écoles 
            n&apos;ont aucun contrôle après la remise du diplôme.
          </p>
        </motion.div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              variants={fadeInUp}
              className="relative bg-surface rounded-2xl p-6 border border-border card-hover cursor-default"
            >
              <div className={`w-12 h-12 rounded-xl ${stat.bg} flex items-center justify-center mb-4`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <p className={`text-4xl font-extrabold ${stat.color} mb-2`}>{stat.value}</p>
              <p className="text-sm text-text-muted leading-snug">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
