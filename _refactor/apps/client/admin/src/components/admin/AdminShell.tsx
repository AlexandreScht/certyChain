"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  Building2,
  GraduationCap,
  ScrollText,
  Settings,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";

import { adminLogout } from "@/lib/api/endpoints";
import { ApiClientError } from "@/lib/api/client";
import { useToast } from "@certifychain/shared/ui";
import { cn } from "@certifychain/shared/lib/cn";
import ThemeToggle from "@certifychain/shared/ui/ThemeToggle";
import { AdminLogo } from "./AdminLogo";

interface NavLink {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
}

const NAV_LINKS: NavLink[] = [
  { label: "Tableau de bord", href: "/", icon: LayoutDashboard, exact: true },
  { label: "Écoles", href: "/schools", icon: Building2 },
  { label: "Diplômes", href: "/diplomas", icon: GraduationCap },
  { label: "Audit", href: "/audit", icon: ScrollText },
  { label: "Paramètres", href: "/settings", icon: Settings },
];

function isActive(pathname: string, link: NavLink): boolean {
  if (link.exact) return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { error: toastError } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await adminLogout();
    } catch (err) {
      if (err instanceof ApiClientError) toastError("Déconnexion", err.message);
    } finally {
      router.replace("/login");
    }
  }

  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Navigation administration">
      {NAV_LINKS.map((link) => {
        const active = isActive(pathname, link);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setDrawerOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-colors",
              active
                ? "neumorph-sm text-ink"
                : "text-muted hover:text-ink hover:bg-white/50 dark:hover:bg-white/5",
            )}
          >
            {active && (
              <span
                aria-hidden
                className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full bg-linear-to-b from-indigo-600 to-cyan-500"
              />
            )}
            <Icon
              className={cn(
                "w-[18px] h-[18px] shrink-0 transition-colors",
                active ? "text-indigo-600" : "text-muted-soft group-hover:text-indigo-500",
              )}
            />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );

  const logoutButton = (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loggingOut}
      className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold text-muted hover:text-danger hover:bg-danger/8 transition-colors cursor-pointer disabled:opacity-55 disabled:pointer-events-none"
    >
      <LogOut className="w-[18px] h-[18px] shrink-0" />
      {loggingOut ? "Déconnexion…" : "Déconnexion"}
    </button>
  );

  return (
    <div className="relative min-h-svh bg-mesh noise">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-[260px] flex-col p-4">
        <div className="glass-strong rounded-[1.75rem] flex flex-col h-full p-4 overflow-hidden">
          <Link href="/" className="px-1.5 py-2 mb-4" aria-label="Tableau de bord">
            <AdminLogo />
          </Link>
          <div className="px-1.5 mb-2 text-[10px] uppercase tracking-wider text-muted-soft font-semibold">
            Administration plateforme
          </div>
          {nav}
          <div className="mt-auto pt-4 border-t border-hairline/70">{logoutButton}</div>
        </div>
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <div className="lg:hidden fixed inset-0 z-50">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
              aria-hidden
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] p-4"
              role="dialog"
              aria-label="Menu de navigation"
            >
              <div className="glass-strong rounded-[1.75rem] flex flex-col h-full p-4 overflow-hidden">
                <div className="flex items-center justify-between px-1.5 py-2 mb-4">
                  <AdminLogo />
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    aria-label="Fermer le menu"
                    className="w-9 h-9 rounded-full neumorph-pill grid place-items-center text-muted hover:text-ink transition-colors cursor-pointer"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>
                {nav}
                <div className="mt-auto pt-4 border-t border-hairline/70">{logoutButton}</div>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Main column */}
      <div className="lg:pl-[260px] flex flex-col min-h-svh">
        <header className="sticky top-0 z-20 px-4 pt-4">
          <div className="glass rounded-full flex items-center gap-3 px-3 py-2.5 sm:px-4">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Ouvrir le menu"
              className="lg:hidden w-9 h-9 rounded-full neumorph-pill grid place-items-center text-ink cursor-pointer shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="lg:hidden">
              <AdminLogo iconOnly />
            </div>
            <div className="hidden sm:flex items-center gap-2 text-sm font-semibold text-muted">
              <span className="text-ink-soft">Espace administration</span>
            </div>
            <div className="ml-auto flex items-center gap-2.5">
              <ThemeToggle />
              <span className="hidden sm:inline-flex items-center gap-1.5 neumorph-pill rounded-full px-3 py-1.5 text-[11px] font-semibold text-success">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inset-0 rounded-full bg-success animate-pulse-ring" />
                  <span className="relative rounded-full w-1.5 h-1.5 bg-success" />
                </span>
                Session sécurisée · MFA
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
