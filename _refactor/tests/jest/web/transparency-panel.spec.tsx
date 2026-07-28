/**
 * `TransparencyPanel` (v2.md §V3-4) — panneau piloté par le CLIENT, greffé sur
 * `/verify/[token]` et `/verifier`. `verifyTransparency` (100 % local) est
 * mocké : on prouve le contrat d'affichage, pas la cryptographie (déjà
 * couverte par les tests unitaires de `packages/shared/src/crypto`).
 *
 * Couvre : (a) rien n'est rendu quand `bundle.transparency` est absent/null ;
 * (b) « en attente de confirmation » vs « confirmé le » selon `otsUpgradedAt` ;
 * (c) avertissement NON bloquant quand `outcome.ok === false` ; (d) note de
 * liaison partielle quand `binding === "hash-only"`.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import type { ProofBundleDTO, TransparencyProofDTO } from "@certifychain/contract/dto";
import {
  verifyTransparency,
  type TransparencyOutcome,
} from "@certifychain/shared/crypto/verify-transparency";
import { TransparencyPanel } from "../../../apps/client/web/src/components/verify/TransparencyPanel";

jest.mock("@certifychain/shared/crypto/verify-transparency", () => ({
  verifyTransparency: jest.fn(),
}));

const verifyTransparencyMock = jest.mocked(verifyTransparency);

const DIPLOMA_ID = "22222222-2222-4222-8222-222222222222";

const SOME_PROOF: TransparencyProofDTO = {
  leafIndex: 4,
  leafHash: "a".repeat(64),
  auditPath: ["b".repeat(64)],
  checkpoint: {
    treeSize: 10,
    rootHash: "c".repeat(64),
    timestamp: "2026-07-01T10:00:00.000Z",
    signature: "c2ln",
    otsAnchored: false,
    otsUpgradedAt: null,
    otsProof: null,
  },
};

function makeBundle(
  transparency: ProofBundleDTO["transparency"] = null,
): ProofBundleDTO {
  return {
    engine: "ed25519-sd-v2",
    payload: {
      v: "sd-v2",
      h: "sha-256",
      id: DIPLOMA_ID,
      schoolId: "11111111-1111-4111-8111-111111111111",
      _sd: ["a", "b", "c"],
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
    },
    transparency,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("TransparencyPanel", () => {
  it("ne rend rien quand bundle.transparency est absent ou null", () => {
    const { container: withoutField } = render(
      <TransparencyPanel bundle={makeBundle(undefined)} />,
    );
    expect(withoutField).toBeEmptyDOMElement();

    const { container: withNull } = render(
      <TransparencyPanel bundle={makeBundle(null)} />,
    );
    expect(withNull).toBeEmptyDOMElement();

    expect(verifyTransparencyMock).not.toHaveBeenCalled();
  });

  it("affiche « en attente de confirmation » quand otsUpgradedAt est null", async () => {
    const bundle = makeBundle(SOME_PROOF);
    const outcome: TransparencyOutcome = {
      ok: true,
      binding: "full",
      leafIndex: 4,
      treeSize: 10,
      checkpointTimestamp: "2026-07-01T10:00:00.000Z",
      otsUpgradedAt: null,
    };
    verifyTransparencyMock.mockResolvedValue(outcome);

    render(<TransparencyPanel bundle={bundle} />);

    expect(await screen.findByText(/en attente de confirmation/)).toBeInTheDocument();
    expect(screen.queryByText(/confirmé le/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Liaison partielle/)).not.toBeInTheDocument();
    // Second arg = the pinned trust anchor (`TRUSTED_ROOTS`, `@/lib/trusted-roots`)
    // — root pinning fix (audit 2026-07-27); its content is covered elsewhere.
    expect(verifyTransparencyMock).toHaveBeenCalledWith(bundle, expect.anything());
  });

  it("affiche « confirmé le » quand otsUpgradedAt est renseigné", async () => {
    const bundle = makeBundle(SOME_PROOF);
    const outcome: TransparencyOutcome = {
      ok: true,
      binding: "full",
      leafIndex: 4,
      treeSize: 10,
      checkpointTimestamp: "2026-07-01T10:00:00.000Z",
      otsUpgradedAt: "2026-07-05T09:30:00.000Z",
    };
    verifyTransparencyMock.mockResolvedValue(outcome);

    render(<TransparencyPanel bundle={bundle} />);

    expect(await screen.findByText(/confirmé le/)).toBeInTheDocument();
    expect(screen.getByText(/racine ancrée dans Bitcoin/)).toBeInTheDocument();
    expect(screen.queryByText(/en attente de confirmation/)).not.toBeInTheDocument();
  });

  it("affiche un avertissement NON bloquant quand la vérification échoue", async () => {
    const bundle = makeBundle(SOME_PROOF);
    const outcome: TransparencyOutcome = {
      ok: false,
      reason: "leaf is not included in the checkpointed tree",
    };
    verifyTransparencyMock.mockResolvedValue(outcome);

    render(<TransparencyPanel bundle={bundle} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      /L'inscription au registre public n'a pas pu être vérifiée/,
    );
    // Non bloquant : le panneau précise explicitement que le verdict principal
    // de vérification du diplôme n'est PAS remis en cause.
    expect(alert).toHaveTextContent(
      /Le verdict de vérification du diplôme ci-dessus reste inchangé/,
    );
  });

  it("affiche une note de liaison partielle quand binding vaut hash-only", async () => {
    const bundle = makeBundle(SOME_PROOF);
    const outcome: TransparencyOutcome = {
      ok: true,
      binding: "hash-only",
      leafIndex: 2,
      treeSize: 5,
      checkpointTimestamp: "2026-07-01T10:00:00.000Z",
      otsUpgradedAt: "2026-07-05T09:30:00.000Z",
    };
    verifyTransparencyMock.mockResolvedValue(outcome);

    render(<TransparencyPanel bundle={bundle} />);

    expect(await screen.findByText(/Liaison partielle/)).toBeInTheDocument();
    expect(screen.getByText(/la date d'émission est masquée/)).toBeInTheDocument();
  });
});
