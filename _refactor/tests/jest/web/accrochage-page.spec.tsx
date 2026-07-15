import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@certifychain/shared/ui";
import AccrochagePage from "../../../apps/client/web/src/app/(school)/ecole/accrochage/page";
import {
  getCdcExport,
  getCdcSettings,
  importCdcIdentitiesCsv,
  listCdcEligibleDiplomas,
  listCdcExports,
} from "@/lib/api/endpoints";

jest.mock("@/lib/api/endpoints", () => ({
  cancelCdcExport: jest.fn(),
  createCdcExport: jest.fn(),
  deleteCdcIdentity: jest.fn(),
  downloadCdcExport: jest.fn(),
  getCdcExport: jest.fn(),
  getCdcSettings: jest.fn(),
  importCdcIdentitiesCsv: jest.fn(),
  listCdcEligibleDiplomas: jest.fn(),
  listCdcExports: jest.fn(),
  markCdcExportSubmitted: jest.fn(),
  saveCdcIdentity: jest.fn(),
  updateCdcSettings: jest.fn(),
  uploadCdcCrt: jest.fn(),
}));

const getSettingsMock = jest.mocked(getCdcSettings);
const getExportMock = jest.mocked(getCdcExport);
const eligibleMock = jest.mocked(listCdcEligibleDiplomas);
const exportsMock = jest.mocked(listCdcExports);
const importMock = jest.mocked(importCdcIdentitiesCsv);

const enabledSettings = {
  enabled: true,
  certificateurSiret: "12345678901234",
  contactEmail: "cdc@ecole.test",
  emitterIdClient: "EMET0001",
  certificateurIdClient: "CERT0001",
  contractId: "CONTRAT-1",
} as const;

const eligible = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    holderName: "Camille Exemple",
    programTitle: "Titre de démonstration",
    rncp: "RNCP12345",
    issuedAt: "2026-06-01",
    identityComplete: false,
    inFlight: false,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    holderName: "Alex Démonstration",
    programTitle: "Titre avancé",
    rncp: "RNCP54321",
    issuedAt: "2026-06-02",
    identityComplete: true,
    inFlight: false,
  },
] as const;

const resolvedExport = {
  id: "33333333-3333-4333-8333-333333333333",
  status: "partially_rejected",
  fileName: "cdc-lot-2026.xml",
  fileSha256: "a".repeat(64),
  generatedAt: "2026-06-03T08:00:00.000Z",
  submittedAt: "2026-06-03T09:00:00.000Z",
  resolvedAt: "2026-06-04T10:00:00.000Z",
  counts: { total: 2, accepted: 1, rejected: 1, pending: 0 },
} as const;

const resolvedExportDetail = {
  ...resolvedExport,
  items: [
    {
      diplomaId: "44444444-4444-4444-8444-444444444444",
      holderName: "Lina Acceptée",
      programTitle: "Certification A",
      status: "accepted",
      rejectCode: null,
      rejectReason: null,
    },
    {
      diplomaId: "55555555-5555-4555-8555-555555555555",
      holderName: "Noé Refusé",
      programTitle: "Certification B",
      status: "rejected",
      rejectCode: "CDC-IDENTITE-42",
      rejectReason: "Nom de naissance incohérent",
    },
  ],
} as const;

function renderPage() {
  return render(
    <ToastProvider>
      <AccrochagePage />
    </ToastProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  eligibleMock.mockResolvedValue([...eligible]);
  exportsMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
  getExportMock.mockResolvedValue(resolvedExportDetail);
  importMock.mockResolvedValue({ imported: 1, errors: [] });
});

describe("Page Accrochage CDC", () => {
  it("rend les quatre blocs et l’état explicatif lorsque le module est désactivé", async () => {
    getSettingsMock.mockResolvedValue({
      ...enabledSettings,
      enabled: false,
      emitterIdClient: null,
      certificateurIdClient: null,
      contractId: null,
    });
    renderPage();

    expect(await screen.findByText("Votre module n’est pas encore activé")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /1\. État et configuration/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /2\. Préparation des identités/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /3\. Génération et dépôt/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /4\. Historique des lots/ })).toBeInTheDocument();
    expect(eligibleMock).not.toHaveBeenCalled();
  });

  it("signale l’identité manquante et garde le NIR masqué dans la saisie unitaire", async () => {
    getSettingsMock.mockResolvedValue(enabledSettings);
    renderPage();

    expect(await screen.findByText("Camille Exemple")).toBeInTheDocument();
    expect(screen.getByText("Manquante")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Renseigner" }));

    const nir = screen.getByLabelText(/NIR complet avec clé/);
    expect(nir).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Afficher le NIR" }));
    expect(nir).toHaveAttribute("type", "text");
  });

  it("transmet le CSV sélectionné puis recharge les données sans lire de NIR côté client", async () => {
    getSettingsMock.mockResolvedValue(enabledSettings);
    renderPage();
    const input = await screen.findByLabelText("Fichier CSV d’identités CDC");
    const file = new File(
      ["diploma_id,external_id,nir,nom_naissance,obtention_certification\n"],
      "identites.csv",
      { type: "text/csv" },
    );

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(importMock).toHaveBeenCalledWith(file));
    await waitFor(() => expect(eligibleMock).toHaveBeenCalledTimes(2));
  });

  it("distingue une panne inattendue d’un module réellement désactivé et permet de réessayer", async () => {
    getSettingsMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(enabledSettings);
    renderPage();

    expect(await screen.findByText("Le module ne peut pas être chargé")).toBeInTheDocument();
    expect(screen.getAllByText(/erreur inattendue/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("Votre module n’est pas encore activé")).not.toBeInTheDocument();
    expect(screen.getAllByText("Données temporairement indisponibles")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));

    expect(await screen.findByText("Camille Exemple")).toBeInTheDocument();
    expect(getSettingsMock).toHaveBeenCalledTimes(2);
  });

  it("charge à la demande et affiche les items du CRT avec le code et la raison du rejet", async () => {
    getSettingsMock.mockResolvedValue(enabledSettings);
    exportsMock.mockResolvedValue({
      items: [resolvedExport],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Voir le détail" }));

    await waitFor(() => expect(getExportMock).toHaveBeenCalledWith(resolvedExport.id));
    expect(await screen.findByText("Lina Acceptée")).toBeInTheDocument();
    expect(screen.getByText("Noé Refusé")).toBeInTheDocument();
    expect(screen.getByText("CDC-IDENTITE-42")).toBeInTheDocument();
    expect(screen.getByText("Nom de naissance incohérent")).toBeInTheDocument();
  });

  it("diffère la révocation de l’object URL après avoir déclenché le téléchargement", async () => {
    getSettingsMock.mockResolvedValue(enabledSettings);
    const createObjectURL = jest.fn(() => "blob:cdc-template");
    const revokeObjectURL = jest.fn();
    const anchorClick = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    renderPage();

    const downloadButton = await screen.findByRole("button", { name: "Modèle CSV" });
    jest.useFakeTimers();
    try {
      fireEvent.click(downloadButton);

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(anchorClick).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).not.toHaveBeenCalled();

      jest.runOnlyPendingTimers();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:cdc-template");
    } finally {
      jest.useRealTimers();
      anchorClick.mockRestore();
    }
  });
});
