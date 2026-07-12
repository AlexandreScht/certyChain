/** Console admin — jauge de score IA. */
import { render, screen } from "@testing-library/react";
import { ScoreGauge } from "../../../apps/client/admin/src/components/admin/ScoreGauge";

describe("ScoreGauge", () => {
  it("affiche le score sur 100", () => {
    render(<ScoreGauge score={87} />);
    expect(screen.getByText("87")).toBeTruthy();
    expect(screen.getByText("/100")).toBeTruthy();
  });

  it("score null → « — » sans /100 (non évalué)", () => {
    render(<ScoreGauge score={null} />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText("/100")).toBeNull();
  });

  it("clampe la jauge hors bornes sans casser le rendu", () => {
    const { container } = render(<ScoreGauge score={250} />);
    const arc = container.querySelectorAll("circle")[1]!;
    // 250 clampé à 100 → arc plein (dashoffset ≈ 0).
    expect(Number(arc.getAttribute("stroke-dashoffset"))).toBeCloseTo(0, 5);
  });

  it("colorise selon les seuils (vert ≥ 85, ambre ≥ 60, rouge sinon)", () => {
    const strokeOf = (score: number | null) => {
      const { container } = render(<ScoreGauge score={score} />);
      return container.querySelectorAll("circle")[1]!.getAttribute("stroke");
    };
    expect(strokeOf(90)).toBe("var(--color-success)");
    expect(strokeOf(70)).toBe("var(--color-amber-500)");
    expect(strokeOf(30)).toBe("var(--color-danger)");
    expect(strokeOf(null)).toBe("var(--color-muted-soft)");
  });
});
