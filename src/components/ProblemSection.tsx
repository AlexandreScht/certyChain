"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { AlertTriangle, Clock, FileWarning, ShieldCheck } from "lucide-react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const stats = [
  {
    end: 30,
    suffix: "%",
    prefix: "",
    title: "des CV contiennent une inexactitude",
    desc: "sur les formations déclarées, selon plusieurs études européennes.",
    icon: FileWarning,
    tint: "magenta",
  },
  {
    end: 3,
    suffix: " sem.",
    prefix: "±",
    title: "pour vérifier un diplôme par email",
    desc: "auprès d'une école : administratif, fragile, coûteux.",
    icon: Clock,
    tint: "amber",
  },
  {
    end: 10,
    suffix: "s",
    prefix: "<",
    title: "avec CertifyChain",
    desc: "une preuve cryptographique publique suffit. Sans compte, sans appel.",
    icon: ShieldCheck,
    tint: "indigo",
  },
];

const tintMap: Record<string, string> = {
  magenta: "from-magenta-100 to-white dark:to-transparent text-magenta-500",
  amber: "from-amber-500/15 to-white dark:to-transparent text-amber-500",
  indigo: "from-indigo-100 to-white dark:to-transparent text-indigo-600",
};

export default function ProblemSection() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) return;

      const counters = gsap.utils.toArray<HTMLElement>("[data-counter]");
      counters.forEach((el) => {
        const target = parseFloat(el.dataset.counter || "0");
        const suffix = el.dataset.suffix || "";
        const prefix = el.dataset.prefix || "";
        const obj = { v: 0 };
        gsap.to(obj, {
          v: target,
          duration: 1.6,
          ease: "power2.out",
          scrollTrigger: {
            trigger: el,
            start: "top 85%",
            toggleActions: "play none none none",
          },
          onUpdate() {
            el.textContent = `${prefix}${Math.round(obj.v)}${suffix}`;
          },
        });
      });

      gsap.set("[data-card]", { y: 32, opacity: 0 });
      gsap.to("[data-card]", {
        y: 0,
        opacity: 1,
        duration: 0.8,
        stagger: 0.12,
        ease: "power3.out",
        clearProps: "transform,opacity",
        scrollTrigger: { trigger: rootRef.current, start: "top 75%", once: true },
      });

      gsap.from("[data-eyebrow]", {
        y: 18,
        opacity: 0,
        duration: 0.7,
        ease: "power2.out",
        scrollTrigger: { trigger: rootRef.current, start: "top 80%" },
      });
    },
    { scope: rootRef }
  );

  return (
    <section
      ref={rootRef}
      id="probleme"
      className="relative py-28 md:py-36 overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute -top-20 right-0 w-[360px] h-[360px] rounded-full animate-float-slow"
        style={{
          background: "radial-gradient(circle, rgba(236,72,153,0.25), transparent 70%)",
          filter: "blur(42px)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6">
        <div data-eyebrow className="max-w-3xl">
          <div className="inline-flex items-center gap-2 neumorph-pill rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-soft mb-5">
            <AlertTriangle className="w-3.5 h-3.5 text-magenta-500" />
            Le problème
          </div>
          <h2 className="font-display font-bold text-ink tracking-tight text-4xl md:text-5xl leading-[1.05]">
            La fraude aux diplômes coûte cher.{" "}
            <span className="grad-text">La vérification, encore plus !</span>
          </h2>
          <p className="mt-5 text-lg text-muted max-w-2xl">
            Entre les CV mensongers, les appels interminables aux services
            administratifs et l&apos;absence de standard vérifiable, les écoles
            subissent un désordre coûteux. CertifyChain le résout à la racine.
          </p>
        </div>

        <div className="mt-14 grid md:grid-cols-3 gap-5">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.title}
                data-card
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  e.currentTarget.style.setProperty("--mx", `${x}px`);
                  e.currentTarget.style.setProperty("--my", `${y}px`);
                }}
                className="hover-glow glass glass-sheen rounded-3xl p-7 lift group flex flex-col"
              >
                <div
                  className={`w-12 h-12 rounded-2xl bg-linear-to-br ${tintMap[s.tint]} grid place-items-center mb-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]`}
                >
                  <Icon className="w-5.5 h-5.5" strokeWidth={2.2} />
                </div>
                <div className="font-display font-bold text-ink text-5xl md:text-6xl leading-none tracking-tight">
                  <span
                    data-counter={s.end}
                    data-suffix={s.suffix}
                    data-prefix={s.prefix}
                  >
                    {s.prefix}0{s.suffix}
                  </span>
                </div>
                <div className="mt-4 font-display font-semibold text-ink text-lg leading-snug flex-1">
                  {s.title}
                </div>
                <p className="mt-4 text-sm text-muted leading-relaxed">{s.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
