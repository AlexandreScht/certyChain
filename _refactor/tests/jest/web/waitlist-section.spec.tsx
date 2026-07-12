/**
 * Waitlist landing — régression W1 (audit 2026-07-10, 🔴) : l'e-mail du
 * prospect est RÉELLEMENT envoyé à l'API avant d'afficher la promesse
 * « Notre équipe vous contacte sous 24h ouvrées » ; une erreur API est
 * montrée au prospect (plus de perte silencieuse).
 *
 * gsap/@gsap/react et next/link sont stubbés via jest.config.cjs.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ApiClientError } from "@certifychain/shared/api/client";
import WaitlistSection from "../../../apps/client/web/src/components/WaitlistSection";
import { joinWaitlist } from "@/lib/api/endpoints";

jest.mock("@/lib/api/endpoints", () => ({
  joinWaitlist: jest.fn(),
}));
const joinWaitlistMock = jest.mocked(joinWaitlist);

const SUCCESS_COPY = /Notre équipe vous contacte sous 24h ouvrées/;

function submitEmail(email: string): void {
  fireEvent.change(screen.getByLabelText("Email professionnel"), {
    target: { value: email },
  });
  const form = screen.getByRole("button", { name: /Rejoindre/ }).closest("form");
  expect(form).not.toBeNull();
  fireEvent.submit(form as HTMLFormElement);
}

beforeEach(() => {
  joinWaitlistMock.mockReset();
});

describe("WaitlistSection — régression W1", () => {
  it("le submit transmet l'e-mail (trim) à l'API puis affiche la confirmation", async () => {
    joinWaitlistMock.mockResolvedValueOnce({ ok: true });
    render(<WaitlistSection />);

    submitEmail("  direction@ecole-demo.fr  ");

    expect(joinWaitlistMock).toHaveBeenCalledWith({ email: "direction@ecole-demo.fr" });
    expect(await screen.findByText(SUCCESS_COPY)).toBeInTheDocument();
    // Le formulaire disparaît : plus de double soumission possible.
    expect(screen.queryByRole("button", { name: /Rejoindre/ })).toBeNull();
  });

  it("la promesse de recontact n'apparaît JAMAIS avant la réponse de l'API", async () => {
    let resolveCall: (v: { ok: true }) => void = () => undefined;
    joinWaitlistMock.mockImplementationOnce(
      () => new Promise((resolve) => (resolveCall = resolve)),
    );
    render(<WaitlistSection />);

    submitEmail("direction@ecole-demo.fr");

    // En vol : pas de confirmation, bouton verrouillé en « Envoi… ».
    expect(screen.queryByText(SUCCESS_COPY)).toBeNull();
    expect(screen.getByRole("button", { name: /Envoi…/ })).toBeDisabled();

    await act(async () => {
      resolveCall({ ok: true });
    });
    expect(screen.getByText(SUCCESS_COPY)).toBeInTheDocument();
  });

  it("une erreur API (ex. rate-limit) est affichée en alerte, sans fausse confirmation", async () => {
    joinWaitlistMock.mockRejectedValueOnce(
      new ApiClientError("Trop de requêtes, réessayez plus tard", {
        code: "rate_limited",
        status: 429,
      }),
    );
    render(<WaitlistSection />);

    submitEmail("direction@ecole-demo.fr");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Trop de requêtes, réessayez plus tard");
    expect(screen.queryByText(SUCCESS_COPY)).toBeNull();
    // Le prospect peut retenter : le formulaire est toujours là.
    expect(screen.getByRole("button", { name: /Rejoindre/ })).toBeEnabled();
  });

  it("une erreur inattendue affiche le message générique", async () => {
    joinWaitlistMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    render(<WaitlistSection />);

    submitEmail("direction@ecole-demo.fr");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Une erreur est survenue. Réessayez dans un instant.",
    );
  });

  it("submit sans e-mail : aucun appel API", () => {
    render(<WaitlistSection />);
    const form = screen
      .getByRole("button", { name: /Rejoindre/ })
      .closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    expect(joinWaitlistMock).not.toHaveBeenCalled();
  });
});
