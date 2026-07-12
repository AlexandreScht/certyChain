/**
 * Cartes diplôme du wallet — régression WA1 (audit 2026-07-10) : la copy
 * technique doit refléter le moteur réel (Ed25519 + nonce), plus aucune
 * mention « ZKP Groth16 » (phase 2 non implémentée) ni fausse « vérification »
 * sur un diplôme révoqué. next/link est stubbé via jest.config.cjs.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import type { WalletDiplomaDTO } from "@certifychain/contract/dto";
import { DiplomaCard } from "../../../apps/client/wallet/src/components/wallet/DiplomaCard";
import { DiplomaDetailCard } from "../../../apps/client/wallet/src/components/wallet/DiplomaDetailCard";

const diploma = (over: Partial<WalletDiplomaDTO> = {}): WalletDiplomaDTO => ({
  id: "0b7e2f4a-1234-4a5b-9abc-def012345678",
  schoolName: "École Supérieure du Web",
  programTitle: "Master Ingénierie Logicielle",
  mention: "Bien",
  rncp: null,
  issuedAt: "2026-06-15T10:00:00.000Z",
  status: "active",
  ...over,
});

describe("DiplomaCard — régression WA1", () => {
  it("annonce le moteur réel (« signé Ed25519 »), jamais Groth16", () => {
    render(<DiplomaCard diploma={diploma()} />);
    expect(screen.getByText(/signé Ed25519/)).toBeInTheDocument();
    expect(screen.queryByText(/groth16|zkp/i)).toBeNull();
  });

  it("route vers le détail du diplôme avec un intitulé accessible", () => {
    const dto = diploma();
    render(<DiplomaCard diploma={dto} />);
    const link = screen.getByRole("link", {
      name: `Voir le diplôme ${dto.programTitle}`,
    });
    expect(link).toHaveAttribute("href", `/${dto.id}`);
  });

  it("affiche école, programme, promotion, mention et statut", () => {
    render(<DiplomaCard diploma={diploma()} />);
    expect(screen.getByText("École Supérieure du Web")).toBeInTheDocument();
    expect(screen.getByText("Master Ingénierie Logicielle")).toBeInTheDocument();
    expect(screen.getByText(/Promotion 2026 · Mention Bien/)).toBeInTheDocument();
    expect(screen.getByText("Valide")).toBeInTheDocument();
  });

  it("statut révoqué : badge « Révoqué »", () => {
    render(<DiplomaCard diploma={diploma({ status: "revoked" })} />);
    expect(screen.getByText("Révoqué")).toBeInTheDocument();
  });
});

describe("DiplomaDetailCard — régression WA1", () => {
  it("copy neutre « Preuve cryptographique · nonce unique », jamais Groth16", () => {
    render(<DiplomaDetailCard diploma={diploma()} />);
    expect(screen.getByText(/Preuve cryptographique · nonce unique/)).toBeInTheDocument();
    expect(screen.queryByText(/groth16|zkp/i)).toBeNull();
  });

  it("diplôme actif : « Signature valide »", () => {
    render(<DiplomaDetailCard diploma={diploma()} />);
    expect(screen.getByText("Signature valide")).toBeInTheDocument();
  });

  it("diplôme révoqué : avertissement, plus aucune « Signature valide »", () => {
    render(<DiplomaDetailCard diploma={diploma({ status: "revoked" })} />);
    expect(screen.getByText(/Diplôme révoqué par l.établissement/)).toBeInTheDocument();
    expect(screen.queryByText("Signature valide")).toBeNull();
  });

  it("la tuile « Titre RNCP » n'apparaît que si le diplôme en a un", () => {
    const { rerender } = render(<DiplomaDetailCard diploma={diploma()} />);
    expect(screen.queryByText("Titre RNCP")).toBeNull();
    rerender(<DiplomaDetailCard diploma={diploma({ rncp: "RNCP36123" })} />);
    expect(screen.getByText("Titre RNCP")).toBeInTheDocument();
    expect(screen.getByText("RNCP36123")).toBeInTheDocument();
  });
});
