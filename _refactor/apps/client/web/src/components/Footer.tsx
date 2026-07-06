import { ShieldCheck, Twitter, Linkedin, Github } from "lucide-react";

const columns = [
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
      { label: "Documentation", href: "#" },
      { label: "API publique", href: "#" },
      { label: "Registre émetteurs", href: "#" },
      { label: "Blog", href: "#" },
    ],
  },
  {
    title: "Entreprise",
    links: [
      { label: "À propos", href: "#" },
      { label: "Sécurité", href: "#securite" },
      { label: "RGPD", href: "#" },
      { label: "Contact", href: "#cta" },
    ],
  },
];

export default function Footer() {
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
              <a
                key={label}
                href="#"
                aria-label={label}
                className="w-10 h-10 rounded-full neumorph-pill grid place-items-center text-muted hover:text-indigo-600 transition-colors cursor-pointer"
              >
                <Icon className="w-4 h-4" />
              </a>
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
                    <a
                      href={l.href}
                      className="text-sm text-muted hover:text-ink transition-colors cursor-pointer"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-hairline">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-muted">
          <span>© 2025 CertifyChain · Document propriétaire — diffusion restreinte.</span>
          <div className="flex items-center gap-5">
            <a href="#" className="hover:text-ink cursor-pointer">Conditions</a>
            <a href="#" className="hover:text-ink cursor-pointer">Confidentialité</a>
            <a href="#" className="hover:text-ink cursor-pointer">Cookies</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
