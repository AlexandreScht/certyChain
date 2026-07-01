"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  GraduationCap,
  CheckCircle2,
  Ban,
  ScanLine,
  KeyRound,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

import { getMySchool, getMyStats, activateSchool } from "@/lib/api/endpoints";
import { ApiClientError } from "@/lib/api/client";
import {
  Button,
  Card,
  Stat,
  Skeleton,
  PageHeader,
  useToast,
} from "@/components/ui";
import { FadeIn, SchoolStatusBadge } from "@/components/school";
import type { SchoolDTO, SchoolStatsDTO } from "@contract/dto";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function SchoolDashboardPage() {
  const { success, error: toastError } = useToast();
  const [school, setSchool] = useState<SchoolDTO | null>(null);
  const [stats, setStats] = useState<SchoolStatsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [schoolData, statsData] = await Promise.all([
        getMySchool(),
        getMyStats(),
      ]);
      setSchool(schoolData);
      setStats(statsData);
    } catch (err) {
      if (err instanceof ApiClientError) {
        toastError("Chargement impossible", err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleActivate() {
    if (activating) return;
    setActivating(true);
    try {
      const updated = await activateSchool();
      setSchool(updated);
      success(
        "Établissement activé",
        "Vos clés PKI ont été générées. Vous pouvez désormais émettre des diplômes.",
      );
      // Refresh stats too (counts may have been initialised on activation).
      try {
        setStats(await getMyStats());
      } catch {
        /* non-blocking */
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        toastError("Activation impossible", err.message);
      }
    } finally {
      setActivating(false);
    }
  }

  const isApproved = school?.status === "approved";
  const isProvisional = school?.status === "provisional";

  const tiles: {
    value: number;
    label: string;
    icon: ReactNode;
    hint?: string;
  }[] = stats
    ? [
        {
          value: stats.totalDiplomas,
          label: "Diplômes émis",
          icon: <GraduationCap />,
          hint: `Dernière émission : ${formatDate(stats.lastIssuedAt)}`,
        },
        {
          value: stats.activeDiplomas,
          label: "Diplômes actifs",
          icon: <CheckCircle2 />,
        },
        {
          value: stats.revokedDiplomas,
          label: "Diplômes révoqués",
          icon: <Ban />,
        },
        {
          value: stats.verifications,
          label: "Vérifications",
          icon: <ScanLine />,
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-7">
      <FadeIn>
        <PageHeader
          eyebrow="Tableau de bord"
          title="Pilotez vos"
          gradient="diplômes numériques"
          cool
          subtitle={
            school
              ? `Bienvenue sur l'espace de ${school.name}.`
              : "Vue d'ensemble de l'activité de votre établissement."
          }
          actions={
            <div className="flex items-center gap-3">
              {school && <SchoolStatusBadge status={school.status} />}
              <Button
                variant="subtle"
                size="sm"
                onClick={() => void load()}
                leftIcon={<RefreshCw className="w-4 h-4" />}
                disabled={loading}
              >
                Actualiser
              </Button>
            </div>
          }
        />
      </FadeIn>

      {/* Ownership-proof CTA — shown while the school is provisional */}
      {!loading && school && isProvisional && (
        <FadeIn>
          <Card strong glow className="p-6 sm:p-7">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="relative shrink-0">
                <span className="absolute inset-0 rounded-2xl bg-cyan-500/20 animate-pulse-ring" />
                <span className="relative grid place-items-center w-14 h-14 rounded-2xl bg-linear-to-br from-cyan-500 to-indigo-600 text-white shadow-[0_12px_28px_-10px_rgba(6,182,212,0.6)]">
                  <ShieldCheck className="w-7 h-7" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="font-display font-bold text-ink text-lg">
                    Prouvez la propriété de votre établissement
                  </h2>
                  <SchoolStatusBadge status={school.status} />
                </div>
                <p className="text-sm text-muted leading-relaxed max-w-2xl">
                  L&apos;existence de votre établissement est confirmée. Dernière étape avant
                  d&apos;émettre des diplômes :{" "}
                  <span className="font-semibold text-ink-soft">
                    prouver que vous le contrôlez réellement
                  </span>{" "}
                  (DNS, courrier postal ou ProConnect).
                </p>
              </div>
              <div className="shrink-0">
                <Button
                  as="a"
                  href="/ecole/verification"
                  size="lg"
                  leftIcon={<ShieldCheck className="w-5 h-5" />}
                >
                  Vérifier la propriété
                </Button>
              </div>
            </div>
          </Card>
        </FadeIn>
      )}

      {/* Activation CTA (dev) — shown only while pending KYB */}
      {!loading && school && school.status === "pending" && (
        <FadeIn>
          <Card strong glow className="p-6 sm:p-7">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="relative shrink-0">
                <span className="absolute inset-0 rounded-2xl bg-indigo-500/20 animate-pulse-ring" />
                <span className="relative grid place-items-center w-14 h-14 rounded-2xl bg-linear-to-br from-indigo-600 to-indigo-500 text-white shadow-[0_12px_28px_-10px_rgba(79,70,229,0.6)]">
                  <KeyRound className="w-7 h-7" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="font-display font-bold text-ink text-lg">
                    Activez votre établissement
                  </h2>
                  <SchoolStatusBadge status={school.status} />
                </div>
                <p className="text-sm text-muted leading-relaxed max-w-2xl">
                  En production, l&apos;activation suit la validation KYB par nos
                  équipes. En développement, cette action en libre-service{" "}
                  <span className="font-semibold text-ink-soft">
                    génère immédiatement votre paire de clés PKI
                  </span>{" "}
                  (certificat d&apos;émetteur) et débloque l&apos;émission de diplômes.
                </p>
              </div>
              <div className="shrink-0">
                <Button
                  size="lg"
                  onClick={handleActivate}
                  loading={activating}
                  leftIcon={<Sparkles className="w-5 h-5" />}
                >
                  Activer (dev)
                </Button>
              </div>
            </div>
          </Card>
        </FadeIn>
      )}

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {loading || !stats
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="neumorph-sm rounded-2xl px-4 py-3.5 flex flex-col gap-3"
              >
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

      {/* Issuer certificate summary */}
      <FadeIn index={1}>
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <span className="grid place-items-center w-11 h-11 rounded-xl neumorph-sm text-indigo-600 shrink-0">
                <ScanLine className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-display font-bold text-ink text-base">
                  Certificat d&apos;émetteur PKI
                </h3>
                <p className="text-sm text-muted mt-0.5 max-w-xl leading-relaxed">
                  Chaque diplôme est signé par la clé privée de votre
                  établissement et vérifiable via une preuve à divulgation nulle
                  (ZKP).
                </p>
              </div>
            </div>
            <div className="shrink-0">
              {loading || !school ? (
                <Skeleton width={140} height={28} />
              ) : school.hasKeys ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-3 py-1.5 text-xs font-semibold text-success">
                  <CheckCircle2 className="w-4 h-4" />
                  Clés PKI générées
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/12 px-3 py-1.5 text-xs font-semibold text-danger">
                  <KeyRound className="w-4 h-4" />
                  Clés non générées
                </span>
              )}
            </div>
          </div>
        </Card>
      </FadeIn>

      {/* Quick action when approved */}
      {!loading && isApproved && (
        <FadeIn index={2}>
          <Card
            strong
            glow
            className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div>
              <h3 className="font-display font-bold text-ink text-base">
                Prêt à émettre
              </h3>
              <p className="text-sm text-muted mt-0.5">
                Délivrez un nouveau diplôme ou importez une promotion entière en CSV.
              </p>
            </div>
            <Button
              as="a"
              href="/ecole/diplomes/nouveau"
              rightIcon={<ArrowRight className="w-4.5 h-4.5" />}
            >
              Émettre un diplôme
            </Button>
          </Card>
        </FadeIn>
      )}
    </div>
  );
}
