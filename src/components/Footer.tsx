import { ShieldCheck, Mail, Phone, MapPin } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-slate-950 text-slate-300 py-16 border-t border-slate-800">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div className="col-span-1 md:col-span-1">
            <div className="flex items-center gap-2 mb-6">
              <ShieldCheck className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold tracking-tight text-white">
                Certify<span className="text-primary">Chain</span>
              </span>
            </div>
            <p className="text-slate-400 mb-6 leading-relaxed">
              La plateforme SaaS B2B qui permet aux écoles d'émettre des diplômes infalsifiables et vérifiables instantanément grâce à la cryptographie Zero-Knowledge Proof.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-6">Produit</h4>
            <ul className="flex flex-col gap-3">
              <li><a href="#" className="hover:text-white transition-colors">Pour les Écoles</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Pour les Étudiants</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Pour les Recruteurs</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Tarifs</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-6">Ressources</h4>
            <ul className="flex flex-col gap-3">
              <li><a href="#" className="hover:text-white transition-colors">Documentation API</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Sécurité & ZKP</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Support</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-6">Contact</h4>
            <ul className="flex flex-col gap-4">
              <li className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-primary" />
                <span>contact@certychain.io</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-primary" />
                <span>+33 (0)1 23 45 67 89</span>
              </li>
              <li className="flex flex-start gap-3">
                <MapPin className="h-5 w-5 text-primary shrink-0" />
                <span>Station F, 5 Parvis Alan Turing, 75013 Paris</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <p>© {new Date().getFullYear()} CertifyChain. Tous droits réservés.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors">Mentions légales</a>
            <a href="#" className="hover:text-white transition-colors">Politique de confidentialité</a>
            <a href="#" className="hover:text-white transition-colors">CGV</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
