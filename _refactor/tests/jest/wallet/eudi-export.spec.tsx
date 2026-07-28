/** Wallet EUDI — offre OpenID4VCI courte durée, sans logique d'éligibilité client. */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";

import type { EudiOfferDTO } from "@certifychain/contract/dto";
import { ApiClientError } from "@certifychain/shared/api/client";
import { EudiExportAction } from "../../../apps/client/wallet/src/components/wallet/EudiExportAction";
import { createEudiOffer } from "@/lib/api/endpoints";

jest.mock("@/lib/api/endpoints", () => ({
  createEudiOffer: jest.fn(),
}));

jest.mock(
  "qrcode.react",
  () => ({
    QRCodeCanvas: ({
      value,
      "aria-label": ariaLabel,
      "data-testid": testId,
    }: {
      value: string;
      "aria-label"?: string;
      "data-testid"?: string;
    }) => (
      <div
        role="img"
        aria-label={ariaLabel}
        data-testid={testId}
        data-value={value}
      />
    ),
  }),
  { virtual: true },
);

const createEudiOfferMock = jest.mocked(createEudiOffer);
const clipboardWrite = jest.fn<Promise<void>, [string]>();

function offer(overrides: Partial<EudiOfferDTO> = {}): EudiOfferDTO {
  return {
    offerDeepLink:
      "openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fapi.example.test%2Fvc%2Foffers%2Foffer-1",
    txCode: "48217",
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  createEudiOfferMock.mockReset();
  clipboardWrite.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboardWrite },
  });
});

describe("EudiExportAction", () => {
  it("n'affiche aucune action quand le serveur déclare l'export indisponible", () => {
    const { container } = render(
      <EudiExportAction diplomaId="diploma-1" available={false} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByRole("button", { name: /portefeuille européen/i }),
    ).toBeNull();
    expect(createEudiOfferMock).not.toHaveBeenCalled();
  });

  it("ouvre une modale avec QR, tx_code et compte à rebours", async () => {
    createEudiOfferMock.mockResolvedValueOnce(offer());
    render(<EudiExportAction diplomaId="diploma-1" available />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Ajouter à mon portefeuille européen (EUDI)",
      }),
    );

    expect(
      screen.getByRole("dialog", {
        name: "Ajouter ce diplôme à votre EUDI Wallet",
      }),
    ).toBeInTheDocument();
    const qr = await screen.findByRole("img", {
      name: "QR code de l’offre EUDI",
    });
    expect(qr.getAttribute("data-value")).toMatch(
      /^openid-credential-offer:\/\//,
    );
    expect(screen.getByText("48217")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent(/^\d{2}:\d{2}$/);
    expect(screen.getByText(/ne le partagez pas/i)).toBeInTheDocument();
    expect(createEudiOfferMock).toHaveBeenCalledWith("diploma-1");
  });

  it("copie uniquement le code de transaction", async () => {
    createEudiOfferMock.mockResolvedValueOnce(offer());
    render(<EudiExportAction diplomaId="diploma-1" available />);
    fireEvent.click(
      screen.getByRole("button", { name: /ajouter à mon portefeuille européen/i }),
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Copier le code de transaction",
      }),
    );

    expect(clipboardWrite).toHaveBeenCalledWith("48217");
    expect(await screen.findByText("Code copié.")).toBeInTheDocument();
  });

  it("affiche les erreurs API dans une alerte accessible", async () => {
    createEudiOfferMock.mockRejectedValueOnce(
      new ApiClientError("Export EUDI temporairement indisponible", {
        code: "not_found",
        status: 404,
      }),
    );
    render(<EudiExportAction diplomaId="diploma-1" available />);

    fireEvent.click(
      screen.getByRole("button", { name: /ajouter à mon portefeuille européen/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Export EUDI temporairement indisponible",
    );
    expect(screen.queryByTestId("eudi-offer-qr")).toBeNull();
  });

  // Audit R6 — cette route est rate-limitée par élève (`VC_OFFER`, voir
  // `apps/server/src/config/constants.ts`) : un 429 doit nommer le délai
  // concret plutôt qu'afficher un message générique.
  it("affiche le délai d'attente concret sur un rate-limit (429)", async () => {
    createEudiOfferMock.mockRejectedValueOnce(
      new ApiClientError("Trop de requêtes, réessayez plus tard", {
        code: "rate_limited",
        status: 429,
        retryAfterSeconds: 30,
      }),
    );
    render(<EudiExportAction diplomaId="diploma-1" available />);

    fireEvent.click(
      screen.getByRole("button", { name: /ajouter à mon portefeuille européen/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Trop de requêtes. Réessayez dans 30 s.",
    );
  });

  // Sans délai exploitable, dégradation propre : un message générique, mais
  // toujours pas un délai inventé.
  it("dégrade proprement un rate-limit (429) sans délai connu", async () => {
    createEudiOfferMock.mockRejectedValueOnce(
      new ApiClientError("Trop de requêtes, réessayez plus tard", {
        code: "rate_limited",
        status: 429,
      }),
    );
    render(<EudiExportAction diplomaId="diploma-1" available />);

    fireEvent.click(
      screen.getByRole("button", { name: /ajouter à mon portefeuille européen/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Trop de requêtes, réessayez plus tard",
    );
  });

  it("régénère l'offre et remplace le QR ainsi que le tx_code", async () => {
    createEudiOfferMock
      .mockResolvedValueOnce(offer())
      .mockResolvedValueOnce(
        offer({
          offerDeepLink:
            "openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fapi.example.test%2Fvc%2Foffers%2Foffer-2",
          txCode: "90351",
        }),
      );
    render(<EudiExportAction diplomaId="diploma-1" available />);
    fireEvent.click(
      screen.getByRole("button", { name: /ajouter à mon portefeuille européen/i }),
    );
    expect(await screen.findByText("48217")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Régénérer l’offre" }));

    expect(await screen.findByText("90351")).toBeInTheDocument();
    expect(screen.queryByText("48217")).toBeNull();
    expect(screen.getByTestId("eudi-offer-qr")).toHaveAttribute(
      "data-value",
      expect.stringContaining("offer-2"),
    );
    expect(createEudiOfferMock).toHaveBeenCalledTimes(2);
  });
});
