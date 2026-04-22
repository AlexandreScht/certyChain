"use client";

import { useRef } from "react";
import { Clock, AlertTriangle, Shield, Zap, FileSearch, ShieldCheck } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export default function ProblemSolution() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    // Header parallax
    gsap.fromTo(".ps-header", 
      { y: 0, opacity: 1 },
      { y: 50, opacity: 0.3, scrollTrigger: {
        trigger: sectionRef.current,
        start: "top top",
        end: "bottom center",
        scrub: true,
      }}
    );

    // Timeline for the cards side by side
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: ".comparison-container",
        start: "top 75%",
      }
    });

    tl.fromTo(".problem-card",
      { x: -100, opacity: 0, rotationY: 10 },
      { x: 0, opacity: 1, rotationY: 0, duration: 1, ease: "power3.out" }
    ).fromTo(".solution-card",
      { x: 100, opacity: 0, rotationY: -10 },
      { x: 0, opacity: 1, rotationY: 0, duration: 1, ease: "power3.out" },
      "-=0.7"
    );

    // Parallax on the solution card while scrolling through the section
    gsap.to(".solution-card", {
      y: -80,
      scrollTrigger: {
        trigger: ".comparison-container",
        start: "top center",
        end: "bottom top",
        scrub: 1.5,
      }
    });

    gsap.to(".problem-card", {
      y: -40,
      scrollTrigger: {
        trigger: ".comparison-container",
        start: "top center",
        end: "bottom top",
        scrub: 1,
      }
    });

  }, { scope: sectionRef });

  return (
    <section id="solution" className="py-32 bg-slate-900 relative overflow-hidden" ref={sectionRef}>
      {/* Background decorations */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-900/20 rounded-full blur-[150px] -translate-y-1/2 translate-x-1/3" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-red-900/10 rounded-full blur-[120px] translate-y-1/3 -translate-x-1/3" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="ps-header text-center max-w-3xl mx-auto mb-24">
          <span className="text-blue-400 font-bold tracking-widest uppercase text-sm mb-4 block">L'Ancien Monde vs Le Nouveau</span>
          <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6 leading-tight">
            Le système actuel est <span className="text-red-400">lent</span> et <span className="text-red-400">vulnérable</span>
          </h2>
          <p className="text-lg text-slate-400 font-medium">
            Aujourd'hui, 30% des CV comportent des inexactitudes. Les recruteurs perdent des semaines à contacter les secrétariats, et les écoles perdent un temps précieux à répondre aux requêtes.
          </p>
        </div>

        <div className="comparison-container grid md:grid-cols-2 gap-12 max-w-5xl mx-auto perspective-1000">
          {/* The Problem */}
          <div className="problem-card bg-slate-800 rounded-3xl p-10 border border-slate-700 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-400" />
            <div className="flex items-center gap-4 mb-10">
              <div className="w-14 h-14 rounded-2xl bg-slate-900/50 flex items-center justify-center text-red-400 border border-red-500/20 shadow-inner">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-bold text-white">Sans CertifyChain</h3>
            </div>
            
            <ul className="space-y-8">
              <li className="flex gap-5">
                <div className="mt-1 bg-slate-900/50 p-2 rounded-xl text-red-400 shrink-0 border border-slate-700">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-lg">Vérification Lente</h4>
                  <p className="text-slate-400 text-sm mt-2 leading-relaxed">Le recruteur doit appeler l'école, envoyer des emails, et attendre parfois plusieurs semaines.</p>
                </div>
              </li>
              <li className="flex gap-5">
                <div className="mt-1 bg-slate-900/50 p-2 rounded-xl text-red-400 shrink-0 border border-slate-700">
                  <FileSearch className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-lg">Fraude Facile</h4>
                  <p className="text-slate-400 text-sm mt-2 leading-relaxed">Les PDF sont aisément modifiables. Les « faux vrais diplômes » se multiplient sur le marché.</p>
                </div>
              </li>
              <li className="flex gap-5">
                <div className="mt-1 bg-slate-900/50 p-2 rounded-xl text-red-400 shrink-0 border border-slate-700">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-lg">Aucune Confidentialité</h4>
                  <p className="text-slate-400 text-sm mt-2 leading-relaxed">Envoi de documents contenant des données personnelles sensibles par email non chiffré.</p>
                </div>
              </li>
            </ul>
          </div>

          {/* The Solution */}
          <div className="solution-card bg-primary text-white rounded-3xl p-10 border border-blue-400 relative overflow-hidden shadow-[0_30px_60px_-15px_rgba(37,99,235,0.5)] z-20 md:mt-12">
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-white/20 rounded-full blur-3xl" />
            
            <div className="flex items-center gap-4 mb-10 relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-white backdrop-blur-md shadow-inner border border-white/30">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-extrabold tracking-tight">Avec CertifyChain</h3>
            </div>
            
            <ul className="space-y-8 relative z-10">
              <li className="flex gap-5">
                <div className="mt-1 bg-blue-500/50 p-2 rounded-xl text-white shrink-0 backdrop-blur-sm border border-blue-400/50">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-lg">Vérification Instantanée</h4>
                  <p className="text-blue-100 text-sm mt-2 leading-relaxed font-medium">Preuve mathématique calculée en moins de 2 secondes. Aucun compte requis pour le recruteur.</p>
                </div>
              </li>
              <li className="flex gap-5">
                <div className="mt-1 bg-blue-500/50 p-2 rounded-xl text-white shrink-0 backdrop-blur-sm border border-blue-400/50">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-lg">Infalsifiable (ZKP)</h4>
                  <p className="text-blue-100 text-sm mt-2 leading-relaxed font-medium">Cryptographie avancée. L'école est certifiée (KYB) et la signature ne peut être forgée.</p>
                </div>
              </li>
              <li className="flex gap-5">
                <div className="mt-1 bg-blue-500/50 p-2 rounded-xl text-white shrink-0 backdrop-blur-sm border border-blue-400/50">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-lg">Respect du Candidat</h4>
                  <p className="text-blue-100 text-sm mt-2 leading-relaxed font-medium">Le candidat contrôle qui voit son diplôme. Preuve à divulgation nulle (aucune fuite de données).</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
