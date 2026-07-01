import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Render the control in its invalid state (red ring). */
  invalid?: boolean;
  /** Decoration rendered at the start (e.g. a lucide icon). */
  leftIcon?: ReactNode;
  /** Decoration rendered at the end. */
  rightIcon?: ReactNode;
}

export const inputBase =
  "w-full rounded-xl neumorph-inset text-ink placeholder:text-muted-soft " +
  "px-3.5 py-2.5 text-sm outline-none transition-shadow " +
  "focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-0 " +
  "disabled:opacity-55 disabled:cursor-not-allowed";

/**
 * Single-line text input using the neumorphic inset surface.
 * `aria-invalid` (e.g. set by {@link Field}) also triggers the red ring.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, leftIcon, rightIcon, ...rest },
  ref,
) {
  const control = (
    <input
      ref={ref}
      aria-invalid={invalid || rest["aria-invalid"]}
      className={cn(
        inputBase,
        (invalid || rest["aria-invalid"]) &&
          "ring-2 ring-danger/60 aria-[invalid=true]:ring-danger/60",
        leftIcon && "pl-10",
        rightIcon && "pr-10",
        className,
      )}
      {...rest}
    />
  );

  if (!leftIcon && !rightIcon) return control;

  return (
    <div className="relative">
      {leftIcon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-soft [&_svg]:w-4 [&_svg]:h-4">
          {leftIcon}
        </span>
      )}
      {control}
      {rightIcon && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-soft [&_svg]:w-4 [&_svg]:h-4">
          {rightIcon}
        </span>
      )}
    </div>
  );
});
