/**
 * Stub Jest de `@gsap/react` — `useGSAP` devient un no-op : le callback
 * d'animation n'est jamais exécuté, le rendu du composant reste intact.
 */
export function useGSAP(
  _callback?: unknown,
  _config?: unknown,
): { context: undefined; contextSafe: <T>(fn: T) => T } {
  return { context: undefined, contextSafe: (fn) => fn };
}
export default useGSAP;
