"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  Building2,
  GraduationCap,
  Search,
  KeyRound,
  ShieldCheck,
  ScanLine,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

type Actor = {
  id: string;
  title: string;
  role: string;
  focus?: boolean;
  icon: React.ElementType;
  points: { icon: React.ElementType; title: string; desc: string }[];
  tint: "indigo" | "cyan" | "magenta";
};

const actors: Actor[] = [
  {
    id: "ecole",
    title: "École / Émetteur",
    role: "Acteur principal — client CertifyChain",
    focus: true,
    icon: Building2,
    tint: "indigo",
    points: [
      {
        icon: ShieldCheck,
        title: "KYB institutionnel",
        desc: "Vérification SIRET, RNCP, EQAR + validation manuelle sous 48h.",
      },
      {
        icon: KeyRound,
        title: "Certificat PKI signé",
        desc: "CertifyChain signe votre clé publique : chaîne de confiance auditable.",
      },
      {
        icon: Sparkles,
        title: "Émission assistée IA",
        desc: "Import PDF/CSV, détection d'anomalies, signature cryptographique en 1 clic.",
      },
    ],
  },
  {
    id: "eleve",
    title: "Élève / Candidat",
    role: "Wallet sans mot de passe",
    icon: GraduationCap,
    tint: "cyan",
    points: [
      {
        icon: KeyRound,
        title: "Connexion email + OTP",
        desc: "Aucune application à installer, accessible mobile et desktop.",
      },
      {
        icon: Sparkles,
        title: "Liens de partage éphémères",
        desc: "QR code, lien LinkedIn, durée d'expiration configurable.",
      },
    ],
  },
  {
    id: "recruteur",
    title: "Recruteur / Vérificateur",
    role: "Vérification publique sans compte",
    icon: Search,
    tint: "magenta",
    points: [
      {
        icon: ScanLine,
        title: "Preuve ZKP en < 2 s",
        desc: "Nonce unique à chaque clic, impossible à rejouer.",
      },
      {
        icon: ShieldCheck,
        title: "Authenticité double",
        desc: "Vérifie le diplôme ET le certificat d'établissement.",
      },
    ],
  },
];

const tintClasses: Record<string, { chip: string; icon: string; dot: string; ring: string; bgGrad: string }> = {
  indigo: {
    chip: "bg-indigo-100 text-indigo-600",
    icon: "from-indigo-600 to-indigo-500",
    dot: "bg-indigo-500",
    ring: "ring-indigo-500/50",
    bgGrad: "bg-linear-to-br from-indigo-600/10 to-transparent",
  },
  cyan: {
    chip: "bg-cyan-100 text-cyan-500",
    icon: "from-cyan-500 to-cyan-400",
    dot: "bg-cyan-500",
    ring: "ring-sky-400/60",
    bgGrad: "bg-linear-to-br from-cyan-500/10 to-transparent to-[30%]",
  },
  magenta: {
    chip: "bg-magenta-100 text-magenta-500",
    icon: "from-magenta-500 to-pink-500",
    dot: "bg-magenta-500",
    ring: "ring-pink-400/60",
    bgGrad: "bg-linear-to-br from-magenta-500/10 to-transparent to-[20%]",
  },
};

export default function HowItWorksSection() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) return;

      // Stagger reveal of actor cards as the section enters
      gsap.from("[data-actor]", {
        y: 40,
        opacity: 0,
        scale: 0.98,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.15,
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top 70%",
          toggleActions: "play none none reverse",
        },
      });

      // Animate SVG path connector
      const path = document.querySelector<SVGPathElement>("#flow-path");
      if (path) {
        const length = path.getTotalLength();
        gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
        gsap.to(path, {
          strokeDashoffset: 0,
          ease: "none",
          scrollTrigger: {
            trigger: rootRef.current,
            start: "top 0%",
            end: "bottom 92%",
            scrub: 0.4,
          },
        });
      }

      // Pinned eyebrow title while cards flow
      gsap.from("[data-title]", {
        y: 24,
        opacity: 0,
        duration: 0.8,
        ease: "power2.out",
        scrollTrigger: { trigger: rootRef.current, start: "top 75%" },
      });
    },
    { scope: rootRef }
  );

  return (
    <section
      ref={rootRef}
      id="principe"
      className="relative py-28 md:py-36 overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute top-32 -left-20 w-[380px] h-[380px] rounded-full animate-float-slower"
        style={{
          background: "radial-gradient(circle, rgba(99,102,241,0.22), transparent 70%)",
          filter: "blur(48px)",
        }}
      />
      <div
        aria-hidden
        className="absolute bottom-10 right-0 w-[320px] h-[320px] rounded-full animate-float-slow"
        style={{
          background: "radial-gradient(circle, rgba(6,182,212,0.22), transparent 70%)",
          filter: "blur(48px)",
          animationDelay: "-4s",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6">
        <div data-title className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 neumorph-pill rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-soft mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            Le principe
          </div>
          <h2 className="font-display font-bold text-ink tracking-tight text-4xl md:text-5xl leading-[1.05]">
            Un flux asynchrone, <span className="grad-text-cool">trois acteurs</span>, une seule vérité cryptographique.
          </h2>
          <p className="mt-5 text-lg text-muted">
            L&apos;école émet, l&apos;élève partage, le recruteur vérifie. Aucun acteur n&apos;a
            besoin d&apos;être en ligne en même temps — la preuve est autonome.
          </p>
        </div>

        {/* Flow connector SVG */}
        <div aria-hidden className="relative mt-16">
          <svg
            className="absolute inset-x-0 -top-6 w-full h-24 hidden lg:block pointer-events-none"
            viewBox="0 0 1200 100"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="flowGrad" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#4F46E5" />
                <stop offset="50%" stopColor="#06B6D4" />
                <stop offset="100%" stopColor="#EC4899" />
              </linearGradient>
            </defs>
            <path
              id="flow-path"
              d="M 60 60 C 300 0, 500 120, 700 40 S 1000 80, 1140 40"
              stroke="url(#flowGrad)"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M 60 60 C 300 0, 500 120, 700 40 S 1000 80, 1140 40"
              stroke="url(#flowGrad)"
              strokeWidth="2.5"
              strokeDasharray="4 8"
              fill="none"
              opacity="0.35"
              strokeLinecap="round"
              className="animate-dash"
            />
          </svg>
        </div>

        <div className="relative grid lg:grid-cols-3 gap-6 mt-10 items-start">
          {actors.map((actor, i) => {
            const Icon = actor.icon;
            const c = tintClasses[actor.tint];
            const isFocus = actor.focus;
            return (
              <article
                key={actor.id}
                data-actor
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  e.currentTarget.style.setProperty("--mx", `${x}px`);
                  e.currentTarget.style.setProperty("--my", `${y}px`);
                }}
                className={cn(
                  "hover-glow relative rounded-[1.75rem] p-7 lift",
                  isFocus ? "lg:scale-105 lg:-translate-y-2 ring-1 ring-indigo-200/60 glass-strong" : "glass"
                )}
              >
                <div className={cn('absolute inset-0 rounded-[1.75rem] pointer-events-none', c.bgGrad)} />

                <div className="relative z-10 flex items-start gap-3">
                  <div
                    className={`w-12 h-12 rounded-2xl bg-linear-to-br ${c.icon} text-white grid place-items-center shadow-[0_10px_24px_-10px_rgba(79,70,229,0.55)]`}
                  >
                    <Icon className="w-5.5 h-5.5" strokeWidth={2.1} />
                  </div>
                  <div className="flex-1">
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-soft">
                      Étape {i + 1}
                    </div>
                    <h3 className="font-display font-bold text-ink text-xl leading-tight">
                      {actor.title}
                    </h3>
                    <p className="text-xs text-muted mt-0.5">{actor.role}</p>
                  </div>
                </div>

                <ul className="mt-6 space-y-3.5">
                  {actor.points.map((p) => {
                    const PIcon = p.icon;
                    return (
                      <li key={p.title} className="flex gap-3">
                        <div
                          className={`shrink-0 w-8 h-8 rounded-xl ${c.chip} grid place-items-center ring-1 ${c.ring}`}
                        >
                          <PIcon className="w-4 h-4" strokeWidth={2.2} />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-ink leading-tight">
                            {p.title}
                          </div>
                          <p className="text-xs text-muted leading-relaxed mt-0.5">
                            {p.desc}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {isFocus && (
                  <a
                    href="#ecoles"
                    className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-500 cursor-pointer group"
                  >
                    Voir en détail
                    <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
                  </a>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
