/**
 * Page publique /verify (v2) — le VERDICT AFFICHÉ est celui du CLIENT.
 *
 * `verifyProofBundle` (le vérificateur navigateur) et les endpoints réseau sont
 * mockés : on prouve que l'UI affiche « Vérifié » UNIQUEMENT quand le résultat
 * client est `ok` ET que la révocation est active — jamais sur la seule parole
 * du serveur. On couvre aussi le compteur de champs masqués, le bouton de
 * téléchargement et l'état « Révoqué » distinct.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ProofBundleDTO, VerificationResultDTO } from "@certifychain/contract/dto";
import { verifyProofBundle } from "@certifychain/shared/crypto/verify-bundle";
import { verifyChallenge, verifyProof } from "@/lib/api";
import { VerifyExperience } from "../../../apps/client/web/src/components/verify/VerifyExperience";

jest.mock("@/lib/api", () => ({
  verifyChallenge: jest.fn(),
  verifyProof: jest.fn(),
  checkRevocation: jest.fn(),
  ApiClientError: class ApiClientError extends Error {},
}));

jest.mock("@certifychain/shared/crypto/verify-bundle", () => ({
  verifyProofBundle: jest.fn(),
}));

const challengeMock = jest.mocked(verifyChallenge);
const proofMock = jest.mocked(verifyProof);
const verifyBundleMock = jest.mocked(verifyProofBundle);

const DIPLOMA_ID = "22222222-2222-4222-8222-222222222222";

function makeBundle(
  overrides: Partial<ProofBundleDTO["revocation"]> = {},
): ProofBundleDTO {
  return {
    engine: "ed25519-sd-v2",
    payload: {
      v: "sd-v2",
      h: "sha-256",
      id: DIPLOMA_ID,
      schoolId: "11111111-1111-4111-8111-111111111111",
      _sd: ["a", "b", "c", "d", "e", "f", "g"],
    },
    signature: "c2ln",
    disclosures: ["ZDE", "ZDI"],
    school: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "École Jest",
      publicKey: "-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----",
      certificate: "Y2VydA==",
      certIssuedAt: "2026-07-01",
    },
    root: { publicKey: "-----BEGIN PUBLIC KEY-----\nBBBB\n-----END PUBLIC KEY-----" },
    revocation: {
      checkedAt: "2026-07-13T10:20:00.000Z",
      status: "active",
      source: `http://localhost:4000/verify/revocation/${DIPLOMA_ID}`,
      ...overrides,
    },
  };
}

function v2Result(bundle: ProofBundleDTO, result = "verified"): VerificationResultDTO {
  return { result: result as VerificationResultDTO["result"], engine: "ed25519-sd-v2", proofBundle: bundle };
}

beforeEach(() => {
  jest.clearAllMocks();
  challengeMock.mockResolvedValue({ nonce: "nonce-1", expiresAt: "2026-07-13T10:00:00.000Z" });
});

describe("VerifyExperience — verdict piloté par le client", () => {
  it("affiche « Vérifié » quand le client est ok ET la révocation active, avec le compteur de champs masqués et le bouton de téléchargement", async () => {
    const bundle = makeBundle();
    proofMock.mockResolvedValue(v2Result(bundle));
    verifyBundleMock.mockResolvedValue({
      ok: true,
      disclosed: { holderName: "Alex Dubois", programTitle: "Master Data Science" },
      hidden: 5,
    });

    render(<VerifyExperience token="tok-1" />);

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("Diplôme vérifié");
    expect(screen.getByText("Alex Dubois")).toBeInTheDocument();
    expect(screen.getByText("Master Data Science")).toBeInTheDocument();
    // Compteur de champs masqués (jamais leur contenu).
    expect(screen.getAllByText("5 champs masqués").length).toBeGreaterThan(0);
    // La phrase honnête « dans votre navigateur ».
    expect(screen.getByText("dans votre navigateur")).toBeInTheDocument();
    // Bouton de téléchargement présent.
    expect(
      screen.getByRole("button", { name: /Télécharger la preuve/ }),
    ).toBeInTheDocument();
  });

  it("N'affiche PAS « Vérifié » si le client échoue, même si le serveur dit verified (le client fait foi)", async () => {
    const bundle = makeBundle();
    proofMock.mockResolvedValue(v2Result(bundle, "verified"));
    verifyBundleMock.mockResolvedValue({ ok: false, reason: "invalid school signature" });

    render(<VerifyExperience token="tok-2" />);

    // PLAN.md P6 (fusion publique 5 → 2) : le titre affiché est le même
    // générique « Diplôme introuvable » quelle que soit la raison interne
    // (ici : crypto invalide) — voir `failed-card.spec.tsx` pour la preuve
    // que les 4 états non-vérifiés rendent tous ce même titre.
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("Diplôme introuvable");
    expect(screen.queryByText("Diplôme vérifié")).not.toBeInTheDocument();
    // Second arg = the pinned trust anchor (`TRUSTED_ROOTS`, `@/lib/trusted-roots`)
    // — root pinning fix (audit 2026-07-27). Not asserting its exact value here:
    // that anchor's own content is covered by `verify-bundle-root-pinning.spec.ts`.
    expect(verifyBundleMock).toHaveBeenCalledWith(bundle, expect.anything());
  });

  it("ne montre jamais « Vérifié » quand revocation.status === revoked, même si la crypto est valide — même carte fusionnée que l'invalide (P6)", async () => {
    const bundle = makeBundle({ status: "revoked" });
    proofMock.mockResolvedValue(v2Result(bundle, "verified"));
    verifyBundleMock.mockResolvedValue({ ok: true, disclosed: {}, hidden: 7 });

    render(<VerifyExperience token="tok-3" />);

    // Même titre générique que le cas "invalide" ci-dessus : la fusion 5 → 2
    // ne doit jamais redevenir un prétexte à afficher « Vérifié » (v2.md
    // piège n°5), ET elle ne doit plus exposer publiquement laquelle des 2
    // raisons internes (révoqué vs crypto invalide) s'est produite.
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("Diplôme introuvable");
    expect(screen.queryByText("Diplôme vérifié")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Télécharger la preuve/ }),
    ).not.toBeInTheDocument();
  });

  it("le bouton de téléchargement produit un blob local du bundle brut", async () => {
    const bundle = makeBundle();
    proofMock.mockResolvedValue(v2Result(bundle));
    verifyBundleMock.mockResolvedValue({ ok: true, disclosed: { holderName: "Alex" }, hidden: 6 });

    const createObjectURL = jest.fn(() => "blob:preuve");
    const revokeObjectURL = jest.fn();
    const anchorClick = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });

    render(<VerifyExperience token="tok-4" />);
    const button = await screen.findByRole("button", { name: /Télécharger la preuve/ });
    fireEvent.click(button);

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(anchorClick).toHaveBeenCalledTimes(1);
    anchorClick.mockRestore();
  });
});
