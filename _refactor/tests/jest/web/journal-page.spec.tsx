/**
 * Page /ecole/journal (v2.md §V3-6) — journal de transparence de l'école.
 *
 * Couvre : rendu du tableau paginé (mock `getSchoolJournal`), la bannière de
 * gel qui n'apparaît QUE lorsque `issuanceFrozenAt` est renseigné, le flux de
 * signalement (clic « Signaler » → modale d'avertissement → confirmation →
 * `reportJournalEntry` appelé avec le bon `diplomaId`) et le bouton
 * désactivé pour une entrée déjà signalée.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@certifychain/shared/ui";
import type { SchoolJournalEntryDTO } from "@certifychain/contract/dto";
import SchoolJournalPage from "../../../apps/client/web/src/app/(school)/ecole/journal/page";
import { getSchoolJournal, reportJournalEntry } from "@/lib/api/endpoints";

jest.mock("@/lib/api/endpoints", () => ({
  getSchoolJournal: jest.fn(),
  reportJournalEntry: jest.fn(),
}));

const getJournalMock = jest.mocked(getSchoolJournal);
const reportMock = jest.mocked(reportJournalEntry);

const DIPLOMA_ID_1 = "11111111-1111-4111-8111-111111111111";
const DIPLOMA_ID_2 = "22222222-2222-4222-8222-222222222222";

const entries: SchoolJournalEntryDTO[] = [
  {
    leafIndex: 0,
    diplomaId: DIPLOMA_ID_1,
    holderName: "Camille Exemple",
    programTitle: "Master Data Science",
    issuedAt: "2026-06-01T09:00:00.000Z",
    loggedAt: "2026-06-01T09:05:00.000Z",
    reportedAt: null,
  },
  {
    leafIndex: 1,
    diplomaId: DIPLOMA_ID_2,
    holderName: "Alex Démonstration",
    programTitle: "Licence Informatique",
    issuedAt: "2026-06-02T09:00:00.000Z",
    loggedAt: "2026-06-02T09:05:00.000Z",
    reportedAt: "2026-06-03T10:00:00.000Z",
  },
];

function renderPage() {
  return render(
    <ToastProvider>
      <SchoolJournalPage />
    </ToastProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  getJournalMock.mockResolvedValue({
    items: entries,
    total: entries.length,
    page: 1,
    pageSize: 20,
    issuanceFrozenAt: null,
  });
  reportMock.mockResolvedValue({ ok: true, issuanceFrozenAt: "2026-07-15T12:00:00.000Z" });
});

describe("Page Journal de transparence", () => {
  it("charge et affiche le tableau paginé des émissions", async () => {
    renderPage();

    expect(await screen.findByText("Camille Exemple")).toBeInTheDocument();
    expect(screen.getByText("Master Data Science")).toBeInTheDocument();
    expect(screen.getByText("Alex Démonstration")).toBeInTheDocument();
    expect(screen.getByText("Licence Informatique")).toBeInTheDocument();
    expect(getJournalMock).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });

  it("n'affiche pas de bannière de gel quand issuanceFrozenAt est null", async () => {
    renderPage();

    await screen.findByText("Camille Exemple");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/Émissions gelées depuis le/)).not.toBeInTheDocument();
  });

  it("affiche une bannière de gel persistante quand issuanceFrozenAt est renseigné", async () => {
    getJournalMock.mockResolvedValue({
      items: entries,
      total: entries.length,
      page: 1,
      pageSize: 20,
      issuanceFrozenAt: "2026-07-10T08:00:00.000Z",
    });
    renderPage();

    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent(/Émissions gelées depuis le/);
    expect(banner).toHaveTextContent(/Contactez un administrateur CertifyChain/);
  });

  it("désactive le bouton et affiche la date pour une émission déjà signalée", async () => {
    renderPage();

    const reportedButton = await screen.findByRole("button", { name: /Signalé le/ });
    expect(reportedButton).toBeDisabled();
    // Une seule ligne (Camille) reste signalable.
    expect(screen.getAllByRole("button", { name: "Signaler" })).toHaveLength(1);
  });

  it("signale une émission via la modale de confirmation puis gèle l'émission", async () => {
    renderPage();

    await screen.findByText("Camille Exemple");
    fireEvent.click(screen.getByRole("button", { name: "Signaler" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      /gèle immédiatement toute nouvelle émission de diplômes/,
    );
    expect(dialog).toHaveTextContent(
      /La vérification des diplômes déjà émis n'est pas affectée/,
    );

    fireEvent.change(screen.getByLabelText("Motif (optionnel)"), {
      target: { value: "Je n'ai jamais émis ce diplôme" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmer le signalement" }));

    await waitFor(() =>
      expect(reportMock).toHaveBeenCalledWith({
        diplomaId: DIPLOMA_ID_1,
        reason: "Je n'ai jamais émis ce diplôme",
      }),
    );

    // La ligne signalée passe à l'état désactivé et la bannière de gel apparaît.
    expect(await screen.findByRole("alert")).toHaveTextContent(/Émissions gelées depuis le/);
    expect(screen.queryByRole("button", { name: "Signaler" })).not.toBeInTheDocument();
  });

  it("transmet reason=undefined quand le motif est laissé vide", async () => {
    renderPage();

    await screen.findByText("Camille Exemple");
    fireEvent.click(screen.getByRole("button", { name: "Signaler" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Confirmer le signalement" }));

    await waitFor(() =>
      expect(reportMock).toHaveBeenCalledWith({ diplomaId: DIPLOMA_ID_1, reason: undefined }),
    );
  });
});
