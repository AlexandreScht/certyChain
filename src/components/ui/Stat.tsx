import type { HTMLAttributes, JSX, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface StatProps extends HTMLAttributes<HTMLDivElement> {
  /** The headline KPI value (e.g. "99,9 %", "< 2s"). */
  value: ReactNode;
  /** Short descriptive label under the value. */
  label: ReactNode;
  /** Optional leading icon. */
  icon?: ReactNode;
  /** Optional trend / delta line under the label. */
  hint?: ReactNode;
}

/**
 * KPI tile on the neumorphic surface, mirroring the Hero trust-bar cells:
 * a big `font-display` number with a muted label below.
 */
export function Stat({
  value,
  label,
  icon,
  hint,
  className,
  ...rest
}: StatProps): JSX.Element {
  return (
    <div
      {...rest}
      className={cn(
        "neumorph-sm rounded-2xl px-4 py-3.5 text-left",
        className,
      )}
    >
      {icon && (
        <span className="inline-flex mb-2 text-indigo-600 [&_svg]:w-5 [&_svg]:h-5">
          {icon}
        </span>
      )}
      <div className="font-display font-bold text-ink text-[clamp(1.25rem,2.5vw,1.75rem)] leading-none">
        {value}
      </div>
      <div className="text-xs sm:text-sm text-muted mt-1">{label}</div>
      {hint && <div className="text-[11px] text-muted-soft mt-1">{hint}</div>}
    </div>
  );
}
