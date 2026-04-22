"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight, CheckCircle2, GraduationCap, LockKeyhole, ShieldCheck } from "lucide-react";
import { useRef } from "react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export default function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);


  

  useGSAP(() => {
    // 1. Entrance Animation Timeline
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    // Text elements stagger in
    tl.fromTo(
      ".hero-badge",
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6 }
    )
    .fromTo(
      ".hero-title-line",
      { opacity: 0, y: 40, rotationX: -20 },
      { opacity: 1, y: 0, rotationX: 0, duration: 0.8, stagger: 0.15 },
      "-=0.4"
    )
    .fromTo(
      ".hero-desc",
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6 },
      "-=0.5"
    )
    .fromTo(
      ".hero-buttons button",
      { opacity: 0, scale: 0.9 },
      { opacity: 1, scale: 1, duration: 0.5, stagger: 0.1 },
      "-=0.4"
    )
    .fromTo(
      ".hero-social",
      { opacity: 0 },
      { opacity: 1, duration: 0.5 },
      "-=0.2"
    );

    // Visual elements entrance
    tl.fromTo(
      ".main-card",
      { opacity: 0, scale: 0.8, y: 50 },
      { opacity: 1, scale: 1, y: 0, duration: 1, ease: "elastic.out(1, 0.7)" },
      "-=1.5"
    )
    .fromTo(
      ".floating-badge",
      { opacity: 0, scale: 0, x: -50 },
      { opacity: 1, scale: 1, x: 0, duration: 0.6, stagger: 0.2, ease: "back.out(1.5)" },
      "-=1"
    );

    // 2. Infinite Loop Animations
    gsap.to(".orbit-node", {
      rotation: 360,
      duration: 25,
      ease: "linear",
      repeat: -1,
    });

    gsap.to(".pulse-ring", {
      scale: 1.5,
      opacity: 0,
      duration: 3,
      repeat: -1,
      ease: "power2.out",
    });

    // 3. ScrollTrigger Parallax Effects
    // Background gradients move slower
    gsap.to(".bg-shape-1", {
      yPercent: 30,
      scrollTrigger: {
        trigger: containerRef.current,
        start: "top top",
        end: "bottom top",
        scrub: 1,
      }
    });

    gsap.to(".bg-shape-2", {
      yPercent: -20,
      scrollTrigger: {
        trigger: containerRef.current,
        start: "top top",
        end: "bottom top",
        scrub: 1.5,
      }
    });

    // Text content fades and moves up
    gsap.to(textRef.current, {
      y: -100,
      opacity: 0,
      scrollTrigger: {
        trigger: containerRef.current,
        start: "top top",
        end: "bottom center",
        scrub: true,
      }
    });

    // Main visual elements have different parallax speeds
    gsap.to(".main-card", {
      y: -150,
      rotation: 5,
      scrollTrigger: {
        trigger: containerRef.current,
        start: "top top",
        end: "bottom top",
        scrub: 1.2,
      }
    });

    gsap.to(".badge-top", {
      y: -250,
      scrollTrigger: {
        trigger: containerRef.current,
        start: "top top",
        end: "bottom top",
        scrub: 0.8,
      }
    });

    gsap.to(".badge-bottom", {
      y: -50,
      scrollTrigger: {
        trigger: containerRef.current,
        start: "top top",
        end: "bottom top",
        scrub: 2,
      }
    });

  }, { scope: containerRef });

  return (
    <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden perspective-1000" ref={containerRef}>
      {/* Dynamic Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 bg-slate-50">
        <div className="bg-shape-1 absolute top-0 -right-40 w-[800px] h-[800px] rounded-full bg-blue-200/40 blur-[120px] mix-blend-multiply" />
        <div className="bg-shape-2 absolute top-40 -left-40 w-[600px] h-[600px] rounded-full bg-indigo-200/40 blur-[120px] mix-blend-multiply" />
        
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      </div>

      <div className="container mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center min-h-[70vh]">
        
        {/* Left: Text Content */}
        <div className="flex flex-col gap-8 z-10" ref={textRef}>
          <div className="hero-badge inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100/50 border border-blue-200 text-blue-800 w-fit backdrop-blur-sm shadow-sm">
            <LockKeyhole className="h-4 w-4" />
            <span className="text-sm font-semibold uppercase tracking-wider">Zero-Knowledge Proof</span>
          </div>
          
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-900 leading-[1.1]">
            <div style={{ perspective: "1000px" }}>
              <div className="hero-title-line origin-bottom">Éradiquez la fraude.</div>
            </div>
            <div style={{ perspective: "1000px" }}>
              <div className="hero-title-line origin-bottom">Sécurisez vos diplômes.</div>
            </div>
            <div style={{ perspective: "1000px" }}>
              <div className="hero-title-line origin-bottom text-gradient pb-2">Instantanément.</div>
            </div>
          </h1>
          
          <p className="hero-desc text-lg md:text-xl text-slate-600 leading-relaxed max-w-xl font-medium">
            La première plateforme SaaS B2B permettant aux écoles d'émettre des diplômes infalsifiables, vérifiables en un clic par n'importe quel recruteur au monde.
          </p>

          <div className="hero-buttons flex flex-col sm:flex-row gap-4 mt-4">
            <button className="bg-primary hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all shadow-xl shadow-primary/30 flex items-center justify-center gap-2 group border border-blue-600">
              Démarrez l'intégration
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button className="glass hover:bg-white/80 text-slate-800 px-8 py-4 rounded-xl font-semibold text-lg transition-all flex items-center justify-center border-slate-200 shadow-sm">
              Découvrir la plateforme
            </button>
          </div>

          <div className="hero-social flex items-center gap-6 mt-8 pt-8 border-t border-slate-200/60">
            <div className="flex -space-x-3">
              {[1,2,3,4].map((i) => (
                <div key={i} className="w-10 h-10 rounded-full border-2 border-white shadow-sm overflow-hidden">
                  <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="avatar" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
            <div className="flex flex-col">
              <div className="flex gap-1 text-yellow-400 text-sm">
                {[1,2,3,4,5].map((i) => <span key={i}>★</span>)}
              </div>
              <span className="text-sm font-semibold text-slate-700">Rejoint par +50 Écoles d'Excellence</span>
            </div>
          </div>
        </div>

        {/* Right: Visual Hero Content */}
        <div className="relative h-[600px] w-full hidden lg:flex items-center justify-center z-10" ref={visualRef}>
          
          {/* Abstract background orbit */}
          <div className="absolute inset-0 flex items-center justify-center opacity-40">
            <div className="orbit-node w-[500px] h-[500px] rounded-full border border-slate-300/50 border-dashed relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-blue-400 blur-[2px]" />
              <div className="absolute top-1/2 -right-3 -translate-y-1/2 w-6 h-6 rounded-full bg-indigo-400 blur-[2px]" />
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-primary blur-[2px]" />
            </div>
          </div>

          {/* Glowing pulse rings behind main card */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-2 border-primary/20 rounded-full pulse-ring" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-2 border-indigo-400/20 rounded-full pulse-ring" style={{ animationDelay: "1.5s" }} />

          {/* Main Glassmorphism Card */}
          <div className="main-card glass p-8 rounded-3xl w-96 relative shadow-[0_20px_50px_-12px_rgba(37,99,235,0.2)] border-white/50 z-20">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary via-indigo-500 to-purple-500" />
            
            <div className="flex justify-between items-start mb-8">
              <div>
                <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-1">Certificat Inviolable</p>
                <h3 className="font-extrabold text-slate-900 text-2xl">Master of Science</h3>
              </div>
              <div className="bg-green-100 p-2.5 rounded-full text-green-600 shadow-sm border border-green-200">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="flex items-center gap-4 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center border border-slate-200">
                  <GraduationCap className="h-6 w-6 text-slate-700" />
                </div>
                <div>
                  <p className="text-base font-bold text-slate-900">Alexandre Dupont</p>
                  <p className="text-sm font-medium text-slate-500">Promotion 2025</p>
                </div>
              </div>
              
              <div className="bg-slate-900 rounded-xl p-4 shadow-inner relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%,transparent_100%)] bg-[length:250px_250px] animate-[shimmer_3s_infinite_linear]" />
                <div className="flex justify-between text-sm text-slate-400 mb-2 font-mono">
                  <span>Cryptographic Proof</span>
                  <span className="text-emerald-400 font-bold">Valid</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mb-2">
                  <div className="bg-emerald-500 h-full w-full relative">
                    <div className="absolute top-0 left-0 w-full h-full bg-white/30 animate-pulse" />
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 font-mono mt-2 break-all">
                  0x9f8b4a2c...e3d7a1b9f0c2
                </p>
              </div>
            </div>
          </div>

          {/* Decorative floating badges with parallax */}
          <div className="floating-badge badge-top absolute top-[15%] right-0 z-30">
            <div className="glass px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 border-white/60">
              <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)] animate-pulse" />
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase">Statut Émetteur</p>
                <p className="text-sm font-bold text-slate-800">KYB Approuvé</p>
              </div>
            </div>
          </div>

          <div className="floating-badge badge-bottom absolute bottom-[20%] -left-10 z-30">
            <div className="glass px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 border-white/60">
              <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase">Vérification</p>
                <p className="text-sm font-bold text-slate-800">Moins de 2.4s</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
