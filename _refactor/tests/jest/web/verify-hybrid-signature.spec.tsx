/**
 * Vague 2 (v4-front) — V4-b : affichage honnête de la double signature
 * hybride (v2.md §V4-1) sur `/verify/[token]` (`VerifyExperience` →
 * `VerifiedBundleCard`) et sur `/verifier` (`OfflineVerifier`). Un bundle
 * "sd-v3" (`engine: "ed25519-sd-v3"`) porte une signature Ed25519 ET une
 * signature ML-DSA-65 ; le front doit le dire factuellement. Un bundle
 * "sd-v2" ne doit PORTER AUCUN signal — une preuve v2 n'est pas « faible »,
 * juste antérieure au post-quantique (brief §2.1).
 *
 * Couvre aussi le câblage `apiErrorMessage` sur le contrôle de révocation de
 * `OfflineVerifier` (audit R6) : `/verify/revocation/:id` est lui-même
 * rate-limité par IP, et avant ce correctif un 429 y affichait le même texte
 * générique figé qu'un problème réseau quelconque.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ProofBundleDTO, VerificationResultDTO } from "@certifychain/contract/dto";
import { verifyProofBundle } from "@certifychain/shared/crypto/verify-bundle";
import { ApiClientError, checkRevocation, verifyChallenge, verifyProof } from "@/lib/api";
import { VerifyExperience } from "../../../apps/client/web/src/components/verify/VerifyExperience";
import { OfflineVerifier } from "../../../apps/client/web/src/components/verify/OfflineVerifier";

jest.mock("@/lib/api", () => {
  // Real `ApiClientError` + `apiErrorMessage` (not hand-rolled stand-ins):
  // `apiErrorMessage`'s real implementation does `error instanceof
  // ApiClientError` against the REAL class from
  // `@certifychain/shared/api/client` — a look-alike class here would silently
  // fail that check and always fall back to the generic message, defeating
  // the rate-limit test below.
  const client = jest.requireActual("@certifychain/shared/api/client");
  const errorMessage = jest.requireActual("@certifychain/shared/api/error-message");
  return {
    verifyChallenge: jest.fn(),
    verifyProof: jest.fn(),
    checkRevocation: jest.fn(),
    ApiClientError: client.ApiClientError,
    apiErrorMessage: errorMessage.apiErrorMessage,
  };
});

jest.mock("@certifychain/shared/crypto/verify-bundle", () => ({
  verifyProofBundle: jest.fn(),
}));

const challengeMock = jest.mocked(verifyChallenge);
const proofMock = jest.mocked(verifyProof);
const checkRevocationMock = jest.mocked(checkRevocation);
const verifyBundleMock = jest.mocked(verifyProofBundle);

const DIPLOMA_ID = "33333333-3333-4333-8333-333333333333";
const SCHOOL_ID = "11111111-1111-4111-8111-111111111111";

function makeV2Bundle(): ProofBundleDTO {
  return {
    engine: "ed25519-sd-v2",
    payload: {
      v: "sd-v2",
      h: "sha-256",
      id: DIPLOMA_ID,
      schoolId: SCHOOL_ID,
      _sd: ["a", "b", "c", "d", "e", "f", "g"],
    },
    signature: "c2ln",
    disclosures: ["ZDE"],
    school: {
      id: SCHOOL_ID,
      name: "École v2",
      publicKey: "-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----",
      certificate: "Y2VydA==",
      certIssuedAt: "2026-07-01",
    },
    root: { publicKey: "-----BEGIN PUBLIC KEY-----\nBBBB\n-----END PUBLIC KEY-----" },
    revocation: {
      checkedAt: "2026-07-27T10:00:00.000Z",
      status: "active",
      source: `http://localhost:4000/verify/revocation/${DIPLOMA_ID}`,
    },
  };
}

function makeV3Bundle(): ProofBundleDTO {
  const v2 = makeV2Bundle();
  return {
    ...v2,
    engine: "ed25519-sd-v3",
    payload: { ...v2.payload, v: "sd-v3" },
    signaturePq: "cHFzaWc=",
    school: { ...v2.school, publicKeyPq: "cHFwdWI=", certificatePq: "cHFjZXJ0" },
    root: { ...v2.root, publicKeyPq: "cHFyb290" },
  };
}

function resultOf(bundle: ProofBundleDTO): VerificationResultDTO {
  return { result: "verified", engine: bundle.engine, proofBundle: bundle };
}

beforeEach(() => {
  jest.clearAllMocks();
  challengeMock.mockResolvedValue({ nonce: "nonce-1", expiresAt: "2026-07-27T10:00:00.000Z" });
});

describe("Double signature hybride (V4-b) — VerifiedBundleCard (/verify/[token])", () => {
  it("affiche « Double signature vérifiée » pour un bundle v3 (ed25519-sd-v3)", async () => {
    const bundle = makeV3Bundle();
    proofMock.mockResolvedValue(resultOf(bundle));
    verifyBundleMock.mockResolvedValue({ ok: true, disclosed: {}, hidden: 7 });

    render(<VerifyExperience token="tok-v3" />);

    // The verdict heading text is split across nodes (`Diplôme <span>vérifié</span>`)
    // — query by role/level (same pattern as `verify-page.spec.tsx`) rather
    // than an exact `findByText`, which would never match split text.
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("Diplôme vérifié");
    expect(screen.getByText("Double signature vérifiée")).toBeInTheDocument();
    const normalized = document.body.textContent?.replace(/\s+/g, " ") ?? "";
    expect(normalized).toContain("Ed25519 et post-quantique (ML-DSA-65)");
  });

  it("n'affiche AUCUNE mention post-quantique pour un bundle v2 — une preuve v2 n'est pas « faible »", async () => {
    const bundle = makeV2Bundle();
    proofMock.mockResolvedValue(resultOf(bundle));
    verifyBundleMock.mockResolvedValue({ ok: true, disclosed: {}, hidden: 6 });

    render(<VerifyExperience token="tok-v2" />);

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("Diplôme vérifié");
    expect(screen.queryByText("Double signature vérifiée")).not.toBeInTheDocument();
    expect(screen.queryByText(/post-quantique/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ML-DSA/i)).not.toBeInTheDocument();
  });
});

describe("Double signature hybride (V4-b) — OfflineVerifier (/verifier)", () => {
  it("affiche « Double signature vérifiée » hors ligne pour un bundle v3 collé", async () => {
    const bundle = makeV3Bundle();
    verifyBundleMock.mockResolvedValue({ ok: true, disclosed: {}, hidden: 7 });

    render(<OfflineVerifier />);
    fireEvent.change(screen.getByLabelText("Preuve (JSON)"), {
      target: { value: JSON.stringify(bundle) },
    });
    fireEvent.click(screen.getByRole("button", { name: /Vérifier hors ligne/ }));

    await screen.findByText("Preuve valide");
    expect(screen.getByText("Double signature vérifiée")).toBeInTheDocument();
  });

  it("n'affiche rien de post-quantique hors ligne pour un bundle v2 collé", async () => {
    const bundle = makeV2Bundle();
    verifyBundleMock.mockResolvedValue({ ok: true, disclosed: {}, hidden: 6 });

    render(<OfflineVerifier />);
    fireEvent.change(screen.getByLabelText("Preuve (JSON)"), {
      target: { value: JSON.stringify(bundle) },
    });
    fireEvent.click(screen.getByRole("button", { name: /Vérifier hors ligne/ }));

    await screen.findByText("Preuve valide");
    expect(screen.queryByText("Double signature vérifiée")).not.toBeInTheDocument();
  });
});

describe("Contrôle de révocation hors ligne — message de rate-limit câblé (audit R6)", () => {
  it("affiche « Trop de requêtes… » sur un 429 avec délai, au lieu du texte générique figé", async () => {
    const bundle = makeV2Bundle();
    verifyBundleMock.mockResolvedValue({ ok: true, disclosed: {}, hidden: 6 });
    checkRevocationMock.mockRejectedValue(
      new ApiClientError("Trop de requêtes.", {
        code: "rate_limited",
        status: 429,
        retryAfterSeconds: 42,
      }),
    );

    render(<OfflineVerifier />);
    fireEvent.change(screen.getByLabelText("Preuve (JSON)"), {
      target: { value: JSON.stringify(bundle) },
    });
    fireEvent.click(screen.getByRole("button", { name: /Vérifier hors ligne/ }));
    await screen.findByText("Preuve valide");

    fireEvent.click(screen.getByRole("button", { name: /Vérifier la révocation/ }));

    await waitFor(() =>
      expect(screen.getByText(/Trop de requêtes\. Réessayez dans 42 s\./)).toBeInTheDocument(),
    );
  });

  it("un 404 reste distinct (« révoqué ou inconnu »), jamais confondu avec le rate-limit", async () => {
    const bundle = makeV2Bundle();
    verifyBundleMock.mockResolvedValue({ ok: true, disclosed: {}, hidden: 6 });
    checkRevocationMock.mockRejectedValue(new ApiClientError("Not found", { status: 404 }));

    render(<OfflineVerifier />);
    fireEvent.change(screen.getByLabelText("Preuve (JSON)"), {
      target: { value: JSON.stringify(bundle) },
    });
    fireEvent.click(screen.getByRole("button", { name: /Vérifier hors ligne/ }));
    await screen.findByText("Preuve valide");

    fireEvent.click(screen.getByRole("button", { name: /Vérifier la révocation/ }));

    await waitFor(() => expect(screen.getByText(/Révoqué ou inconnu/)).toBeInTheDocument());
  });
});
