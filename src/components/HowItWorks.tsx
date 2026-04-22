"use client";

import { useRef } from "react";
import { Building2, UserCircle, Briefcase, ArrowRight } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export default function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    // Header Parallax
    gsap.fromTo(".hiw-header", 
      { y: 50, opacity: 0 },
      { y: 0, opacity: 1, duration: 1, scrollTrigger: {
        trigger: sectionRef.current,
        start: "top 80%",
      }}
    );

    // Timeline for the flow
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: ".flow-container",
        start: "top 70%",
        end: "center center",
        scrub: 1, // Tie the animation completely to the scroll position
      }
    });

    // 1. Draw the line
    tl.to(".flow-line", { strokeDashoffset: 0, duration: 2, ease: "none" }, 0);

    // 2. Animate step 1 when line starts
    tl.fromTo(".step-1 .icon-wrapper", 
      { scale: 0.8, backgroundColor: "#eff6ff" },
      { scale: 1.1, backgroundColor: "#dbeafe", duration: 0.3, ease: "back.out(2)" },
      0.1
    ).fromTo(".step-1 .content-box", 
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.4 },
      0.2
    );

    // 3. Animate step 2 when line reaches middle
    tl.fromTo(".step-2 .icon-wrapper", 
      { scale: 0.8, backgroundColor: "#eef2ff" },
      { scale: 1.1, backgroundColor: "#e0e7ff", duration: 0.3, ease: "back.out(2)" },
      1.0
    ).fromTo(".step-2 .content-box", 
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.4 },
      1.1
    );

    // 4. Animate step 3 when line finishes
    tl.fromTo(".step-3 .icon-wrapper", 
      { scale: 0.8, backgroundColor: "#ecfdf5" },
      { scale: 1.1, backgroundColor: "#d1fae5", duration: 0.3, ease: "back.out(2)" },
      1.9
    ).fromTo(".step-3 .content-box", 
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.4 },
      2.0
    );

  }, { scope: sectionRef });

  return (
    <section id="fonctionnement" className="py-32 bg-white relative overflow-hidden" ref={sectionRef}>
      <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50/50 via-transparent to-transparent -z-10" />

      <div className="container mx-auto px-6">
        <div className="hiw-header text-center max-w-2xl mx-auto mb-24">
          <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 mb-6">
            Une confiance distribuée entre 3 acteurs
          </h2>
          <p className="text-lg text-slate-600 font-medium">
            Le processus est asynchrone : l'école n'a pas besoin d'être disponible lors de la vérification, et la preuve cryptographique se suffit à elle-même.
          </p>
        </div>

        <div className="flow-container relative max-w-6xl mx-auto">
          {/* Connecting line (Desktop only) */}
          <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-1 z-0">
            <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
              <line 
                x1="0" y1="50%" x2="100%" y2="50%" 
                className="flow-line" 
                stroke="#2563eb" 
                strokeWidth="4" 
                strokeLinecap="round"
                strokeDasharray="1000" 
                strokeDashoffset="1000" 
              />
            </svg>
          </div>

          <div className="grid md:grid-cols-3 gap-16 md:gap-8">
            {/* Step 1 */}
            <div className="step-1 relative flex flex-col items-center text-center z-10">
              <div className="icon-wrapper w-24 h-24 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-8 border-4 border-white shadow-xl shadow-blue-900/10 rotate-3 transition-transform">
                <Building2 className="h-10 w-10 -rotate-3" />
              </div>
              <div className="content-box bg-white p-8 rounded-3xl w-full border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <div className="text-xs font-black text-blue-600 mb-3 uppercase tracking-widest bg-blue-50 py-1 px-3 rounded-full inline-block">1. Émetteur</div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">L'École signe</h3>
                <p className="text-slate-600 text-sm font-medium leading-relaxed">
                  L'école génère le diplôme et le signe avec sa clé privée certifiée. Le document devient mathématiquement infalsifiable.
                </p>
              </div>
              <ArrowRight className="md:hidden mt-8 text-slate-300 h-8 w-8" />
            </div>

            {/* Step 2 */}
            <div className="step-2 relative flex flex-col items-center text-center z-10">
              <div className="icon-wrapper w-24 h-24 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-8 border-4 border-white shadow-xl shadow-indigo-900/10 -rotate-3 transition-transform">
                <UserCircle className="h-10 w-10 rotate-3" />
              </div>
              <div className="content-box bg-white p-8 rounded-3xl w-full border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <div className="text-xs font-black text-indigo-600 mb-3 uppercase tracking-widest bg-indigo-50 py-1 px-3 rounded-full inline-block">2. Candidat</div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">L'Élève partage</h3>
                <p className="text-slate-600 text-sm font-medium leading-relaxed">
                  L'étudiant reçoit son diplôme dans son wallet numérique sécurisé et génère un lien de vérification public à durée variable.
                </p>
              </div>
              <ArrowRight className="md:hidden mt-8 text-slate-300 h-8 w-8" />
            </div>

            {/* Step 3 */}
            <div className="step-3 relative flex flex-col items-center text-center z-10">
              <div className="icon-wrapper w-24 h-24 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-8 border-4 border-white shadow-xl shadow-emerald-900/10 rotate-3 transition-transform">
                <Briefcase className="h-10 w-10 -rotate-3" />
              </div>
              <div className="content-box bg-white p-8 rounded-3xl w-full border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <div className="text-xs font-black text-emerald-600 mb-3 uppercase tracking-widest bg-emerald-50 py-1 px-3 rounded-full inline-block">3. Vérificateur</div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Le Recruteur valide</h3>
                <p className="text-slate-600 text-sm font-medium leading-relaxed">
                  Un simple clic sur le lien valide l'intégrité du diplôme et l'identité de l'école (via le Nonce et le ZKP) en 2 secondes, sans compte.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
