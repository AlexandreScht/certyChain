import { ShieldCheck, Twitter, Linkedin, Github } from "lucide-react";

/** `href: null` = page pas encore publiée → rendue non cliquable (pas de lien mort). */
const columns: { title: string; links: { label: string; href: string | null }[] }[] = [
  {
    title: "Produit",
    links: [
      { label: "Pour les écoles", href: "#ecoles" },
      { label: "Principe ZKP", href: "#securite" },
      { label: "Tarifs", href: "#tarifs" },
      { label: "Fonctionnalités IA", href: "#ia" },
    ],
  },
  {
    title: "Ressources",
    links: [
      { label: "Documentation", href: null },
      { label: "API publique", href: null },
      { label: "Registre émetteurs", href: null },
      { label: "Blog", href: null },
    ],
  },
  {
    title: "Entreprise",
    links: [
      { label: "À propos", href: null },
      { label: "Sécurité", href: "#securite" },
      { label: "RGPD", href: null },
      { label: "Contact", href: "#cta" },
    ],
  },
];

const legalLinks: { label: string; href: string | null }[] = [
  { label: "Conditions", href: null },
  { label: "Confidentialité", href: null },
  { label: "Cookies", href: null },
];

/** Lien réel, ou libellé grisé « à venir » quand la cible n'existe pas encore. */
function FooterLink({
  label,
  href,
  className = "text-sm",
}: {
  label: string;
  href: string | null;
  className?: string;
}) {
  if (!href) {
    return (
      <span
        title="Bientôt disponible"
        className={`${className} text-muted-soft/70 cursor-default select-none`}
      >
        {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      className={`${className} text-muted hover:text-ink transition-colors cursor-pointer`}
    >
      {label}
    </a>
  );
}

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative mt-10 border-t border-hairline">
      <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-indigo-500/50 to-transparent" />
      <div className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-12 gap-10">
        <div className="md:col-span-5">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-linear-to-br from-indigo-600 to-indigo-500 text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.55)]">
              <ShieldCheck className="w-5 h-5" strokeWidth={2.2} />
            </span>
            <span className="font-display font-bold text-ink text-xl tracking-tight">
              Certify<span className="grad-text-cool">Chain</span>
            </span>
          </div>
          <p className="mt-5 text-sm text-muted max-w-sm leading-relaxed">
            Plateforme SaaS B2B de délivrance et vérification de diplômes via
            preuves Zero-Knowledge. Pour un monde où la fraude aux diplômes
            devient techniquement impossible.
          </p>
          <div className="mt-6 flex items-center gap-2">
            {[
              { Icon: Twitter, label: "Twitter" },
              { Icon: Linkedin, label: "LinkedIn" },
              { Icon: Github, label: "GitHub" },
            ].map(({ Icon, label }) => (
              <span
                key={label}
                title={`${label} — bientôt disponible`}
                aria-label={`${label} (bientôt disponible)`}
                className="w-10 h-10 rounded-full neumorph-pill grid place-items-center text-muted-soft/70 cursor-default"
              >
                <Icon className="w-4 h-4" />
              </span>
            ))}
          </div>
        </div>

        <div className="md:col-span-7 grid grid-cols-2 md:grid-cols-3 gap-6">
          {columns.map((c) => (
            <div key={c.title}>
              <div className="text-xs font-bold uppercase tracking-wider text-ink mb-4">
                {c.title}
              </div>
              <ul className="space-y-2.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <FooterLink label={l.label} href={l.href} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-hairline">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-muted">
          <span>© {year} CertifyChain · Document propriétaire — diffusion restreinte.</span>
          <div className="flex items-center gap-5">
            {legalLinks.map((l) => (
              <FooterLink key={l.label} label={l.label} href={l.href} className="text-xs" />
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
