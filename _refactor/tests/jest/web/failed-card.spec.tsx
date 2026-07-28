/**
 * Page publique /verify — état d'échec fusionné (PLAN.md P6, audit R1,
 * `docs/architecture.md` §12.1-§12.2) : les 5 états internes
 * (`verified/not_found/revoked/expired/invalid`) restent réels côté API/audit,
 * mais la présentation PUBLIQUE fusionne les 4 non-`verified` en UN seul
 * message générique — sinon un tiers anonyme apprend *pourquoi* une
 * vérification a échoué (révoqué ≠ expiré ≠ inconnu ≠ altéré), exactement
 * l'oracle que le 404 uniforme de `GET /verify/revocation/:id` ferme déjà.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import {
  FailedCard,
  type FailedResult,
} from "../../../apps/client/web/src/components/verify/FailedCard";

const ALL_RESULTS: FailedResult[] = ["not_found", "revoked", "expired", "invalid"];

describe("FailedCard — fusion publique 5 → 2 (P6)", () => {
  it.each(ALL_RESULTS)(
    "affiche le MÊME titre générique « Diplôme introuvable » pour %s",
    (result) => {
      render(<FailedCard result={result} onRetry={() => undefined} retrying={false} />);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
        "Diplôme introuvable",
      );
    },
  );

  it("n'affiche jamais un mot distinctif par état (révoqué/expiré/invalide) dans le titre", () => {
    for (const result of ALL_RESULTS) {
      const { unmount } = render(
        <FailedCard result={result} onRetry={() => undefined} retrying={false} />,
      );
      const heading = screen.getByRole("heading", { level: 1 }).textContent;
      // Le titre ne doit JAMAIS trahir l'état interne précis.
      expect(heading).not.toMatch(/révoqué|expiré|invalide/i);
      unmount();
    }
  });

  it("est annoncée comme alerte (role=alert)", () => {
    render(<FailedCard result="invalid" onRetry={() => undefined} retrying={false} />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("ne divulgue jamais le contenu du document (mention explicite)", () => {
    render(<FailedCard result="revoked" onRetry={() => undefined} retrying={false} />);
    expect(screen.getByText(/aucun contenu du document/i)).toBeTruthy();
  });

  it("le bouton Réessayer déclenche onRetry", () => {
    const onRetry = jest.fn();
    render(<FailedCard result="expired" onRetry={onRetry} retrying={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Réessayer/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("reste un ton neutre (pas rouge) — on ne peut pas garantir qu'il s'agit d'une fraude", () => {
    render(<FailedCard result="invalid" onRetry={() => undefined} retrying={false} />);
    // Le fond de l'icône reste la palette neutre `muted`, jamais `danger`.
    expect(document.querySelector(".bg-danger\\/15")).toBeNull();
    expect(document.querySelector(".bg-muted-soft\\/15")).not.toBeNull();
  });
});
