"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  GraduationCap,
  PlusCircle,
  ShieldCheck,
  CreditCard,
  LogOut,
  Lock,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";

import { logout } from "@/lib/api/endpoints";
import { ApiClientError } from "@/lib/api/client";
import { useToast } from "@certifychain/shared/ui";
import { useCanEmit } from "@/hooks/useSchoolSession";
import { cn } from "@certifychain/shared/lib/cn";
import ThemeToggle from "@certifychain/shared/ui/ThemeToggle";
import { SchoolLogo } from "./SchoolLogo";

interface NavLink {
  label: string;
  href: string;
  icon: LucideIcon;
  /** When true, the link is active only on an exact path match. */
  exact?: boolean;
  /** When true, this link is locked until the establishment is `approved`. */
  requiresApproval?: boolean;
}

const NAV_LINKS: NavLink[] = [
  { label: "Tableau de bord", href: "/ecole/dashboard", icon: LayoutDashboard },
  { label: "Vérification", href: "/ecole/verification", icon: ShieldCheck, exact: true },
  { label: "Diplômes", href: "/ecole/diplomes", icon: GraduationCap, exact: true },
  {
    label: "Émettre",
    href: "/ecole/diplomes/nouveau",
    icon: PlusCircle,
    requiresApproval: true,
  },
  { label: "Paramètres", href: "/ecole/parametres", icon: CreditCard, exact: true },
];

function isActive(pathname: string, link: NavLink): boolean {
  if (link.exact) return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

export interface AppShellProps {
  children: ReactNode;
}

/**
 * Glass app shell for the authenticated school portal: a fixed sidebar
 * (brand + nav + logout) and a sticky topbar, on the bg-mesh canvas.
 * Collapses to a slide-over drawer on mobile.
 */
export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { error: toastError } = useToast();
  const canEmit = useCanEmit();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } catch (err) {
      if (err instanceof ApiClientError) toastError("Déconnexion", err.message);
    } finally {
      router.replace("/ecole/login");
    }
  }

  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Navigation établissement">
      {NAV_LINKS.map((link) => {
        const active = isActive(pathname, link);
        const locked = link.requiresApproval === true && !canEmit;
        const Icon = link.icon;

        if (locked) {
          return (
            <span
              key={link.href}
              aria-disabled="true"
              title="Disponible une fois la propriété de l'établissement vérifiée"
              className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold text-muted-soft/60 cursor-not-allowed select-none"
            >
              <Icon className="w-[18px] h-[18px] shrink-0" />
              {link.label}
              <Lock className="w-3.5 h-3.5 shrink-0 ml-auto" />
            </span>
          );
        }

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
          <Link
            href="/ecole/dashboard"
            className="px-1.5 py-2 mb-4"
            aria-label="Tableau de bord"
          >
            <SchoolLogo />
          </Link>
          <div className="px-1.5 mb-2 text-[10px] uppercase tracking-wider text-muted-soft font-semibold">
            Portail établissement
          </div>
          {nav}
          <div className="mt-auto pt-4 border-t border-hairline/70">
            {logoutButton}
          </div>
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
                  <SchoolLogo />
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
                <div className="mt-auto pt-4 border-t border-hairline/70">
                  {logoutButton}
                </div>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Main column */}
      <div className="lg:pl-[260px] flex flex-col min-h-svh">
        {/* Topbar */}
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
              <SchoolLogo iconOnly />
            </div>
            <div className="hidden sm:flex items-center gap-2 text-sm font-semibold text-muted">
              <span className="text-ink-soft">Espace établissement</span>
            </div>
            <div className="ml-auto flex items-center gap-2.5">
              <ThemeToggle />
              <span className="hidden sm:inline-flex items-center gap-1.5 neumorph-pill rounded-full px-3 py-1.5 text-[11px] font-semibold text-success">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inset-0 rounded-full bg-success animate-pulse-ring" />
                  <span className="relative rounded-full w-1.5 h-1.5 bg-success" />
                </span>
                Session sécurisée
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
