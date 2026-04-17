import { Shield } from "lucide-react";

const footerLinks = {
  Produit: [
    { label: "Fonctionnalités", href: "#fonctionnalites" },
    { label: "Tarifs", href: "#tarifs" },
    { label: "Sécurité", href: "#fonctionnement" },
    { label: "Roadmap", href: "#" },
  ],
  Ressources: [
    { label: "Documentation", href: "#" },
    { label: "Blog", href: "#" },
    { label: "API", href: "#" },
    { label: "Status", href: "#" },
  ],
  Légal: [
    { label: "Mentions légales", href: "#" },
    { label: "CGU", href: "#" },
    { label: "Politique de confidentialité", href: "#" },
    { label: "RGPD", href: "#" },
  ],
};

export default function Footer() {
  return (
    <footer className="bg-primary border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <a href="#" className="flex items-center gap-2.5 mb-4 cursor-pointer">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cta to-accent flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-xl font-bold text-white tracking-tight">
                Certify<span className="text-cta">Chain</span>
              </span>
            </a>
            <p className="text-sm text-slate-400 leading-relaxed max-w-xs mb-4">
              Rendez la fraude aux diplômes techniquement impossible. 
              Diplômes numériques authentifiés par cryptographie Zero-Knowledge.
            </p>
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} CertifyChain. Tous droits réservés.
            </p>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold text-white mb-4">{category}</h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-slate-400 hover:text-white transition-colors duration-200 cursor-pointer"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
