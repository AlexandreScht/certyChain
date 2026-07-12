/**
 * Footer landing — régression W4 (audit 2026-07-10) : plus aucun lien mort
 * `href="#"` (les pages non publiées sont grisées « Bientôt disponible »)
 * et l'année du copyright est dynamique (fini le « © 2025 » en dur).
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import Footer from "../../../apps/client/web/src/components/Footer";

describe("Footer — régression W4", () => {
  it("affiche l'année courante dans le copyright (jamais figée)", () => {
    render(<Footer />);
    const year = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`© ${year} CertifyChain`))).toBeInTheDocument();
  });

  it("ne rend plus AUCUN lien mort href=\"#\"", () => {
    const { container } = render(<Footer />);
    expect(container.querySelectorAll('a[href="#"]')).toHaveLength(0);
  });

  it("les pages non publiées sont des libellés grisés, pas des liens", () => {
    render(<Footer />);
    for (const label of ["Documentation", "Blog", "RGPD", "Conditions", "Confidentialité"]) {
      expect(screen.queryByRole("link", { name: label })).toBeNull();
      expect(screen.getByText(label)).toHaveAttribute("title", "Bientôt disponible");
    }
  });

  it("les ancres réelles de la page restent des liens cliquables", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "Tarifs" })).toHaveAttribute("href", "#tarifs");
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "#cta");
  });

  it("les réseaux sociaux non ouverts sont annoncés « bientôt disponible » et non cliquables", () => {
    render(<Footer />);
    for (const network of ["Twitter", "LinkedIn", "GitHub"]) {
      const badge = screen.getByLabelText(`${network} (bientôt disponible)`);
      expect(badge.tagName).not.toBe("A");
    }
  });
});
