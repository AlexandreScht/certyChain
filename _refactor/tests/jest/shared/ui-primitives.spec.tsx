/** Kit UI partagé — comportements structurels + régression a11y C2 (Field). */
import { fireEvent, render, screen } from "@testing-library/react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Table,
  type TableColumn,
} from "../../../packages/shared/src/ui";

describe("Badge", () => {
  it("rend le libellé", () => {
    render(<Badge tone="success">Actif</Badge>);
    expect(screen.getByText("Actif")).toBeTruthy();
  });

  it("n'affiche le point de statut que sur demande", () => {
    const { container: without } = render(<Badge>Sans</Badge>);
    const { container: withDot } = render(<Badge dot>Avec</Badge>);
    expect(without.querySelectorAll("span span")).toHaveLength(0);
    expect(withDot.querySelectorAll("span span").length).toBeGreaterThan(0);
  });
});

describe("Button", () => {
  it("est un <button type=button> par défaut", () => {
    render(<Button>Ok</Button>);
    const btn = screen.getByRole("button", { name: "Ok" });
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("type")).toBe("button");
  });

  it("loading ⇒ désactivé + aria-busy + clic inerte", () => {
    const onClick = jest.fn();
    render(
      <Button loading onClick={onClick}>
        Envoyer
      </Button>,
    );
    const btn = screen.getByRole("button");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('as="a" rend une vraie ancre avec href', () => {
    render(
      <Button as="a" href="/ecole/login">
        Connexion
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Connexion" });
    expect(link.getAttribute("href")).toBe("/ecole/login");
  });
});

describe("Field (régression C2 — a11y du requis)", () => {
  it("relie le label au contrôle (htmlFor = id)", () => {
    render(
      <Field label="Adresse e-mail">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText(/Adresse e-mail/);
    expect(input.tagName).toBe("INPUT");
  });

  it("required ⇒ aria-required sur le contrôle (l'indicateur visuel est aria-hidden)", () => {
    render(
      <Field label="SIRET" required>
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText(/SIRET/).getAttribute("aria-required")).toBe("true");
  });

  it("pas d'aria-required sans required", () => {
    render(
      <Field label="Ville">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("Ville").getAttribute("aria-required")).toBeNull();
  });

  it("erreur ⇒ role=alert + aria-invalid + aria-describedby vers le message", () => {
    render(
      <Field label="Code" error="Code à 6 chiffres">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText("Code");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Code à 6 chiffres");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("le hint disparaît au profit de l'erreur", () => {
    render(
      <Field label="Code" hint="6 chiffres" error="Requis">
        <Input />
      </Field>,
    );
    expect(screen.queryByText("6 chiffres")).toBeNull();
    expect(screen.getByText("Requis")).toBeTruthy();
  });
});

interface Row {
  id: string;
  name: string;
}

const columns: TableColumn<Row>[] = [
  { key: "name", header: "Nom" },
  { key: "id", header: "Réf", cell: (r) => <code>{r.id.slice(0, 4)}</code> },
];

describe("Table", () => {
  it("rend en-têtes et cellules (accessor + cell custom)", () => {
    render(<Table columns={columns} rows={[{ id: "abcd1234", name: "Alex" }]} rowKey={(r) => r.id} />);
    expect(screen.getByRole("columnheader", { name: "Nom" })).toBeTruthy();
    expect(screen.getByText("Alex")).toBeTruthy();
    expect(screen.getByText("abcd")).toBeTruthy();
  });

  it("affiche l'état vide par défaut sans lignes", () => {
    render(<Table columns={columns} rows={[]} />);
    expect(screen.getByText("Aucune donnée")).toBeTruthy();
  });

  it("n'affiche PAS l'état vide pendant le chargement (skeletons)", () => {
    render(<Table columns={columns} rows={[]} loading loadingRows={3} />);
    expect(screen.queryByText("Aucune donnée")).toBeNull();
  });

  it("état vide personnalisable", () => {
    render(
      <Table
        columns={columns}
        rows={[]}
        empty={<EmptyState title="Aucun diplôme émis" description="Émettez votre premier diplôme." />}
      />,
    );
    expect(screen.getByText("Aucun diplôme émis")).toBeTruthy();
  });
});
