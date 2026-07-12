/**
 * Thème clair/sombre — useTheme écrit <html data-theme> + color-scheme +
 * localStorage et notifie via l'événement `themechange` (resynchronisation
 * de tous les composants abonnés, ex. Navbar).
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import ThemeToggle from "@certifychain/shared/ui/ThemeToggle";

const root = document.documentElement;

beforeEach(() => {
  delete root.dataset.theme;
  root.style.colorScheme = "";
  localStorage.clear();
});

describe("ThemeToggle / useTheme", () => {
  it("démarre en clair : switch non coché, action « thème sombre »", () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole("switch", { name: "Activer le thème sombre" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("un clic bascule en sombre : data-theme + color-scheme + persistance", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("switch"));

    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Activer le thème clair" })).toBeInTheDocument();
  });

  it("un second clic revient en clair", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("switch"));

    expect(root.dataset.theme).toBe("light");
    expect(localStorage.getItem("theme")).toBe("light");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("reprend un thème déjà appliqué sur <html> (hydratation après le script inline)", () => {
    root.dataset.theme = "dark";
    render(<ThemeToggle />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("deux instances restent synchronisées via l'événement themechange", () => {
    render(
      <>
        <ThemeToggle className="a" />
        <ThemeToggle className="b" />
      </>,
    );
    const [first, second] = screen.getAllByRole("switch");
    fireEvent.click(first);
    expect(second).toHaveAttribute("aria-checked", "true");
  });
});
