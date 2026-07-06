"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "../lib/cn";

export type ToastTone = "success" | "error" | "info";

export interface ToastOptions {
  /** Title line. */
  title: ReactNode;
  /** Optional supporting description. */
  description?: ReactNode;
  /** Visual tone. Defaults to `info`. */
  tone?: ToastTone;
  /** Auto-dismiss delay in ms. `0` disables auto-dismiss. Defaults to 4500. */
  duration?: number;
}

interface ToastItem extends Required<Omit<ToastOptions, "description">> {
  id: number;
  description?: ReactNode;
}

interface ToastContextValue {
  /** Push a toast, returns its id. */
  toast: (options: ToastOptions) => number;
  /** Convenience: success toast. */
  success: (title: ReactNode, description?: ReactNode) => number;
  /** Convenience: error toast. */
  error: (title: ReactNode, description?: ReactNode) => number;
  /** Dismiss a toast early by id. */
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Access the toast API. Must be used under a {@link ToastProvider}.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast doit être utilisé à l'intérieur d'un <ToastProvider>.");
  }
  return ctx;
}

const toneStyles: Record<
  ToastTone,
  { icon: typeof Info; chip: string; accent: string }
> = {
  success: { icon: CheckCircle2, chip: "bg-success/12 text-success", accent: "bg-success" },
  error: { icon: AlertTriangle, chip: "bg-danger/12 text-danger", accent: "bg-danger" },
  info: { icon: Info, chip: "bg-indigo-100 text-indigo-600", accent: "bg-indigo-500" },
};

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}): JSX.Element {
  const reduce = useReducedMotion();
  const { icon: Icon, chip, accent } = toneStyles[item.tone];
  return (
    <motion.div
      layout={!reduce}
      role={item.tone === "error" ? "alert" : "status"}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.96 }}
      transition={{ duration: reduce ? 0 : 0.25, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative glass-strong rounded-2xl p-3.5 pr-9 flex items-start gap-3 overflow-hidden pointer-events-auto w-full"
    >
      <span aria-hidden className={cn("absolute left-0 top-0 bottom-0 w-1", accent)} />
      <span className={cn("shrink-0 w-8 h-8 rounded-xl grid place-items-center", chip)}>
        <Icon className="w-4.5 h-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink leading-tight">
          {item.title}
        </div>
        {item.description && (
          <div className="text-xs text-muted mt-0.5">{item.description}</div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Fermer la notification"
        className="absolute right-2.5 top-2.5 w-6 h-6 rounded-lg grid place-items-center text-muted-soft hover:text-ink transition-colors cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

export interface ToastProviderProps {
  children: ReactNode;
  /** Default auto-dismiss duration in ms. */
  defaultDuration?: number;
}

/**
 * Provides the toast context and renders the stacked, auto-dismissing glass
 * toast viewport in a portal (top-right). Reduced-motion safe.
 */
export function ToastProvider({
  children,
  defaultDuration = 4500,
}: ToastProviderProps): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (options: ToastOptions): number => {
      const id = ++idRef.current;
      const duration = options.duration ?? defaultDuration;
      const item: ToastItem = {
        id,
        title: options.title,
        description: options.description,
        tone: options.tone ?? "info",
        duration,
      };
      setItems((prev) => [...prev, item]);
      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [defaultDuration, dismiss],
  );

  const success = useCallback(
    (title: ReactNode, description?: ReactNode) =>
      toast({ title, description, tone: "success" }),
    [toast],
  );
  const error = useCallback(
    (title: ReactNode, description?: ReactNode) =>
      toast({ title, description, tone: "error" }),
    [toast],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ toast, success, error, dismiss }),
    [toast, success, error, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div
            aria-live="polite"
            className="pointer-events-none fixed top-4 right-4 z-[120] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2.5"
          >
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <ToastCard key={item.id} item={item} onDismiss={dismiss} />
              ))}
            </AnimatePresence>
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
