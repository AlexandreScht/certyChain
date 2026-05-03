"use client";

import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ShieldCheck,
  Sparkles,
  KeyRound,
  Fingerprint,
  CheckCircle2,
} from "lucide-react";

export default function HeroSection() {
  const rootRef = useRef<HTMLElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const paraRef = useRef<HTMLDivElement>(null);
  const paraOverlayRef = useRef<HTMLParagraphElement>(null);

  // Cursor-follow glow + 3D tilt on the diploma card
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const root = rootRef.current;
    const glow = glowRef.current;
    const card = cardRef.current;
    if (!root) return;

    let rafId = 0;
    let tx = 0, ty = 0;
    const onMove = (e: MouseEvent) => {
      const r = root.getBoundingClientRect();
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;

      if (card) {
        const cx = r.width / 2;
        const cy = r.height / 2;
        const rx = ((ty - cy) / cy) * -6;
        const ry = ((tx - cx) / cx) * 8;
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          card.style.transform = `perspective(1100px) rotateX(${rx}deg) rotateY(${ry}deg) scale(var(--card-scale, 1))`;
        });
      }
      if (glow) {
        glow.style.transform = `translate(${tx}px, ${ty}px) translate(-50%, -50%)`;
      }
      if (paraRef.current && paraOverlayRef.current) {
        const pr = paraRef.current.getBoundingClientRect();
        paraOverlayRef.current.style.setProperty('--mx', `${e.clientX - pr.left}px`);
        paraOverlayRef.current.style.setProperty('--my', `${e.clientY - pr.top}px`);
      }
    };
    const onLeave = () => {
      if (card) card.style.transform = `perspective(1100px) rotateX(0deg) rotateY(0deg) scale(var(--card-scale, 1))`;
      if (paraOverlayRef.current) {
        paraOverlayRef.current.style.setProperty('--mx', '-500px');
        paraOverlayRef.current.style.setProperty('--my', '-500px');
      }
    };
    root.addEventListener("mousemove", onMove);
    root.addEventListener("mouseleave", onLeave);
    return () => {
      root.removeEventListener("mousemove", onMove);
      root.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <section
      ref={rootRef}
      id="top"
      className="relative min-h-svh lg:h-screen flex flex-col justify-center pt-32 pb-20 md:pb-28 lg:py-0 bg-mesh noise overflow-hidden"
    >
      {/* Floating orbs — looping */}
      <div
        aria-hidden
        className="absolute -top-32 -left-20 w-[420px] h-[420px] rounded-full animate-float-slow animate-morph"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(99,102,241,0.55), rgba(99,102,241,0) 70%)",
          filter: "blur(40px)",
        }}
      />
      <div
        aria-hidden
        className="absolute top-10 -right-24 w-[460px] h-[460px] rounded-full animate-float-slower animate-morph"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(6,182,212,0.45), rgba(6,182,212,0) 70%)",
          filter: "blur(48px)",
        }}
      />
      <div
        aria-hidden
        className="absolute bottom-0 left-1/3 w-[360px] h-[360px] rounded-full animate-float-slow"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(236,72,153,0.35), rgba(236,72,153,0) 70%)",
          filter: "blur(48px)",
          animationDelay: "-6s",
        }}
      />

      {/* Cursor glow */}
      <div ref={glowRef} className="cursor-glow hidden md:block" aria-hidden />

      {/* Dot grid backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 bg-dots opacity-40 [mask-radial-gradient(ellipse_60%_50%_at_50%_40%,black,transparent_80%)]"
      />

      <div className="relative w-full max-w-[1400px] mx-auto px-6 md:px-10 grid lg:grid-cols-12 gap-10 xl:gap-16 items-center">
        {/* LEFT — copy */}
        <div className="lg:col-span-7 z-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="inline-flex items-center gap-2 glass rounded-full px-[clamp(0.75rem,1.5vw,1rem)] py-[clamp(0.3rem,1vh,0.5rem)] text-[clamp(0.7rem,1.5vh,0.85rem)] font-medium text-ink-soft mb-[clamp(1rem,3vh,2rem)]"
          >
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-lime-500 animate-pulse-ring" />
              <span className="relative rounded-full w-2 h-2 bg-lime-500" />
            </span>
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            Plateforme SaaS B2B · Vérification en moins de 10 secondes
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
            className="font-display font-bold text-ink tracking-tight leading-[1.05] text-[clamp(2.5rem,min(6vw,8vh),5.5rem)]"
          >
            Vos diplômes,{" "}
            <span className="grad-text">infalsifiables</span>
            <br />
            Une confiance,{" "}
            <span className="grad-text-cool">incontestable</span>
          </motion.h1>

          <motion.div
            ref={paraRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
            className="relative mt-[clamp(1rem,3vh,2rem)] max-w-[65ch]"
          >
            <p className="font-elegant text-[clamp(1rem,min(1.5vw,2vh),1.35rem)] text-muted leading-[1.75] tracking-wide">
              CertifyChain émet et vérifie vos diplômes numériques via preuves à divulgation
              nulle (ZKP). Pour les écoles : un portail d&apos;émission sécurisé, un
              certificat PKI officiel et une vérification instantanée — sans ressaisie, sans
              stress administratif, sans fraude possible.
            </p>
            <p
              ref={paraOverlayRef}
              aria-hidden
              className="absolute inset-0 font-elegant text-[clamp(1rem,min(1.5vw,2vh),1.35rem)] text-indigo-500 leading-[1.75] tracking-wide pointer-events-none select-none"
              style={{
                '--mx': '-500px',
                '--my': '-500px',
                maskImage: 'radial-gradient(circle 180px at var(--mx) var(--my), black 0%, transparent 75%)',
                WebkitMaskImage: 'radial-gradient(circle 180px at var(--mx) var(--my), black 0%, transparent 75%)',
              } as React.CSSProperties}
            >
              CertifyChain émet et vérifie vos diplômes numériques via preuves à divulgation
              nulle (ZKP). Pour les écoles : un portail d&apos;émission sécurisé, un
              certificat PKI officiel et une vérification instantanée — sans ressaisie, sans
              stress administratif, sans fraude possible.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.3 }}
            className="mt-[clamp(1.5rem,4vh,3rem)] flex flex-wrap items-center gap-[clamp(0.75rem,2vw,1.5rem)]"
          >
            <a
              href="#cta"
              className="cta-primary cursor-pointer px-[clamp(1.25rem,2vw,2rem)] py-[clamp(0.75rem,1.5vh,1rem)] text-[clamp(0.9rem,1.2vw,1.1rem)] rounded-full font-semibold inline-flex items-center gap-2 group"
            >
              Certifier mon institution
              <ArrowRight className="w-[clamp(1rem,1.5vw,1.25rem)] h-[clamp(1rem,1.5vw,1.25rem)] transition-transform group-hover:translate-x-1" />
            </a>
            <a
              href="#principe"
              className="cta-ghost cursor-pointer px-[clamp(1.25rem,2vw,2rem)] py-[clamp(0.75rem,1.5vh,1rem)] text-[clamp(0.9rem,1.2vw,1.1rem)] rounded-full font-semibold inline-flex items-center gap-2"
            >
              Voir le fonctionnement
            </a>
          </motion.div>

          {/* Trust bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-[clamp(1.5rem,5vh,3.5rem)] grid grid-cols-3 gap-[clamp(0.5rem,1.5vw,1rem)] max-w-2xl"
          >
            {[
              { kpi: "< 2s", label: "preuve ZKP" },
              { kpi: "99,9 %", label: "SLA Enterprise" },
              { kpi: "KYB", label: "institutionnel" },
            ].map((x) => (
              <div
                key={x.label}
                className="neumorph-sm rounded-2xl px-[clamp(0.75rem,1.5vw,1.25rem)] py-[clamp(0.5rem,1.5vh,1rem)] text-left"
              >
                <div className="font-display font-bold text-ink text-[clamp(1.1rem,min(2vw,3vh),1.75rem)] leading-none">
                  {x.kpi}
                </div>
                <div className="text-[clamp(0.65rem,min(1vw,1.5vh),0.85rem)] text-muted mt-[clamp(0.1rem,0.5vh,0.3rem)]">{x.label}</div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* RIGHT — animated diploma card */}
        <div className="lg:col-span-5 z-10 flex justify-center lg:justify-end lg:pl-10">
          <div
            ref={cardRef}
            className="relative tilt-3d w-full max-w-[420px] origin-center lg:origin-right [--card-scale:1] lg:[--card-scale:1.05] xl:[--card-scale:1.25] 2xl:[--card-scale:1.4] [@media(max-height:850px)]:lg:[--card-scale:1] [@media(max-height:750px)]:lg:[--card-scale:0.9] [@media(max-height:650px)]:lg:[--card-scale:0.75]"
            style={{ transform: "perspective(1100px) rotateX(0deg) rotateY(0deg) scale(var(--card-scale, 1))" }}
          >
            {/* Rotating conic ring */}
            <div className="absolute -inset-3 rounded-4xl opacity-60 blur-md animate-spin-slower grad-ring" aria-hidden />

            {/* Card */}
            <div className="relative glass-strong rounded-[1.75rem] p-6 overflow-hidden">

              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl grid place-items-center bg-linear-to-br from-indigo-600 to-indigo-500 text-white shadow-[0_6px_16px_-6px_rgba(79,70,229,0.6)]">
                    <ShieldCheck className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-soft font-semibold">
                      Certificat PKI
                    </div>
                    <div className="font-display font-bold text-sm text-ink">
                      HEC · Campus Paris
                    </div>
                  </div>
                </div>
                <div className="neumorph-pill rounded-full px-2.5 py-1 flex items-center gap-1.5 text-[11px] font-semibold text-success">
                  <span className="relative flex w-1.5 h-1.5">
                    <span className="absolute inset-0 rounded-full bg-success animate-pulse-ring" />
                    <span className="relative rounded-full w-1.5 h-1.5 bg-success" />
                  </span>
                  vérifié
                </div>
              </div>

              {/* Diploma body */}
              <div className="mt-5 rounded-2xl neumorph-inset p-5 relative overflow-hidden">
                <div className="absolute inset-0 animate-shimmer pointer-events-none" aria-hidden />
                <div className="text-[11px] uppercase tracking-wider text-muted-soft font-semibold">
                  Diplôme numérique
                </div>
                <div className="mt-1 font-display font-bold text-ink text-xl leading-tight">
                  Master Data Science
                </div>
                <div className="text-sm text-muted mt-0.5">Promotion 2025 · Mention Très Bien</div>

                <div className="grid grid-cols-3 gap-2 mt-4">
                  {[
                    { l: "Titulaire", v: "A. Dubois" },
                    { l: "ID", v: "UUIDv4" },
                    { l: "Émis le", v: "2025-07-03" },
                  ].map((x) => (
                    <div key={x.l} className="rounded-xl bg-white/70 backdrop-blur px-3 py-2 border border-white/70">
                      <div className="text-[10px] uppercase tracking-wider text-muted-soft">
                        {x.l}
                      </div>
                      <div className="text-xs font-semibold text-ink truncate">{x.v}</div>
                    </div>
                  ))}
                </div>

                {/* Signature hash */}
                <div className="mt-4 flex items-center gap-2 text-[11px] font-mono text-muted break-all">
                  <Fingerprint className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span className="truncate">
                    0xA1b2…Ed25519… f09c82e4 ✓
                  </span>
                </div>
              </div>

              {/* ZKP footer */}
              <div className="mt-4 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 text-ink font-medium">
                  <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                  ZKP Groth16 · nonce unique
                </div>
                <div className="flex items-center gap-1.5 text-success font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Signature valide
                </div>
              </div>

            </div>

            {/* Floating chips */}
            <div className="absolute -left-22 top-14 glass rounded-2xl p-3 hidden items-center gap-2 md:flex animate-drift-chip-left">
              <div className="w-8 h-8 rounded-lg grid place-items-center bg-cyan-100 text-cyan-500">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-muted-soft uppercase tracking-wider font-semibold">Recruteur</div>
                <div className="text-xs font-semibold text-ink">Diplôme vérifié</div>
              </div>
            </div>
            <div className="absolute -right-20 bottom-8 glass rounded-2xl p-3 hidden items-center gap-2 md:flex animate-drift-chip-right">
              <div className="w-8 h-8 rounded-lg grid place-items-center bg-magenta-100 text-magenta-500">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-muted-soft uppercase tracking-wider font-semibold">IA</div>
                <div className="text-xs font-semibold text-ink">Anomalie ·  0</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll hint */}
      <motion.a
        href="#probleme"
        initial={{ opacity: 0, x: "-50%", y: -15 }}
        animate={{ opacity: 1, x: "-50%", y: 0 }}
        transition={{ duration: 0.8, delay: 0.8, ease: "easeOut" }}
        className="absolute bottom-3 left-1/2 flex flex-col items-center gap-2 z-20 group"
      >
        <div className="w-[26px] h-[42px] rounded-full border-2 border-indigo-500/20 glass flex justify-center pt-1.5">
          <motion.div
            animate={{
              y: [0, 10, 18],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
              times: [0, 0.4, 1],
              repeatDelay: 0.5
            }}
            className="w-1 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.8)]"
          />
        </div>
        <span className="text-[10px] md:text-[11px] font-semibold text-muted-soft uppercase tracking-wider group-hover:text-indigo-500 transition-colors">
          Scrollez pour découvrir
        </span>
      </motion.a>
    </section>
  );
}
