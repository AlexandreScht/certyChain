/**
 * Stub Jest de `next/link` — rend une ancre nue (pas de routeur App requis).
 * Mappé par projet dans jest.config.cjs (`^next/link$`), uniquement pour les
 * specs composants ; la navigation réelle reste couverte par le smoke E2E.
 */
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react";

interface LinkStubProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string | { pathname?: string | null };
  children?: ReactNode;
  prefetch?: boolean;
  scroll?: boolean;
  replace?: boolean;
}

const Link = forwardRef<HTMLAnchorElement, LinkStubProps>(function LinkStub(
  { href, prefetch: _prefetch, scroll: _scroll, replace: _replace, children, ...rest },
  ref,
) {
  const resolved = typeof href === "string" ? href : (href?.pathname ?? "");
  return (
    <a ref={ref} href={resolved} {...rest}>
      {children}
    </a>
  );
});

export default Link;
