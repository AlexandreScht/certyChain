/**
 * Toasts partagés — rôles ARIA par tone (status vs alert), auto-dismiss,
 * fermeture manuelle, garde-fou hors provider. C'est le canal de feedback
 * standard des 3 apps (succès d'émission, erreurs API…).
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider, useToast } from "@certifychain/shared/ui";

/**
 * L'animation de sortie (AnimatePresence) tourne sur les VRAIS rAF — les fake
 * timers ne la font pas avancer. Pour vérifier un retrait : timers réels puis
 * attente du démontage.
 */
async function expectRemoved(text: string): Promise<void> {
  jest.useRealTimers();
  await waitFor(() => expect(screen.queryByText(text)).toBeNull());
}

type ToastApi = ReturnType<typeof useToast>;

function Capture({ apiRef }: { apiRef: { current: ToastApi | null } }) {
  apiRef.current = useToast();
  return null;
}

function renderProvider(defaultDuration?: number): ToastApi {
  const apiRef: { current: ToastApi | null } = { current: null };
  render(
    <ToastProvider defaultDuration={defaultDuration}>
      <Capture apiRef={apiRef} />
    </ToastProvider>,
  );
  expect(apiRef.current).not.toBeNull();
  return apiRef.current as ToastApi;
}

describe("ToastProvider", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("success → role=status avec titre et description", () => {
    const api = renderProvider();
    act(() => {
      api.success("Diplôme émis", "Le lien a été envoyé à l'élève.");
    });
    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Diplôme émis");
    expect(toast).toHaveTextContent("Le lien a été envoyé à l'élève.");
  });

  it("error → role=alert (annoncé immédiatement aux lecteurs d'écran)", () => {
    const api = renderProvider();
    act(() => {
      api.error("Échec de l'émission");
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Échec de l'émission");
  });

  it("s'auto-détruit après defaultDuration", async () => {
    const api = renderProvider(2000);
    act(() => {
      api.toast({ title: "Éphémère" });
    });
    expect(screen.getByText("Éphémère")).toBeInTheDocument();
    // Le timer d'auto-dismiss est fake : on le fait expirer…
    act(() => {
      jest.advanceTimersByTime(2001);
    });
    // …puis l'animation de sortie s'achève sur les vrais rAF.
    await expectRemoved("Éphémère");
  });

  it("duration: 0 désactive l'auto-dismiss", () => {
    const api = renderProvider(2000);
    act(() => {
      api.toast({ title: "Persistant", duration: 0 });
    });
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(screen.getByText("Persistant")).toBeInTheDocument();
  });

  it("le bouton « Fermer la notification » retire le toast", async () => {
    const api = renderProvider();
    act(() => {
      api.toast({ title: "À fermer", duration: 0 });
    });
    fireEvent.click(screen.getByRole("button", { name: "Fermer la notification" }));
    await expectRemoved("À fermer");
  });

  it("dismiss(id) retire le toast ciblé, pas les autres", async () => {
    const api = renderProvider();
    let id = 0;
    act(() => {
      id = api.toast({ title: "Ciblé", duration: 0 });
      api.toast({ title: "Autre", duration: 0 });
    });
    act(() => {
      api.dismiss(id);
    });
    await expectRemoved("Ciblé");
    expect(screen.getByText("Autre")).toBeInTheDocument();
  });
});

describe("useToast hors provider", () => {
  it("échoue avec un message explicite", () => {
    const silence = jest.spyOn(console, "error").mockImplementation(() => undefined);
    function Bare() {
      useToast();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/ToastProvider/);
    silence.mockRestore();
  });
});
