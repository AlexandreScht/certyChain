import { cn } from "@/lib/utils";

export interface ScoreGaugeProps {
  /** AI validity score 0–100, or null when not yet evaluated. */
  score: number | null;
  size?: number;
  className?: string;
}

/** Conic-style ring showing the AI validity score (red → amber → green). */
export function ScoreGauge({ score, size = 132, className }: ScoreGaugeProps) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score));
  const offset = circ - (pct / 100) * circ;
  const color =
    score === null
      ? "var(--color-muted-soft)"
      : pct >= 85
        ? "var(--color-success)"
        : pct >= 60
          ? "var(--color-amber-500)"
          : "var(--color-danger)";

  return (
    <div
      className={cn("relative grid place-items-center shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-hairline)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="font-display font-bold text-2xl text-ink leading-none">
            {score === null ? "—" : score}
            {score !== null && <span className="text-sm text-muted">/100</span>}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-soft font-semibold">
            Score IA
          </div>
        </div>
      </div>
    </div>
  );
}
