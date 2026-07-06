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
import { cn } from "@certifychain/shared/lib/cn";

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

type Tint = "indigo" | "cyan" | "magenta";

const tintHex: Record<Tint, string> = {
  indigo: "#6019BF", // indigo-400
  cyan: "#3CF0EA",   // cyan-400
  magenta: "#F03CE7", // pink-400
};

function FlowArrow({ from, to, index }: { from: Tint; to: Tint; index: number }) {
  const fromColor = tintHex[from];
  const toColor = tintHex[to];
  const gid = `fg-${from}-${to}`;
  const base = index * 2000;

  return (
    <div className="flex items-center justify-center shrink-0 py-1 lg:py-0 lg:w-10 xl:w-14 lg:self-center relative z-10">
      {/* Mobile: 3 chevrons down — gradient top→bottom */}
      <svg viewBox="0 0 20 52" className="lg:hidden h-14 w-5" fill="none" aria-hidden>
        <defs>
          <linearGradient id={`${gid}-v`} x1="0" y1="0" x2="0" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={fromColor} />
            <stop offset="100%" stopColor={toColor} />
          </linearGradient>
        </defs>
        {([0, 17, 34] as const).map((y, i) => (
          <path
            key={i}
            d={`M3 ${y + 2} L10 ${y + 9} L17 ${y + 2}`}
            stroke={`url(#${gid}-v)`}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-arrow-wave"
            style={{ animationDelay: `${base + i * 240}ms` }}
          />
        ))}
      </svg>
      {/* Desktop: 3 chevrons right — gradient left→right */}
      <svg viewBox="0 0 52 20" className="hidden lg:block w-full h-5 translate-x-1" fill="none" aria-hidden>
        <defs>
          <linearGradient id={`${gid}-h`} x1="0" y1="0" x2="52" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={fromColor} />
            <stop offset="100%" stopColor={toColor} />
          </linearGradient>
        </defs>
        {([0, 17, 34] as const).map((x, i) => (
          <path
            key={i}
            d={`M${x + 2} 3 L${x + 9} 10 L${x + 2} 17`}
            stroke={`url(#${gid}-h)`}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-arrow-wave"
            style={{ animationDelay: `${base + i * 240}ms` }}
          />
        ))}
      </svg>
    </div>
  );
}

const tintClasses: Record<string, { chip: string; icon: string; dot: string; ring: string; bgGrad: string }> = {
  indigo: {
    chip: "bg-indigo-100 text-indigo-600",
    icon: "from-indigo-600 to-indigo-500",
    dot: "bg-indigo-500",
    ring: "ring-indigo-500/50",
    bgGrad: "bg-linear-to-br from-indigo-600/10 to-transparent",
  },
  cyan: {
    chip: "bg-cyan-100 text-cyan-700 dark:text-cyan-300",
    icon: "from-cyan-500 to-cyan-400",
    dot: "bg-cyan-500",
    ring: "ring-sky-400/60",
    bgGrad: "bg-linear-to-br from-cyan-500/10 to-transparent to-[30%]",
  },
  magenta: {
    chip: "bg-magenta-100 text-pink-700 dark:text-pink-300",
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

      // Animate SVG path connector — span the entire visible window of the section
      const path = document.querySelector<SVGPathElement>("#flow-path");
      if (path) {
        const length = path.getTotalLength();
        gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
        gsap.to(path, {
          strokeDashoffset: 0,
          ease: "none",
          scrollTrigger: {
            trigger: rootRef.current,
            start: "top 70%",   // begins as section enters viewport
            end: "bottom 70%",  // completes as section exits — large range = smooth on any screen size
            scrub: 0.8,
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

      <div className="relative max-w-6xl xl:max-w-7xl mx-auto px-6 xl:px-10">
        <div data-title className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 neumorph-pill rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-soft mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            Le principe
          </div>
          <h2 className="font-display font-bold text-ink tracking-tight text-4xl md:text-5xl leading-[1.05]">
            Un flux asynchrone, <span className="grad-text-cool">trois acteurs</span>, une seule vérité cryptographique
          </h2>
          <p className="mt-5 text-lg text-muted">
            L&apos;école émet, l&apos;élève partage, le recruteur vérifie. Aucun acteur n&apos;a
            besoin d&apos;être en ligne en même temps — la preuve est autonome.
          </p>
        </div>

        {/* Flow connector SVG */}
        <div aria-hidden className="relative mt-18">
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

        <div className="relative flex flex-col lg:flex-row mt-2 gap-4 lg:gap-0 lg:items-start">
          {actors.flatMap((actor, i) => {
            const Icon = actor.icon;
            const c = tintClasses[actor.tint];
            const isFocus = actor.focus;

            const card = (
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
                  "hover-glow relative rounded-[1.75rem] p-7 xl:p-9 lift flex-1 min-w-0",
                  isFocus ? "lg:scale-105 xl:scale-[1.07] lg:-translate-y-6 ring-1 ring-indigo-200/60 glass-strong z-20" : "glass lg:mt-10"
                )}
              >
                <div className={cn('absolute inset-0 rounded-[1.75rem] pointer-events-none', c.bgGrad)} />

                <div className="relative z-10 flex items-start gap-3">
                  <div className={`w-12 h-12 rounded-2xl bg-linear-to-br ${c.icon} text-white grid place-items-center shadow-[0_10px_24px_-10px_rgba(79,70,229,0.55)]`}>
                    <Icon className="w-5.5 h-5.5" strokeWidth={2.1} />
                  </div>
                  <div className="flex-1">
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-soft">
                      Étape {i + 1}
                    </div>
                    <h3 className="font-display font-bold text-ink text-lg xl:text-xl leading-tight lg:whitespace-nowrap">
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
                        <div className={`shrink-0 w-8 h-8 rounded-xl ${c.chip} grid place-items-center ring-1 ${c.ring}`}>
                          <PIcon className="w-4 h-4" strokeWidth={2.2} />
                        </div>
                        <div>
                          <div className="text-sm xl:text-base font-semibold text-ink leading-tight">
                            {p.title}
                          </div>
                          <p className="text-xs xl:text-sm text-muted leading-relaxed mt-0.5">
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

            return i === 0
              ? [card]
              : [<FlowArrow key={`arrow-${i}`} from={actors[i - 1].tint} to={actor.tint} index={i - 1} />, card];
          })}
        </div>
      </div>
    </section>
  );
}
