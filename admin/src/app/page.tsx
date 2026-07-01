"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  GraduationCap,
  ScanLine,
  Users,
  RefreshCw,
  ArrowRight,
  ClipboardCheck,
} from "lucide-react";

import { getAdminStats } from "@/lib/api/endpoints";
import { ApiClientError } from "@/lib/api/client";
import { Button, Card, Stat, Skeleton, PageHeader, useToast } from "@/components/ui";
import { FadeIn } from "@/components/admin";
import type { AdminStatsDTO } from "@contract/dto";

const AUDIT_LABELS: Record<string, string> = {
  school_registered: "Inscription d'école",
  school_approved: "École validée",
  school_auto_approved: "École auto-validée (IA)",
  school_provisional: "Existence confirmée (→ propriété)",
  school_rejected: "École refusée",
  school_revoked: "École révoquée",
  verification_method_chosen: "Méthode de propriété choisie",
  ownership_verified: "Propriété vérifiée",
  verification_failed: "Échec vérification propriété",
  school_login: "Connexion école",
  student_login: "Connexion élève",
  admin_login: "Connexion admin",
  issuance: "Émission de diplôme",
  revocation: "Révocation de diplôme",
  share_created: "Lien de partage créé",
  verification: "Vérification",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminDashboardPage() {
  const { error: toastError } = useToast();
  const [stats, setStats] = useState<AdminStatsDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await getAdminStats());
    } catch (err) {
      if (err instanceof ApiClientError) toastError("Chargement impossible", err.message);
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    void load();
  }, [load]);

  const tiles: { value: number; label: string; icon: ReactNode; hint?: string }[] = stats
    ? [
        {
          value: stats.schools.total,
          label: "Écoles",
          icon: <Building2 />,
          hint: `${stats.schools.pending} en attente · ${stats.schools.provisional} propriété · ${stats.schools.approved} validées`,
        },
        {
          value: stats.diplomas.total,
          label: "Diplômes émis",
          icon: <GraduationCap />,
          hint: `${stats.diplomas.active} actifs · ${stats.diplomas.revoked} révoqués`,
        },
        { value: stats.students, label: "Élèves", icon: <Users /> },
        { value: stats.verifications, label: "Vérifications", icon: <ScanLine /> },
      ]
    : [];

  const pending = stats?.schools.pending ?? 0;

  return (
    <div className="flex flex-col gap-7">
      <FadeIn>
        <PageHeader
          eyebrow="Administration"
          title="Vue d'ensemble"
          gradient="de la plateforme"
          cool
          subtitle="Activité globale, écoles, diplômes et vérifications."
          actions={
            <Button
              variant="subtle"
              size="sm"
              onClick={() => void load()}
              leftIcon={<RefreshCw className="w-4 h-4" />}
              disabled={loading}
            >
              Actualiser
            </Button>
          }
        />
      </FadeIn>

      {/* Pending review CTA */}
      {!loading && pending > 0 && (
        <FadeIn>
          <Card strong glow className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-magenta-500/12 text-magenta-500 shrink-0">
                <ClipboardCheck className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-display font-bold text-ink text-base">
                  {pending} école{pending > 1 ? "s" : ""} en attente de validation
                </h3>
                <p className="text-sm text-muted mt-0.5">
                  Examinez le score IA et validez ou refusez les demandes.
                </p>
              </div>
            </div>
            <Button as="a" href="/schools?status=pending" rightIcon={<ArrowRight className="w-4.5 h-4.5" />}>
              Examiner
            </Button>
          </Card>
        </FadeIn>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {loading || !stats
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="neumorph-sm rounded-2xl px-4 py-3.5 flex flex-col gap-3">
                <Skeleton width={28} height={28} circle />
                <Skeleton width="55%" height={22} />
                <Skeleton width="80%" height={12} />
              </div>
            ))
          : tiles.map((tile, i) => (
              <FadeIn key={tile.label} index={i}>
                <Stat
                  value={tile.value.toLocaleString("fr-FR")}
                  label={tile.label}
                  icon={tile.icon}
                  hint={tile.hint}
                />
              </FadeIn>
            ))}
      </div>

      {/* Recent activity */}
      <FadeIn index={1}>
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-ink text-base">Activité récente</h3>
            <Link
              href="/audit"
              className="text-sm font-semibold text-indigo-600 hover:text-indigo-500 transition-colors"
            >
              Tout le journal
            </Link>
          </div>

          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} width="100%" height={20} />
              ))}
            </div>
          ) : stats && stats.recentActivity.length > 0 ? (
            <ul className="flex flex-col divide-y divide-hairline/70">
              {stats.recentActivity.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-ink-soft">
                      {AUDIT_LABELS[entry.type] ?? entry.type}
                    </span>
                    {entry.schoolName && (
                      <span className="text-sm text-muted"> · {entry.schoolName}</span>
                    )}
                    {entry.result && (
                      <span className="text-xs text-muted-soft"> ({entry.result})</span>
                    )}
                  </div>
                  <time className="shrink-0 text-xs text-muted-soft">
                    {formatDateTime(entry.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Aucune activité pour le moment.</p>
          )}
        </Card>
      </FadeIn>
    </div>
  );
}
