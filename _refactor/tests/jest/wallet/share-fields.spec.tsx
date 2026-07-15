/**
 * Wallet — panneau de partage, choix des champs divulgués (v2.md §V1-2 / §V1-7.5).
 * Le titulaire décide ce que le recruteur verra ; `holderEmail` est la donnée la
 * plus sensible et doit rester décochée par défaut.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";

import type { ShareLinkDTO } from "@certifychain/contract/dto";
import { DEFAULT_DISCLOSED_FIELDS } from "@certifychain/contract/enums";
import { ToastProvider } from "@certifychain/shared/ui";
import { SharePanel } from "../../../apps/client/wallet/src/components/wallet/SharePanel";
import { createShareLink } from "@/lib/api/endpoints";

jest.mock("@/lib/api/endpoints", () => ({
  createShareLink: jest.fn(),
  revokeShareLink: jest.fn(),
}));

jest.mock(
  "qrcode.react",
  () => ({
    QRCodeCanvas: () => <div role="img" aria-label="QR code" />,
  }),
  { virtual: true },
);

const createShareLinkMock = jest.mocked(createShareLink);

const FIELD_LABELS = [
  "Nom du titulaire",
  "E-mail",
  "Intitulé de la formation",
  "Mention",
  "Code RNCP",
  "Date d'obtention",
  "Référence école",
] as const;

function link(overrides: Partial<ShareLinkDTO> = {}): ShareLinkDTO {
  return {
    token: "tok-1",
    url: "https://wallet.example.test/verify/tok-1",
    expiresAt: null,
    revoked: false,
    createdAt: new Date().toISOString(),
    disclosedFields: [...DEFAULT_DISCLOSED_FIELDS],
    ...overrides,
  };
}

function renderPanel() {
  return render(
    <ToastProvider>
      <SharePanel diplomaId="diploma-1" initialLinks={[]} />
    </ToastProvider>,
  );
}

function checkbox(label: string): HTMLInputElement {
  return screen.getByRole("checkbox", { name: label });
}

beforeEach(() => {
  createShareLinkMock.mockReset();
});

describe("SharePanel — choix des champs divulgués", () => {
  it("rend les 7 cases à cocher", () => {
    renderPanel();
    for (const label of FIELD_LABELS) {
      expect(checkbox(label)).toBeInTheDocument();
    }
  });

  it("holderEmail est décoché par défaut ; le reste du défaut est coché", () => {
    renderPanel();
    expect(checkbox("E-mail")).not.toBeChecked();
    expect(checkbox("Référence école")).not.toBeChecked();

    expect(checkbox("Nom du titulaire")).toBeChecked();
    expect(checkbox("Intitulé de la formation")).toBeChecked();
    expect(checkbox("Mention")).toBeChecked();
    expect(checkbox("Code RNCP")).toBeChecked();
    expect(checkbox("Date d'obtention")).toBeChecked();
  });

  it("l'aperçu liste les champs cochés et se met à jour au clic", () => {
    renderPanel();

    // Défaut : 5 champs visibles, 2 masqués (holderEmail + externalId).
    expect(screen.getByText("Le recruteur verra :")).toBeInTheDocument();
    expect(screen.getByText("2 champs resteront masqués.")).toBeInTheDocument();

    // Cocher l'e-mail : 6 visibles, 1 masqué.
    fireEvent.click(checkbox("E-mail"));
    expect(screen.getByText("1 champ restera masqué.")).toBeInTheDocument();

    // Décocher la mention : le badge disparaît de l'aperçu.
    fireEvent.click(checkbox("Mention"));
    const preview = screen.getByText("Le recruteur verra :").parentElement as HTMLElement;
    expect(within(preview).queryByText("Mention")).toBeNull();
    expect(within(preview).getByText("Nom du titulaire")).toBeInTheDocument();
  });

  it("désactive le bouton de création quand 0 champ est coché", () => {
    renderPanel();
    for (const label of FIELD_LABELS) {
      if (checkbox(label).checked) fireEvent.click(checkbox(label));
    }

    expect(
      screen.getByText("Sélectionnez au moins un champ à révéler."),
    ).toBeInTheDocument();
    expect(screen.getByText("7 champs resteront masqués.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Créer un lien de partage" }),
    ).toBeDisabled();
    expect(createShareLinkMock).not.toHaveBeenCalled();
  });

  it("le payload envoyé contient exactement les champs cochés", async () => {
    createShareLinkMock.mockResolvedValueOnce(
      link({ disclosedFields: ["holderName", "programTitle"] }),
    );
    renderPanel();

    // Défaut → décocher mention, rncp, issuedAt ; cocher holderEmail.
    fireEvent.click(checkbox("Mention"));
    fireEvent.click(checkbox("Code RNCP"));
    fireEvent.click(checkbox("Date d'obtention"));
    fireEvent.click(checkbox("E-mail"));

    fireEvent.click(
      screen.getByRole("button", { name: "Créer un lien de partage" }),
    );

    await screen.findByText("Lien de partage créé");
    expect(createShareLinkMock).toHaveBeenCalledWith("diploma-1", {
      expiresInDays: null,
      disclosedFields: ["holderName", "holderEmail", "programTitle"],
    });
  });
});
