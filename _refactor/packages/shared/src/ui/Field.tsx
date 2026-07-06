import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type JSX,
  type ReactElement,
  type ReactNode,
} from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "../lib/cn";

/** Props injected by {@link Field} into its single form-control child. */
export interface FieldControlProps {
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

export interface FieldProps {
  /** Visible label text. */
  label?: ReactNode;
  /** Helper text shown below the control when there is no error. */
  hint?: ReactNode;
  /** Error message — when set, the field renders in its invalid state. */
  error?: ReactNode;
  /** Mark the label with a required asterisk. */
  required?: boolean;
  /** Extra classes on the wrapper. */
  className?: string;
  /**
   * A single form control (Input / Textarea / Select). It is automatically
   * wired with `id`, `aria-invalid` and `aria-describedby`.
   */
  children: ReactElement<FieldControlProps>;
}

/**
 * Label + hint + error wrapper. Generates a stable `id` and connects it to the
 * control plus its description/error for screen readers.
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  className,
  children,
}: FieldProps): JSX.Element {
  const generatedId = useId();
  const child = Children.only(children);
  const controlId = child.props.id ?? generatedId;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  const control = isValidElement(child)
    ? cloneElement(child, {
        id: controlId,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })
    : child;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label
          htmlFor={controlId}
          className="text-sm font-semibold text-ink-soft"
        >
          {label}
          {required && (
            <span className="ml-0.5" aria-hidden>
              (<span className="text-danger" aria-hidden>requis</span>)
            </span>
          )}
        </label>
      )}
      {control}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-center gap-1.5 text-xs font-medium text-danger"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-xs text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
