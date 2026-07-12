/**
 * `cn` (clsx + tailwind-merge) — l'utilitaire de composition de classes de
 * tout le kit UI : le dernier utilitaire en conflit doit gagner (c'est ce qui
 * permet aux props `className` des apps de surcharger les défauts du kit).
 */
import { cn } from "@certifychain/shared/lib/cn";

describe("cn", () => {
  it("le dernier utilitaire en conflit gagne (surcharge des défauts du kit)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm text-ink", "text-lg")).toBe("text-ink text-lg");
  });

  it("filtre les valeurs falsy (rendu conditionnel)", () => {
    const active = false;
    expect(cn("a", active && "b", undefined, null, "c")).toBe("a c");
  });

  it("accepte tableaux et objets à la clsx", () => {
    expect(cn(["a", { b: true, c: false }])).toBe("a b");
  });

  it("fusionne les familles sans écraser les classes indépendantes", () => {
    const merged = cn("rounded-xl p-4", "rounded-full").split(" ");
    expect(merged).toContain("p-4");
    expect(merged).toContain("rounded-full");
    expect(merged).not.toContain("rounded-xl");
  });
});
