"use client";

import { useState, useEffect } from "react";
import { Menu, X, ShieldCheck } from "lucide-react";

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? "glass py-4" : "bg-transparent py-6"
      }`}
    >
      <div className="container mx-auto px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold tracking-tight text-slate-900">
            Certify<span className="text-primary">Chain</span>
          </span>
        </div>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8 font-medium text-slate-600">
          <a href="#solution" className="hover:text-primary transition-colors">La Solution</a>
          <a href="#ecoles" className="hover:text-primary transition-colors">Pour les Écoles</a>
          <a href="#fonctionnement" className="hover:text-primary transition-colors">Comment ça marche</a>
          <a href="#tarifs" className="hover:text-primary transition-colors">Tarifs</a>
        </nav>

        <div className="hidden md:flex items-center gap-4">
          <a href="#" className="text-slate-600 hover:text-primary font-medium transition-colors">
            Connexion
          </a>
          <a href="#" className="bg-primary hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-lg shadow-primary/30">
            Démo Gratuite
          </a>
        </div>

        {/* Mobile Toggle */}
        <button 
          className="md:hidden text-slate-900"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-white border-t border-slate-100 shadow-xl p-6 flex flex-col gap-4">
          <a href="#solution" className="text-slate-600 font-medium py-2">La Solution</a>
          <a href="#ecoles" className="text-slate-600 font-medium py-2">Pour les Écoles</a>
          <a href="#fonctionnement" className="text-slate-600 font-medium py-2">Comment ça marche</a>
          <a href="#tarifs" className="text-slate-600 font-medium py-2">Tarifs</a>
          <hr className="border-slate-100 my-2" />
          <a href="#" className="text-slate-600 font-medium py-2">Connexion</a>
          <a href="#" className="bg-primary text-white px-5 py-3 rounded-lg font-medium text-center">
            Démo Gratuite
          </a>
        </div>
      )}
    </header>
  );
}
