"use client";

import { useRef } from "react";
import { CheckCircle, ShieldCheck, Database, FileText, Ban, Sparkles } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const features = [
  {
    title: "KYB : Sceau de Confiance",
    description: "Votre établissement est audité (SIRET, accréditations). Votre clé cryptographique est certifiée publiquement.",
    icon: <ShieldCheck className="h-6 w-6" />,
    color: "bg-blue-100 text-blue-600",
  },
  {
    title: "Émission Simplifiée",
    description: "Importez vos promotions via CSV. Signature cryptographique en 1 clic pour des milliers de diplômes.",
    icon: <FileText className="h-6 w-6" />,
    color: "bg-indigo-100 text-indigo-600",
  },
  {
    title: "Extraction Intelligente (IA)",
    description: "Uploadez vos anciens relevés (PDF, Excel). Notre IA extrait et formatte les données automatiquement.",
    icon: <Sparkles className="h-6 w-6" />,
    color: "bg-purple-100 text-purple-600",
  },
  {
    title: "Révocation Immédiate",
    description: "Une erreur ou une fraude détectée ? Révoquez un diplôme en 1 seconde. Il devient instantanément invalide.",
    icon: <Ban className="h-6 w-6" />,
    color: "bg-red-100 text-red-600",
  },
  {
    title: "Tableau de Bord Analytique",
    description: "Suivez en temps réel les vérifications de vos diplômes par les recruteurs et les statistiques par filière.",
    icon: <Database className="h-6 w-6" />,
    color: "bg-emerald-100 text-emerald-600",
  },
  {
    title: "Conformité Totale",
    description: "Pas de base de données centralisée vulnérable. Respect 100% RGPD, les données appartiennent aux candidats.",
    icon: <CheckCircle className="h-6 w-6" />,
    color: "bg-slate-100 text-slate-600",
  }
];

export default function Features() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    // Parallax on header
    gsap.to(".features-header", {
      y: -50,
      opacity: 0.8,
      scrollTrigger: {
        trigger: sectionRef.current,
        start: "top bottom",
        end: "center center",
        scrub: true,
      }
    });

    const featureCards = gsap.utils.toArray(".feature-card");
    
    // Complex stagger entrance
    gsap.fromTo(featureCards, 
      { 
        y: 100, 
        opacity: 0,
        rotationY: -15,
        transformPerspective: 1000
      },
      {
        y: 0,
        opacity: 1,
        rotationY: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".features-grid",
          start: "top 80%",
        }
      }
    );

    // Hover effect managed by GSAP for smoothness
    featureCards.forEach((card: any) => {
      card.addEventListener("mouseenter", () => {
        gsap.to(card, { y: -10, scale: 1.02, duration: 0.3, ease: "power2.out", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.1)" });
        gsap.to(card.querySelector(".icon-container"), { scale: 1.1, rotation: 5, duration: 0.3 });
      });
      card.addEventListener("mouseleave", () => {
        gsap.to(card, { y: 0, scale: 1, duration: 0.3, ease: "power2.out", boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)" });
        gsap.to(card.querySelector(".icon-container"), { scale: 1, rotation: 0, duration: 0.3 });
      });
    });

  }, { scope: sectionRef });

  return (
    <section id="ecoles" className="py-24 bg-slate-50 relative overflow-hidden" ref={sectionRef}>
      {/* Decorative background circle */}
      <div className="absolute top-0 right-0 -mr-40 -mt-40 w-96 h-96 rounded-full bg-blue-100/50 blur-[80px]" />
      
      <div className="container mx-auto px-6 relative z-10">
        <div className="features-header text-center max-w-2xl mx-auto mb-20">
          <span className="text-primary font-bold tracking-widest uppercase text-sm mb-4 block">Conçu pour les Écoles</span>
          <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 mb-6 leading-tight">
            Gérez vos certifications avec une facilité déconcertante
          </h2>
          <p className="text-lg text-slate-600 font-medium">
            Une interface d'administration puissante qui masque la complexité de la cryptographie derrière des actions simples et intuitives.
          </p>
        </div>

        <div className="features-grid grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, idx) => (
            <div key={idx} className="feature-card bg-white rounded-3xl p-8 border border-slate-200 shadow-sm transition-colors duration-300">
              <div className={`icon-container w-14 h-14 rounded-2xl ${feature.color} flex items-center justify-center mb-6`}>
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
              <p className="text-slate-600 leading-relaxed font-medium">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
