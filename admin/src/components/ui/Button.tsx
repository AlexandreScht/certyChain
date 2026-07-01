import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "ghost" | "subtle";
export type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "cta-primary text-white",
  ghost: "cta-ghost text-ink",
  subtle: "neumorph-pill text-ink-soft hover:text-ink transition-colors",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "text-sm px-4 py-2 gap-1.5",
  md: "text-[0.95rem] px-5 py-2.5 gap-2",
  lg: "text-base md:text-lg px-7 py-3.5 gap-2.5",
};

const spinnerSize: Record<ButtonSize, "sm" | "md" | "lg"> = {
  sm: "sm",
  md: "sm",
  lg: "md",
};

const base =
  "relative inline-flex items-center justify-center rounded-full font-semibold cursor-pointer select-none whitespace-nowrap " +
  "disabled:opacity-55 disabled:pointer-events-none aria-disabled:opacity-55 aria-disabled:pointer-events-none " +
  "focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:outline-offset-3";

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables interaction. */
  loading?: boolean;
  /** Icon rendered before the label. */
  leftIcon?: ReactNode;
  /** Icon rendered after the label. */
  rightIcon?: ReactNode;
  /** Stretch to the full width of the container. */
  fullWidth?: boolean;
  children?: ReactNode;
}

type ButtonAsButton = CommonProps & {
  as?: "button";
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps | "as">;

type ButtonAsAnchor = CommonProps & {
  as: "a";
  href: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps | "as">;

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

/**
 * Primary action button wrapping the design-system CTA classes.
 * Render as a real `<a>` by passing `as="a"` with an `href` (keeps the same
 * visual treatment for navigation links).
 */
export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "md",
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    className,
    children,
  } = props;

  const classes = cn(
    base,
    variantClasses[variant],
    sizeClasses[size],
    fullWidth && "w-full",
    className,
  );

  const content = (
    <>
      {loading ? (
        <Spinner size={spinnerSize[size]} label="" />
      ) : (
        leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
      )}
      {children != null && <span className="min-w-0">{children}</span>}
      {!loading && rightIcon && (
        <span className="inline-flex shrink-0">{rightIcon}</span>
      )}
    </>
  );

  if (props.as === "a") {
    const {
      as: _as,
      variant: _v,
      size: _s,
      loading: _l,
      leftIcon: _li,
      rightIcon: _ri,
      fullWidth: _fw,
      className: _cn,
      children: _ch,
      ...anchorProps
    } = props;
    return (
      <a
        {...anchorProps}
        className={classes}
        aria-disabled={loading || undefined}
        aria-busy={loading || undefined}
      >
        {content}
      </a>
    );
  }

  const {
    as: _as,
    variant: _v,
    size: _s,
    loading: _l,
    leftIcon: _li,
    rightIcon: _ri,
    fullWidth: _fw,
    className: _cn,
    children: _ch,
    disabled,
    type,
    ...buttonProps
  } = props;

  return (
    <button
      {...buttonProps}
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes}
    >
      {content}
    </button>
  );
}
