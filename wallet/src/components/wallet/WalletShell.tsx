"use client";

import type { JSX, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { logout } from "@/lib/api/endpoints";
import { ApiClientError } from "@/lib/api/client";
import { Button, useToast } from "@/components/ui";
import { WalletLogo } from "@/components/wallet/WalletLogo";
import ThemeToggle from "@/components/ui/ThemeToggle";

const LOGIN_PATH = "/login";

/** Topbar with logo + sign-out, rendered inside the toast provider scope. */
function WalletTopbar(): JSX.Element {
  const router = useRouter();
  const toast = useToast();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      // A failed logout shouldn't trap the user — still surface the cause.
      if (err instanceof ApiClientError) {
        toast.error("Déconnexion", err.message);
      }
    } finally {
      router.replace(LOGIN_PATH);
    }
  };

  return (
    <header className="sticky top-0 z-40">
      <div className="glass border-b border-hairline/60">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 h-16 flex items-center justify-between">
          <WalletLogo />
          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<LogOut className="w-4 h-4" />}
              onClick={handleLogout}
            >
              Déconnexion
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}

/** Authenticated wallet chrome: topbar + centered content column. */
export function WalletShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="relative min-h-svh bg-mesh noise">
      <WalletTopbar />
      <main className="relative mx-auto max-w-6xl px-5 sm:px-8 py-8 sm:py-12">
        {children}
      </main>
    </div>
  );
}
