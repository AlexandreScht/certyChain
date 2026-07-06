import type { JSX, ReactNode } from "react";
import { cn } from "../lib/cn";

export interface PageHeaderProps {
  /** Small pill label above the title. */
  eyebrow?: ReactNode;
  /** Main title. The `gradient` slice is rendered with `grad-text`. */
  title: ReactNode;
  /** Optional gradient-highlighted suffix appended to the title. */
  gradient?: ReactNode;
  /** Supporting subtitle. */
  subtitle?: ReactNode;
  /** Right-aligned actions (buttons, filters). */
  actions?: ReactNode;
  /** Use the cool indigo→cyan gradient instead of the full spectrum. */
  cool?: boolean;
  /** Center the eyebrow/title/subtitle column. */
  centered?: boolean;
  className?: string;
}

/**
 * Standard page / section header: an eyebrow pill, a `font-display` title with
 * an optional `grad-text` highlight, and a muted subtitle.
 */
export function PageHeader({
  eyebrow,
  title,
  gradient,
  subtitle,
  actions,
  cool = false,
  centered = false,
  className,
}: PageHeaderProps): JSX.Element {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className={cn("max-w-2xl", centered && "mx-auto text-center")}>
        {eyebrow && (
          <div
            className={cn(
              "inline-flex items-center gap-2 neumorph-pill rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-soft mb-4",
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            {eyebrow}
          </div>
        )}
        <h1 className="font-display font-bold text-ink tracking-tight text-3xl md:text-4xl leading-[1.08]">
          {title}
          {gradient && (
            <>
              {" "}
              <span className={cool ? "grad-text-cool" : "grad-text"}>
                {gradient}
              </span>
            </>
          )}
        </h1>
        {subtitle && (
          <p className="mt-3 text-base text-muted leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-3 shrink-0">{actions}</div>
      )}
    </div>
  );
}
