"use client";

import { motion, Variants } from "framer-motion";
import {
  ShieldCheck,
  Zap,
  Lock,
  FileSpreadsheet,
  QrCode,
  BarChart3,
  KeyRound,
  Globe,
  Smartphone,
} from "lucide-react";

const features = [
  {
    icon: ShieldCheck,
    title: "Preuve Zero-Knowledge",
    description:
      "Vérification du diplôme sans révéler les données personnelles du candidat. La preuve NIZK garantit l'authenticité sans exposition.",
    span: "md:col-span-2",
    accent: "from-cta to-accent",
  },
  {
    icon: Zap,
    title: "Vérification < 10s",
    description:
      "Le recruteur clique, le résultat s'affiche. Aucun compte à créer, aucune installation requise.",
    span: "",
    accent: "from-accent-warm to-orange-400",
  },
  {
    icon: Lock,
    title: "Anti-fraude absolu",
    description:
      "Chaque diplôme est signé avec une clé cryptographique Ed25519 unique par établissement.",
    span: "",
    accent: "from-error to-rose-400",
  },
  {
    icon: FileSpreadsheet,
    title: "Import CSV en masse",
    description:
      "Importez des promotions entières via fichier CSV. Émission de centaines de diplômes en un clic.",
    span: "",
    accent: "from-cta-hover to-cta",
  },
  {
    icon: QrCode,
    title: "QR Code & liens",
    description:
      "Chaque diplôme dispose d'un lien unique et d'un QR code intégrable dans un CV ou profil LinkedIn.",
    span: "",
    accent: "from-violet-500 to-purple-500",
  },
  {
    icon: BarChart3,
    title: "Tableau de bord",
    description:
      "Suivez en temps réel le nombre de diplômes émis, de vérifications effectuées et de révocations.",
    span: "md:col-span-2",
    accent: "from-accent to-teal-400",
  },
  {
    icon: KeyRound,
    title: "Révocation instantanée",
    description:
      "Annulez un diplôme émis par erreur. Le lien de vérification renvoie automatiquement « introuvable ».",
    span: "",
    accent: "from-amber-500 to-accent-warm",
  },
  {
    icon: Globe,
    title: "Conforme RGPD",
    description:
      "Aucune donnée personnelle transmise sans consentement. Chiffrement TLS 1.3 et clés stockées en HSM.",
    span: "",
    accent: "from-success to-emerald-400",
  },
  {
    icon: Smartphone,
    title: "100% web, 0 installation",
    description:
      "Fonctionne sur Chrome, Firefox, Safari — mobile et desktop. Wallet accessible par OTP, sans mot de passe.",
    span: "",
    accent: "from-sky-400 to-cta",
  },
];

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.45, ease: "easeOut" },
  },
};

export default function FeaturesGrid() {
  return (
    <section id="fonctionnalites" className="py-24 lg:py-32 bg-white relative">
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
            Fonctionnalités
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-primary tracking-tight mb-4">
            Tout ce dont votre établissement{" "}
            <span className="gradient-text">a besoin.</span>
          </h2>
          <p className="text-lg text-text-muted max-w-2xl mx-auto leading-relaxed">
            Une plateforme complète pour émettre, gérer et vérifier des diplômes 
            numériques en toute confiance.
          </p>
        </motion.div>

        {/* Bento Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          className="grid grid-cols-1 md:grid-cols-3 gap-5"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={cardVariants}
              className={`relative rounded-2xl bg-surface border border-border p-7 card-hover cursor-default overflow-hidden group ${feature.span}`}
            >
              {/* Gradient accent on hover */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${feature.accent} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-300`}
                aria-hidden="true"
              />

              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${feature.accent} flex items-center justify-center mb-4 shadow-soft-sm`}>
                <feature.icon className="w-5 h-5 text-white" strokeWidth={2} />
              </div>

              <h3 className="text-base font-bold text-primary mb-2">{feature.title}</h3>
              <p className="text-sm text-text-muted leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
