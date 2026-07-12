/**
 * Polyfills jsdom pour les projets front.
 * - `window.matchMedia` : requis par `useReducedMotion` (framer-motion) et les
 *   composants qui lisent `prefers-reduced-motion`.
 * - `requestAnimationFrame` : requis par la gestion de focus du Modal (et par
 *   framer-motion) si l'environnement jsdom ne l'expose pas.
 */
if (typeof window !== "undefined" && typeof window.requestAnimationFrame !== "function") {
  window.requestAnimationFrame = (cb: FrameRequestCallback): number =>
    setTimeout(() => cb(Date.now()), 0) as unknown as number;
  window.cancelAnimationFrame = (id: number): void => clearTimeout(id);
}

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}
