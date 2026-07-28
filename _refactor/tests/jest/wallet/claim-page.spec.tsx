/**
 * Wallet — page de récupération (`/claim/[token]`), régression audit R3 :
 * un `catch` qui ne traitait que `ApiClientError` avalait silencieusement
 * toute autre exception (panne réseau imprévue, bug) — l'élève ne voyait
 * jamais aucun retour. Les 3 catches concernés (renvoi de lien, demande de
 * code, vérification du code) doivent désormais toujours afficher un toast,
 * avec un message générique et non technique quand ce n'est pas une
 * `ApiClientError`.
 */
import "@testing-library/jest-dom";
import { Suspense } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import type { ClaimInfoDTO } from "@certifychain/contract/dto";
import { ToastProvider } from "@certifychain/shared/ui";
import ClaimPage from "../../../apps/client/wallet/src/app/claim/[token]/page";
import {
  getClaimInfo,
  requestClaimOtp,
  verifyClaimOtp,
  resendClaim,
} from "@/lib/api/endpoints";

jest.mock("@/lib/api/endpoints", () => ({
  getClaimInfo: jest.fn(),
  requestClaimOtp: jest.fn(),
  verifyClaimOtp: jest.fn(),
  resendClaim: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const getClaimInfoMock = jest.mocked(getClaimInfo);
const requestClaimOtpMock = jest.mocked(requestClaimOtp);
const verifyClaimOtpMock = jest.mocked(verifyClaimOtp);
const resendClaimMock = jest.mocked(resendClaim);

const GENERIC_MESSAGE = "Une erreur inattendue est survenue. Réessayez dans quelques instants.";

function pendingInfo(overrides: Partial<ClaimInfoDTO> = {}): ClaimInfoDTO {
  return {
    status: "pending",
    schoolName: "École Test",
    diplomaCount: 1,
    maskedEmail: "al••••@ecole.test",
    ...overrides,
  };
}

// `ClaimPage` reads its route param via React's `use(params)`: the first
// render suspends until the promise settles, even when it's already
// resolved (promise settlement is always a microtask). `act(async …)` flushes
// that microtask + the retry render before the test proceeds.
async function renderPage() {
  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(
      <ToastProvider>
        <Suspense fallback={<div>Chargement…</div>}>
          <ClaimPage params={Promise.resolve({ token: "tok-1" })} />
        </Suspense>
      </ToastProvider>,
    );
  });
  return utils;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Page de récupération wallet — retour générique sur exception inattendue (R3)", () => {
  it("demande de code (email) : affiche un toast générique sur une exception qui n'est pas une ApiClientError", async () => {
    getClaimInfoMock.mockResolvedValue(pendingInfo());
    requestClaimOtpMock.mockRejectedValueOnce(new TypeError("network is offline"));
    await renderPage();

    fireEvent.change(await screen.findByPlaceholderText("vous@exemple.fr"), {
      target: { value: "eleve@exemple.fr" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Recevoir mon code" }));

    expect(await screen.findByText("Envoi impossible")).toBeInTheDocument();
    expect(await screen.findByText(GENERIC_MESSAGE)).toBeInTheDocument();
  });

  it("vérification du code : affiche un toast générique (et non « Code invalide ») sur une exception inattendue", async () => {
    getClaimInfoMock.mockResolvedValue(pendingInfo());
    requestClaimOtpMock.mockResolvedValueOnce({ ok: true });
    verifyClaimOtpMock.mockRejectedValueOnce(new TypeError("unexpected"));
    await renderPage();

    fireEvent.change(await screen.findByPlaceholderText("vous@exemple.fr"), {
      target: { value: "eleve@exemple.fr" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Recevoir mon code" }));

    fireEvent.change(await screen.findByPlaceholderText("123456"), {
      target: { value: "123456" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Relier et accéder à mon portefeuille" }),
    );

    // The title stays honest: this failure isn't actually about the code.
    expect(await screen.findByText("Vérification impossible")).toBeInTheDocument();
    expect(screen.queryByText("Code invalide")).not.toBeInTheDocument();
    // Shown twice: the inline field error AND the toast description — both
    // now carry the generic message instead of one of them staying silent.
    expect((await screen.findAllByText(GENERIC_MESSAGE)).length).toBeGreaterThanOrEqual(2);
  });

  it("renvoi de lien (état expiré) : affiche un toast générique sur une exception inattendue", async () => {
    getClaimInfoMock.mockResolvedValue(pendingInfo({ status: "expired" }));
    resendClaimMock.mockRejectedValueOnce(new TypeError("network is offline"));
    await renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Renvoyer un lien" }));

    expect(await screen.findByText("Envoi impossible")).toBeInTheDocument();
    expect(await screen.findByText(GENERIC_MESSAGE)).toBeInTheDocument();
  });
});
