/** Robustesse du parsing des réponses IA (jamais de throw, score borné). */
import { parseResult } from "../../../apps/server/src/lib/gemini";

describe("parseResult", () => {
  it("parse un JSON valide", () => {
    const r = parseResult(
      JSON.stringify({ score: 82, summary: "École plausible.", flags: ["domaine grand public"] }),
      "gemini-test",
    );
    expect(r).toEqual({
      score: 82,
      summary: "École plausible.",
      flags: ["domaine grand public"],
      model: "gemini-test",
    });
  });

  it("retourne null sur un JSON invalide", () => {
    expect(parseResult("pas du json", "m")).toBeNull();
    expect(parseResult("", "m")).toBeNull();
  });

  it("retourne null sans score exploitable", () => {
    expect(parseResult(JSON.stringify({ summary: "s", flags: [] }), "m")).toBeNull();
    expect(parseResult(JSON.stringify({ score: "beaucoup", summary: "s", flags: [] }), "m")).toBeNull();
  });

  it("clampe le score dans [0, 100] et accepte un score en string numérique", () => {
    expect(parseResult(JSON.stringify({ score: 250, summary: "", flags: [] }), "m")?.score).toBe(100);
    expect(parseResult(JSON.stringify({ score: -5, summary: "", flags: [] }), "m")?.score).toBe(0);
    expect(parseResult(JSON.stringify({ score: "73", summary: "", flags: [] }), "m")?.score).toBe(73);
  });

  it("filtre les flags non-string et borne la liste à 20", () => {
    const flags = [1, "ok", null, ...Array.from({ length: 30 }, (_, i) => `f${i}`)];
    const r = parseResult(JSON.stringify({ score: 50, summary: "s", flags }), "m");
    expect(r?.flags.every((f) => typeof f === "string")).toBe(true);
    expect(r?.flags.length).toBeLessThanOrEqual(20);
  });

  it("tronque un summary démesuré à 1000 caractères", () => {
    const r = parseResult(JSON.stringify({ score: 50, summary: "x".repeat(5000), flags: [] }), "m");
    expect(r?.summary).toHaveLength(1000);
  });
});
