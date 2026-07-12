/** Page publique /verify — copy exacte des états d'échec (recruteur). */
import { fireEvent, render, screen } from "@testing-library/react";
import {
  FailedCard,
  type FailedResult,
} from "../../../apps/client/web/src/components/verify/FailedCard";

const EXPECTED: Record<FailedResult, string> = {
  not_found: "Diplôme introuvable ou révoqué",
  revoked: "Diplôme révoqué",
  expired: "Lien expiré",
  invalid: "Vérification invalide",
};

describe("FailedCard", () => {
  it.each(Object.entries(EXPECTED) as [FailedResult, string][])(
    "affiche le bon titre pour %s",
    (result, title) => {
      render(<FailedCard result={result} onRetry={() => undefined} retrying={false} />);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title);
    },
  );

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

  it("un lien expiré reste un état NEUTRE (pas rouge) — guide vers un nouveau lien", () => {
    render(<FailedCard result="expired" onRetry={() => undefined} retrying={false} />);
    expect(screen.getByText(/partager un nouveau lien/i)).toBeTruthy();
  });
});
