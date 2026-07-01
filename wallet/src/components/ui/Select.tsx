"use client";

import {
  forwardRef,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputBase } from "./Input";

export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  /** Render the control in its invalid state (red ring). */
  invalid?: boolean;
  /** Options to render. Alternatively, pass native `<option>`s as children. */
  options?: SelectOption[];
  /** Disabled placeholder shown when the value is empty. */
  placeholder?: string;
  children?: ReactNode;
}

/**
 * Native `<select>` styled to match the neumorphic inputs, with a custom
 * chevron affordance. Uses the native control for full keyboard accessibility.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, options, placeholder, children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || rest["aria-invalid"]}
        className={cn(
          inputBase,
          "appearance-none pr-10 cursor-pointer",
          (invalid || rest["aria-invalid"]) && "ring-2 ring-danger/60",
          className,
        )}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options
          ? options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))
          : children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-soft"
      />
    </div>
  );
});
