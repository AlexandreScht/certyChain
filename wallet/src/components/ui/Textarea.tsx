import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { inputBase } from "./Input";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Render the control in its invalid state (red ring). */
  invalid?: boolean;
}

/**
 * Multi-line text input sharing the neumorphic inset surface of {@link Input}.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, invalid, rows = 4, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        aria-invalid={invalid || rest["aria-invalid"]}
        className={cn(
          inputBase,
          "resize-y leading-relaxed",
          (invalid || rest["aria-invalid"]) && "ring-2 ring-danger/60",
          className,
        )}
        {...rest}
      />
    );
  },
);
