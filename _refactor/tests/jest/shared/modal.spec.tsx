/**
 * Modal partagée — câblage ARIA (dialog/labelledby/describedby), fermeture
 * (Esc, backdrop, bouton), verrou de scroll du body. Utilisée par les 3 apps
 * (dont la confirmation « vérification postale payée » — correctif S4+W6).
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { Modal } from "@certifychain/shared/ui";

const noop = (): void => undefined;

describe("Modal — accessibilité", () => {
  it("rend un dialog aria-modal nommé par le titre et décrit par la description", () => {
    render(
      <Modal open onClose={noop} title="Changer de méthode" description="Les frais seront perdus.">
        Contenu
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Changer de méthode");
    expect(dialog).toHaveAccessibleDescription("Les frais seront perdus.");
  });

  it("rend le footer (zone d'actions)", () => {
    render(
      <Modal open onClose={noop} title="T" footer={<button type="button">Confirmer</button>} />,
    );
    expect(screen.getByRole("button", { name: "Confirmer" })).toBeInTheDocument();
  });
});

describe("Modal — fermeture", () => {
  it("Échap appelle onClose", () => {
    const onClose = jest.fn();
    render(<Modal open onClose={onClose} title="T" />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("le clic sur le backdrop appelle onClose", () => {
    const onClose = jest.fn();
    render(<Modal open onClose={onClose} title="T" />);
    const backdrop = document.querySelector(".backdrop-blur-md");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disableBackdropClose neutralise le clic backdrop (mais pas Échap)", () => {
    const onClose = jest.fn();
    render(<Modal open onClose={onClose} title="T" disableBackdropClose />);
    fireEvent.click(document.querySelector(".backdrop-blur-md") as Element);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("le bouton « Fermer » appelle onClose ; hideCloseButton le retire", () => {
    const onClose = jest.fn();
    const { rerender } = render(<Modal open onClose={onClose} title="T" />);
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Modal open onClose={onClose} title="T" hideCloseButton />);
    expect(screen.queryByRole("button", { name: "Fermer" })).toBeNull();
  });
});

describe("Modal — verrou de scroll", () => {
  it("bloque le scroll du body à l'ouverture et le restaure à la fermeture", () => {
    const { rerender } = render(<Modal open onClose={noop} title="T" />);
    expect(document.body.style.overflow).toBe("hidden");
    rerender(<Modal open={false} onClose={noop} title="T" />);
    expect(document.body.style.overflow).toBe("");
  });
});
