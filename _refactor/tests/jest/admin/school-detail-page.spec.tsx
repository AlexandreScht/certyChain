/**
 * Console admin — page détail école, dégel des émissions (v2.md §V3-6).
 *
 * Piège d'outillage : contrairement aux projets Jest "web" et "wallet", le
 * projet "admin" (jest.config.cjs) ne déclare AUCUN alias `@/…` dans son
 * moduleNameMapper — seuls les specs important les sources via chemin relatif
 * existaient jusqu'ici (score-gauge.spec.tsx, audit-labels.spec.ts). Cette page
 * importe `@/lib/api/endpoints`, `@/lib/api/client` et `@/components/admin`,
 * qui ne se résolvent donc ni depuis ce fichier de test ni depuis la page. On
 * mocke ces trois imports avec `{ virtual: true }` : jest-resolve enregistre
 * les mocks virtuels de spécificateurs NON relatifs sous la chaîne littérale
 * elle-même (indépendamment du fichier appelant), donc le mock déclaré ici
 * s'applique aussi au require() interne de la page (vérifié dans
 * jest-resolve/build/index.js — `getModulePath` retourne `moduleName` tel
 * quel dès qu'il ne commence pas par "."). `next/navigation` a le même
 * problème (pas de symlink `next` à la racine du monorepo) et reçoit le même
 * traitement.
 */
import "@testing-library/jest-dom";
import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@certifychain/shared/ui";
import type { AdminSchoolDetailDTO } from "@certifychain/contract/dto";
import SchoolDetailPage from "../../../apps/client/admin/src/app/schools/[id]/page";
import { getAdminSchool, unfreezeSchool } from "@/lib/api/endpoints";

const SCHOOL_ID = "11111111-1111-4111-8111-111111111111";

jest.mock(
  "next/navigation",
  () => ({
    useParams: () => ({ id: "11111111-1111-4111-8111-111111111111" }),
    useRouter: () => ({ push: () => {} }),
  }),
  { virtual: true },
);

jest.mock(
  "@/lib/api/endpoints",
  () => ({
    getAdminSchool: jest.fn(),
    approveSchool: jest.fn(),
    rejectSchool: jest.fn(),
    revokeSchool: jest.fn(),
    unfreezeSchool: jest.fn(),
    revalidateSchool: jest.fn(),
    setSchoolCdcEnabled: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  "@/lib/api/client",
  () => ({
    ApiClientError: class ApiClientError extends Error {},
    // Minimal stand-in matching the real `apiErrorMessage` contract closely
    // enough for this page: real ApiClientError → its message, anything else
    // → a generic fallback (never a raw exception).
    apiErrorMessage: (err: unknown, fallback = "Une erreur inattendue est survenue.") =>
      err instanceof Error ? err.message : fallback,
  }),
  { virtual: true },
);

// Composants purement présentationnels : stubbés pour isoler le test des
// détails d'implémentation de FadeIn/ScoreGauge/SchoolStatusBadge (déjà
// couverts par leurs propres specs, ex. score-gauge.spec.tsx).
jest.mock(
  "@/components/admin",
  () => ({
    FadeIn: ({ children }: { children?: ReactNode }) => <>{children}</>,
    ScoreGauge: () => null,
    SchoolStatusBadge: () => null,
  }),
  { virtual: true },
);

const getAdminSchoolMock = jest.mocked(getAdminSchool);
const unfreezeSchoolMock = jest.mocked(unfreezeSchool);

function makeSchool(overrides: Partial<AdminSchoolDetailDTO> = {}): AdminSchoolDetailDTO {
  return {
    id: SCHOOL_ID,
    name: "École Test",
    status: "approved",
    siret: "12345678901234",
    uai: null,
    city: "Paris",
    verifiedOfficialDomain: null,
    contactEmail: "contact@ecole.test",
    hasKeys: true,
    cdcEnabled: false,
    validationScore: 90,
    validationReasoning: null,
    validationModel: null,
    validatedAt: null,
    autoValidated: false,
    sireneVerified: null,
    sireneLegalName: null,
    validationSignals: null,
    statusReason: null,
    issuanceFrozenAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    approvedAt: "2026-01-02T00:00:00.000Z",
    reviewedAt: null,
    admins: [],
    stats: {
      totalDiplomas: 3,
      activeDiplomas: 3,
      revokedDiplomas: 0,
      verifications: 5,
      lastIssuedAt: null,
    },
    recentAudit: [],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <ToastProvider>
      <SchoolDetailPage />
    </ToastProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Page détail école admin — dégel des émissions (V3)", () => {
  it("n'affiche pas le bouton « Dégeler » quand les émissions ne sont pas gelées", async () => {
    getAdminSchoolMock.mockResolvedValue(makeSchool({ issuanceFrozenAt: null }));
    renderPage();

    expect(await screen.findByText("École Test")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Dégeler les émissions/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/signalement au journal de transparence/i)).not.toBeInTheDocument();
  });

  it("affiche l'alerte et le bouton « Dégeler » quand les émissions sont gelées", async () => {
    getAdminSchoolMock.mockResolvedValue(
      makeSchool({ issuanceFrozenAt: "2026-07-10T08:00:00.000Z" }),
    );
    renderPage();

    expect(await screen.findByText(/signalement au journal de transparence/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dégeler les émissions/ })).toBeInTheDocument();
  });

  it("confirme le dégel dans la modale, appelle unfreezeSchool et rafraîchit la page avec le DTO renvoyé", async () => {
    getAdminSchoolMock.mockResolvedValue(
      makeSchool({ issuanceFrozenAt: "2026-07-10T08:00:00.000Z" }),
    );
    unfreezeSchoolMock.mockResolvedValue(makeSchool({ issuanceFrozenAt: null }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Dégeler les émissions/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Dégeler les émissions ?")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmer" }));

    await waitFor(() => expect(unfreezeSchoolMock).toHaveBeenCalledWith(SCHOOL_ID));
    // Le DTO renvoyé par l'appel remplace l'état local : la bannière et le
    // bouton disparaissent, la modale se referme.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Dégeler les émissions/ })).not.toBeInTheDocument(),
    );
    // Le Modal ferme via une sortie animée (framer-motion) : attendre le
    // démontage plutôt que l'asserter en synchrone (source de flakiness).
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("« Annuler » ferme la modale sans appeler unfreezeSchool", async () => {
    getAdminSchoolMock.mockResolvedValue(
      makeSchool({ issuanceFrozenAt: "2026-07-10T08:00:00.000Z" }),
    );
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Dégeler les émissions/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Annuler" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(unfreezeSchoolMock).not.toHaveBeenCalled();
  });
});
