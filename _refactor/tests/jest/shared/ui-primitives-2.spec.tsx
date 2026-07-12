/**
 * Kit UI partagé — 2ᵉ vague : contrôles de formulaire (Input/Select/Textarea),
 * indicateurs (Spinner/Skeleton/Stat) et conteneurs (Card/GlassPanel/PageHeader).
 * Complète ui-primitives.spec.tsx (Badge/Button/Field/Table/EmptyState).
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  Card,
  GlassPanel,
  Input,
  PageHeader,
  Select,
  Skeleton,
  SkeletonText,
  Spinner,
  Stat,
  Textarea,
} from "@certifychain/shared/ui";

describe("Input", () => {
  it("rend un textbox neutre par défaut (pas d'état invalide)", () => {
    render(<Input placeholder="Email" />);
    const input = screen.getByRole("textbox");
    expect(input).not.toHaveAttribute("aria-invalid", "true");
    expect(input.className).not.toContain("ring-danger");
  });

  it("invalid ⇒ aria-invalid + anneau rouge", () => {
    render(<Input invalid placeholder="Email" />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.className).toContain("ring-danger");
  });

  it("réagit aussi à un aria-invalid posé par Field (sans prop invalid)", () => {
    render(<Input aria-invalid placeholder="Email" />);
    expect(screen.getByRole("textbox").className).toContain("ring-danger");
  });

  it("leftIcon ⇒ wrapper décoré + padding pour ne pas chevaucher l'icône", () => {
    render(<Input leftIcon={<svg data-testid="icone" />} placeholder="Email" />);
    expect(screen.getByTestId("icone")).toBeInTheDocument();
    expect(screen.getByRole("textbox").className).toContain("pl-10");
  });

  it("sans icône, aucun wrapper superflu n'est rendu", () => {
    const { container } = render(<Input placeholder="Email" />);
    expect(container.firstElementChild?.tagName).toBe("INPUT");
  });
});

describe("Select", () => {
  const options = [
    { label: "École", value: "school" },
    { label: "Élève", value: "student", disabled: true },
  ];

  it("rend les options typées + un placeholder désactivé de valeur vide", () => {
    render(<Select options={options} placeholder="Choisir…" defaultValue="" />);
    const placeholder = screen.getByRole("option", { name: "Choisir…" }) as HTMLOptionElement;
    expect(placeholder.disabled).toBe(true);
    expect(placeholder.value).toBe("");
    expect(screen.getByRole("option", { name: "École" })).toBeInTheDocument();
    expect((screen.getByRole("option", { name: "Élève" }) as HTMLOptionElement).disabled).toBe(
      true,
    );
  });

  it("reste un <select> natif (accessibilité clavier) avec chevron décoratif", () => {
    const { container } = render(<Select options={options} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    const chevron = container.querySelector("svg");
    expect(chevron).toHaveAttribute("aria-hidden");
  });

  it("invalid ⇒ aria-invalid + anneau rouge", () => {
    render(<Select options={options} invalid />);
    const select = screen.getByRole("combobox");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select.className).toContain("ring-danger");
  });
});

describe("Textarea", () => {
  it("4 lignes par défaut, surchargeables", () => {
    const { rerender } = render(<Textarea aria-label="Note" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "4");
    rerender(<Textarea aria-label="Note" rows={8} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "8");
  });

  it("invalid ⇒ aria-invalid + anneau rouge", () => {
    render(<Textarea aria-label="Note" invalid />);
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("Spinner", () => {
  it("role=status avec libellé sr-only par défaut", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveTextContent("Chargement…");
  });

  it("libellé personnalisable et taille appliquée au glyphe", () => {
    const { container } = render(<Spinner size="lg" label="Vérification…" />);
    expect(screen.getByRole("status")).toHaveTextContent("Vérification…");
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("w-7");
  });
});

describe("Skeleton", () => {
  it("est masqué aux lecteurs d'écran (aria-hidden)", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden");
  });

  it("width/height numériques convertis en px ; cercle arrondi", () => {
    const { container } = render(<Skeleton width={120} height={40} circle />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.width).toBe("120px");
    expect(el.style.height).toBe("40px");
    expect(el.className).toContain("rounded-full");
  });

  it("SkeletonText : n lignes, la dernière plus courte (60 %)", () => {
    const { container } = render(<SkeletonText lines={4} />);
    const lines = Array.from(container.firstElementChild?.children ?? []) as HTMLElement[];
    expect(lines).toHaveLength(4);
    expect(lines[3]?.style.width).toBe("60%");
    expect(lines[0]?.style.width).toBe("100%");
  });
});

describe("Stat", () => {
  it("affiche valeur, libellé, hint et icône", () => {
    render(
      <Stat
        value="99,9 %"
        label="Disponibilité"
        hint="+0,2 pt vs 30 j"
        icon={<svg data-testid="stat-icone" />}
      />,
    );
    expect(screen.getByText("99,9 %")).toBeInTheDocument();
    expect(screen.getByText("Disponibilité")).toBeInTheDocument();
    expect(screen.getByText("+0,2 pt vs 30 j")).toBeInTheDocument();
    expect(screen.getByTestId("stat-icone")).toBeInTheDocument();
  });
});

describe("Card / GlassPanel", () => {
  it("GlassPanel est un alias strict de Card (une seule implémentation)", () => {
    expect(GlassPanel).toBe(Card);
  });

  it("surface glass par défaut, glass-strong via `strong`", () => {
    const { container, rerender } = render(<Card>corps</Card>);
    const el = () => container.firstElementChild as HTMLElement;
    expect(el().className).toContain("glass");
    expect(el().className).not.toContain("glass-strong");
    rerender(<Card strong>corps</Card>);
    expect(el().className).toContain("glass-strong");
  });

  it("padding par défaut p-6, remplacé par la prop `padding`", () => {
    const { container, rerender } = render(<Card>c</Card>);
    expect((container.firstElementChild as HTMLElement).className).toContain("p-6");
    rerender(<Card padding="p-3">c</Card>);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toContain("p-3");
    expect(cls).not.toContain("p-6");
  });

  it("halo ⇒ anneau grad-ring décoratif autour de la carte", () => {
    const { container } = render(<Card halo>c</Card>);
    const ring = container.querySelector(".grad-ring");
    expect(ring).not.toBeNull();
    expect(ring).toHaveAttribute("aria-hidden");
  });

  it("glow ⇒ le mouvement souris met à jour --mx/--my (hover-glow)", () => {
    const { container } = render(<Card glow>c</Card>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("hover-glow");
    fireEvent.mouseMove(el, { clientX: 40, clientY: 15 });
    expect(el.style.getPropertyValue("--mx")).toBe("40px");
    expect(el.style.getPropertyValue("--my")).toBe("15px");
  });

  it("sans glow, onMouseMove custom est appelé et aucun --mx n'est posé", () => {
    const onMouseMove = jest.fn();
    const { container } = render(<Card onMouseMove={onMouseMove}>c</Card>);
    const el = container.firstElementChild as HTMLElement;
    fireEvent.mouseMove(el, { clientX: 40, clientY: 15 });
    expect(onMouseMove).toHaveBeenCalledTimes(1);
    expect(el.style.getPropertyValue("--mx")).toBe("");
  });
});

describe("PageHeader", () => {
  it("titre en h1 avec suffixe dégradé (grad-text)", () => {
    render(<PageHeader title="Registre des" gradient="diplômes" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Registre des diplômes");
    expect(h1.querySelector(".grad-text")).not.toBeNull();
  });

  it("cool ⇒ dégradé indigo→cyan (grad-text-cool)", () => {
    render(<PageHeader title="Portail" gradient="école" cool />);
    expect(
      screen.getByRole("heading", { level: 1 }).querySelector(".grad-text-cool"),
    ).not.toBeNull();
  });

  it("eyebrow, sous-titre et actions rendus", () => {
    render(
      <PageHeader
        eyebrow="Espace école"
        title="Tableau de bord"
        subtitle="Vue d'ensemble des émissions."
        actions={<button type="button">Émettre</button>}
      />,
    );
    expect(screen.getByText("Espace école")).toBeInTheDocument();
    expect(screen.getByText("Vue d'ensemble des émissions.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Émettre" })).toBeInTheDocument();
  });
});
