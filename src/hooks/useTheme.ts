"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

/** Reads/writes the active theme on <html data-theme>, persisted in localStorage.
 *  Components subscribe via the "themechange" window event so they re-render when
 *  the theme flips (e.g. the Navbar's JS-driven glass gradients). */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void } {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const read = () =>
      setThemeState((document.documentElement.dataset.theme as Theme) ?? "light");
    read();
    window.addEventListener("themechange", read);
    return () => window.removeEventListener("themechange", read);
  }, []);

  const apply = useCallback((t: Theme) => {
    const root = document.documentElement;
    root.dataset.theme = t;
    root.style.colorScheme = t;
    try {
      localStorage.setItem("theme", t);
    } catch {
      /* private mode / storage disabled */
    }
    window.dispatchEvent(new Event("themechange"));
  }, []);

  const setTheme = useCallback((t: Theme) => apply(t), [apply]);
  const toggle = useCallback(
    () => apply((document.documentElement.dataset.theme as Theme) === "dark" ? "light" : "dark"),
    [apply],
  );

  return { theme, setTheme, toggle };
}
