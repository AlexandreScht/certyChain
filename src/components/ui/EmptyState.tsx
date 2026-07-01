import type { JSX, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** Leading icon (rendered inside a neumorphic medallion). */
  icon?: ReactNode;
  /** Headline. */
  title: ReactNode;
  /** Supporting description. */
  description?: ReactNode;
  /** Action(s) — typically a `<Button>`. */
  action?: ReactNode;
  className?: string;
}

/**
 * Centered placeholder for empty collections — icon medallion, title,
 * description and an optional call to action.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-6 py-12",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 w-14 h-14 rounded-2xl neumorph grid place-items-center text-indigo-600 [&_svg]:w-6 [&_svg]:h-6">
          {icon}
        </div>
      )}
      <h3 className="font-display font-bold text-ink text-lg">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-muted max-w-sm">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
