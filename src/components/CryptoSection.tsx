"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  Key,
  Lock,
  CheckCircle2,
  ShieldCheck,
  Lightbulb,
  Building2,
  GraduationCap,
} from "lucide-react";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const steps = [
  {
    n: 1,
    icon: ShieldCheck,
    title: "KYB institutionnel",
    desc: "Vérification SIRET, RNCP, EQAR + validation humaine 48h.",
    tint: "indigo",
  },
  {
    n: 2,
    icon: Key,
    title: "Certificat PKI",
    desc: "CertifyChain signe la clé publique de l'école : chaîne de confiance racine.",
    tint: "indigo",
  },
  {
    n: 3,
    icon: Building2,
    title: "Signature Ed25519",
    desc: "L'école signe le hash du diplôme avec sa clé privée — au moment de l'émission.",
    tint: "cyan",
  },
  {
    n: 4,
    icon: GraduationCap,
    title: "Partage par lien",
    desc: "L'élève génère un lien de vérification (option : durée limitée).",
    tint: "cyan",
  },
  {
    n: 5,
    icon: Lock,
    title: "Nonce unique",
    desc: "À chaque clic, le serveur génère un nonce cryptographique à usage unique.",
    tint: "magenta",
  },
  {
    n: 6,
    icon: CheckCircle2,
    title: "Double vérification",
    desc: "ZKP validée contre la clé publique ET certificat validé contre la racine CertifyChain.",
    tint: "magenta",
  },
];

const tintMap: Record<string, string> = {
  indigo: "from-indigo-600 to-indigo-500",
  cyan: "from-cyan-500 to-cyan-400",
  magenta: "from-magenta-500 to-pink-500",
};

export default function CryptoSection() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) return;

      gsap.from("[data-crypto-title]", {
        y: 20, opacity: 0, duration: 0.7, ease: "power3.out",
        scrollTrigger: { trigger: rootRef.current, start: "top 80%" },
      });

      // Timeline: steps reveal as we scroll
      gsap.utils.toArray<HTMLElement>("[data-step]").forEach(el => {
        gsap.from(el, {
          opacity: 0,
          y: 30,
          duration: 0.7,
          ease: "power3.out",
          scrollTrigger: {
            trigger: el,
            start: "top 82%",
            toggleActions: "play none none reverse",
          },
        });

        // Animate inner progress ring
        const ring = el.querySelector<SVGCircleElement>("circle.ring-progress");
        if (ring) {
          const len = 2 * Math.PI * 22; // r=22
          gsap.fromTo(
            ring,
            { strokeDashoffset: len },
            {
              strokeDashoffset: 0,
              duration: 1,
              ease: "power2.out",
              scrollTrigger: {
                trigger: el,
                start: "top 82%",
                toggleActions: "play none none reverse",
              },
            }
          );
          gsap.set(ring, { strokeDasharray: len, strokeDashoffset: len });
        }
      });
    },
    { scope: rootRef }
  );

  return (
    <section
      ref={rootRef}
      id="securite"
      className="relative py-28 md:py-36 overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute top-10 right-0 w-[380px] h-[380px] rounded-full animate-float-slower"
        style={{
          background: "radial-gradient(circle, rgba(79,70,229,0.22), transparent 70%)",
          filter: "blur(48px)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6">
        <div data-crypto-title className="max-w-3xl">
          <div className="inline-flex items-center gap-2 neumorph-pill rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-soft mb-5">
            <Lock className="w-3.5 h-3.5 text-indigo-600" />
            La chaîne de confiance
          </div>
          <h2 className="font-display font-bold text-ink tracking-tight text-4xl md:text-5xl leading-[1.05]">
            Six étapes cryptographiques.{" "}
            <span className="grad-text">Zéro donnée personnelle</span> partagée.
          </h2>
          <p className="mt-5 text-lg text-muted max-w-2xl">
            Le recruteur n&apos;obtient jamais le fichier du diplôme, uniquement une
            preuve mathématique qu&apos;il est valide. L&apos;école n&apos;a jamais besoin
            d&apos;être en ligne. La confiance est portée par la preuve, pas par un
            serveur.
          </p>
        </div>

        <div className="relative mt-16 grid md:grid-cols-2 gap-5">
          {/* Vertical rail */}
          <div
            aria-hidden
            className="hidden md:block absolute left-1/2 top-6 bottom-6 -translate-x-1/2 w-px"
            style={{
              background:
                "linear-gradient(180deg, rgba(79,70,229,0) 0%, #4F46E5 15%, #06B6D4 50%, #EC4899 85%, rgba(236,72,153,0) 100%)",
            }}
          />
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <article
                key={s.n}
                data-step
                className={`glass rounded-2xl p-6 lift relative ${s.n % 2 === 0 ? "md:translate-y-10" : ""}`}
              >
                <div className="flex items-start gap-4">
                  <div className="relative shrink-0">
                    <svg width="56" height="56" viewBox="0 0 56 56">
                      <circle
                        cx="28"
                        cy="28"
                        r="22"
                        fill="none"
                        stroke="rgba(15,23,42,0.08)"
                        strokeWidth="3"
                      />
                      <circle
                        cx="28"
                        cy="28"
                        r="22"
                        fill="none"
                        stroke="url(#ringGrad)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        className="ring-progress"
                        transform="rotate(-90 28 28)"
                      />
                      <defs>
                        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#4F46E5" />
                          <stop offset="50%" stopColor="#06B6D4" />
                          <stop offset="100%" stopColor="#EC4899" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div
                      className={`absolute inset-[8px] rounded-full bg-linear-to-br ${tintMap[s.tint]} grid place-items-center text-white shadow-[0_8px_18px_-8px_rgba(79,70,229,0.55)]`}
                    >
                      <Icon className="w-4.5 h-4.5" strokeWidth={2.1} />
                    </div>
                  </div>

                  <div className="flex-1">
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-soft">
                      Étape {s.n}
                    </div>
                    <h3 className="font-display font-bold text-ink text-lg leading-tight mt-0.5">
                      {s.title}
                    </h3>
                    <p className="mt-1.5 text-sm text-muted leading-relaxed">
                      {s.desc}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Key insight callout */}
        <div className="mt-16 glass-strong rounded-[1.75rem] p-6 md:p-8 flex flex-col md:flex-row items-start gap-6 relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 w-72 h-72 rounded-full grad-ring opacity-20 blur-2xl animate-spin-slower" aria-hidden />
          <div className="relative w-14 h-14 rounded-2xl bg-linear-to-br from-amber-500 to-orange-500 text-white grid place-items-center shadow-[0_10px_24px_-10px_rgba(249,115,22,0.55)] shrink-0">
            <Lightbulb className="w-6 h-6" strokeWidth={2.1} />
          </div>
          <div className="relative">
            <div className="text-[11px] uppercase tracking-wider font-bold text-orange-500">
              À retenir
            </div>
            <h3 className="font-display font-bold text-ink text-2xl md:text-3xl leading-tight mt-1">
              La fraude aux diplômes devient{" "}
              <span className="grad-text-cool">mathématiquement impossible</span>.
            </h3>
            <p className="mt-3 text-muted max-w-3xl">
              Un document falsifié n&apos;aura jamais une signature valide. Un lien
              capturé ne peut pas être rejoué. Un émetteur révoqué invalide
              rétroactivement tous ses diplômes. CertifyChain fonctionne
              aujourd&apos;hui sur un modèle centralisé hautement sécurisé, avec
              option d&apos;ancrage blockchain (Polygon) pour l&apos;offre Enterprise.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
