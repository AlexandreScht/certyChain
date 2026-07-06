"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type JSX,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "../lib/cn";

export interface ModalProps {
  /** Whether the dialog is visible. */
  open: boolean;
  /** Called on Esc, backdrop click, or the close button. */
  onClose: () => void;
  /** Dialog title (rendered in the header, wires `aria-labelledby`). */
  title?: ReactNode;
  /** Optional supporting description under the title. */
  description?: ReactNode;
  /** Body content. */
  children?: ReactNode;
  /** Footer content (typically action buttons). */
  footer?: ReactNode;
  /** Max width preset. */
  size?: "sm" | "md" | "lg";
  /** Disable closing when clicking the backdrop. */
  disableBackdropClose?: boolean;
  /** Hide the top-right close button. */
  hideCloseButton?: boolean;
  className?: string;
}

const sizes: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal dialog with backdrop blur and Framer Motion transitions.
 * Closes on Esc and backdrop click, locks body scroll, restores focus on close,
 * and provides a minimal Tab focus trap. Reduced-motion safe.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  disableBackdropClose = false,
  hideCloseButton = false,
  className,
}: ModalProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const reduce = useReducedMotion();
  const titleId = useId();
  const descId = useId();

  // Esc to close + minimal Tab focus trap.
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const nodes = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((el) => el.offsetParent !== null);
        if (nodes.length === 0) {
          e.preventDefault();
          panelRef.current.focus();
          return;
        }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    document.addEventListener("keydown", onKeyDown, true);

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    // Focus the panel (or first focusable inside) on open.
    const raf = requestAnimationFrame(() => {
      const node = panelRef.current;
      if (!node) return;
      const focusable = node.querySelector<HTMLElement>(FOCUSABLE);
      (focusable ?? node).focus();
    });

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = overflow;
      cancelAnimationFrame(raf);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onKeyDown]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            onClick={disableBackdropClose ? undefined : onClose}
            className="absolute inset-0 bg-ink/30 backdrop-blur-md"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            initial={
              reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{
              duration: reduce ? 0 : 0.25,
              ease: [0.2, 0.8, 0.2, 1],
            }}
            className={cn(
              "relative w-full glass-strong rounded-[1.75rem] p-6 outline-none",
              sizes[size],
              className,
            )}
          >
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="absolute right-4 top-4 w-8 h-8 rounded-full neumorph-pill grid place-items-center text-muted hover:text-ink transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {(title || description) && (
              <div className="mb-4 pr-8">
                {title && (
                  <h2
                    id={titleId}
                    className="font-display font-bold text-ink text-xl leading-tight"
                  >
                    {title}
                  </h2>
                )}
                {description && (
                  <p id={descId} className="mt-1 text-sm text-muted">
                    {description}
                  </p>
                )}
              </div>
            )}

            {children && <div className="text-sm text-ink-soft">{children}</div>}

            {footer && (
              <div className="mt-6 flex items-center justify-end gap-3">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
