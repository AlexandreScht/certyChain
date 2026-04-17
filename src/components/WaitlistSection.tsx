"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Gift } from "lucide-react";

export default function WaitlistSection() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubmitted(true);
      setEmail("");
      setName("");
      setSchool("");
    }
  };

  return (
    <section
      id="waitlist"
      className="py-24 lg:py-32 relative overflow-hidden"
    >
      {/* Dark gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary-light to-secondary" />
      <div className="absolute inset-0">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-cta/10 rounded-full blur-[120px] -translate-y-1/4 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent/10 rounded-full blur-[100px] translate-y-1/4 -translate-x-1/4" />
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/10 mb-8">
            <Gift className="w-4 h-4 text-accent-warm" />
            <span className="text-sm font-semibold text-white/90">
              3 mois gratuits pour les premiers inscrits
            </span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight mb-4">
            Prêt à sécuriser vos diplômes ?
          </h2>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed mb-12">
            Rejoignez la liste d&apos;attente et soyez parmi les premiers établissements 
            à émettre des diplômes numériques infalsifiables.
          </p>

          {/* Form */}
          {!submitted ? (
            <motion.form
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2, duration: 0.5 }}
              onSubmit={handleSubmit}
              className="max-w-xl mx-auto space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="waitlist-name" className="sr-only">
                    Votre nom
                  </label>
                  <input
                    id="waitlist-name"
                    type="text"
                    placeholder="Votre nom"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-5 py-3.5 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cta/40 focus:border-cta/50 transition-all duration-200 text-sm backdrop-blur-sm"
                  />
                </div>
                <div>
                  <label htmlFor="waitlist-school" className="sr-only">
                    Nom de l&apos;établissement
                  </label>
                  <input
                    id="waitlist-school"
                    type="text"
                    placeholder="Nom de l'établissement"
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                    className="w-full px-5 py-3.5 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cta/40 focus:border-cta/50 transition-all duration-200 text-sm backdrop-blur-sm"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <label htmlFor="waitlist-email" className="sr-only">
                  Email professionnel
                </label>
                <input
                  id="waitlist-email"
                  type="email"
                  required
                  placeholder="votre@ecole.fr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 px-5 py-3.5 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cta/40 focus:border-cta/50 transition-all duration-200 text-sm backdrop-blur-sm"
                />
                <button
                  type="submit"
                  className="flex items-center justify-center gap-2 px-8 py-3.5 bg-cta hover:bg-cta-hover text-white font-semibold rounded-xl transition-all duration-200 shadow-soft glow-cta cursor-pointer group whitespace-nowrap hover:-translate-y-0.5"
                >
                  Rejoindre
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
                </button>
              </div>
              <p className="text-xs text-slate-400 pt-2">
                En vous inscrivant, vous acceptez d&apos;être contacté(e) lors du lancement. 
                Aucun spam, promis.
              </p>
            </motion.form>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="max-w-md mx-auto text-center"
            >
              <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-success" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Vous êtes sur la liste !</h3>
              <p className="text-slate-300">
                Nous vous contacterons dès que CertifyChain sera disponible. 
                Merci de votre confiance.
              </p>
            </motion.div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
