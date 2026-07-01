"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  X,
  XCircle,
  Ban,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  KeyRound,
  Mail,
  Building2,
  GraduationCap,
  ScanLine,
} from "lucide-react";

import {
  getAdminSchool,
  approveSchool,
  rejectSchool,
  revokeSchool,
  revalidateSchool,
} from "@/lib/api/endpoints";
import { ApiClientError } from "@/lib/api/client";
import { Button, Card, Stat, Skeleton, Modal, Field, Textarea, useToast } from "@/components/ui";
import { FadeIn, ScoreGauge, SchoolStatusBadge } from "@/components/admin";
import { cn } from "@/lib/utils";
import type { AdminSchoolDetailDTO, ValidationSignal } from "@contract/dto";

/** One color-coded chip explaining, at a glance, a piece of the AI score. */
function SignalChip({ signal }: { signal: ValidationSignal }) {
  const Icon = signal.status === "good" ? Check : signal.status === "bad" ? X : AlertTriangle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        signal.status === "good" && "bg-success/12 text-success",
        signal.status === "warn" && "bg-amber-500/15 text-amber-600",
        signal.status === "bad" && "bg-danger/12 text-danger",
      )}
    >
      <Icon className="w-3 h-3 shrink-0" aria-hidden />
      {signal.label}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-hairline/60 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-medium text-ink-soft text-right break-words">{value}</span>
    </div>
  );
}

export default function AdminSchoolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [school, setSchool] = useState<AdminSchoolDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [modal, setModal] = useState<null | "reject" | "revoke">(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSchool(await getAdminSchool(id));
    } catch (err) {
      if (err instanceof ApiClientError) toastError("Chargement impossible", err.message);
    } finally {
      setLoading(false);
    }
  }, [id, toastError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function doApprove() {
    if (acting) return;
    setActing(true);
    try {
      setSchool(await approveSchool(id));
      success(
        "Existence confirmée",
        "L'établissement passe en vérification de propriété : il doit prouver qu'il le contrôle (DNS, courrier ou ProConnect) avant d'émettre. Les clés PKI ne sont générées qu'à ce moment.",
      );
    } catch (err) {
      if (err instanceof ApiClientError) toastError("Validation impossible", err.message);
    } finally {
      setActing(false);
    }
  }

  async function doRevalidate() {
    if (acting) return;
    setActing(true);
    try {
      setSchool(await revalidateSchool(id));
      success("Réévaluation terminée", "Le score IA a été recalculé.");
    } catch (err) {
      if (err instanceof ApiClientError) toastError("Réévaluation impossible", err.message);
    } finally {
      setActing(false);
    }
  }

  async function submitReason() {
    if (acting || !modal || reason.trim().length < 3) return;
    setActing(true);
    try {
      const updated = modal === "reject" ? await rejectSchool(id, reason.trim()) : await revokeSchool(id, reason.trim());
      setSchool(updated);
      success(modal === "reject" ? "École refusée" : "École révoquée", "L'action a été enregistrée.");
      setModal(null);
      setReason("");
    } catch (err) {
      if (err instanceof ApiClientError) toastError("Action impossible", err.message);
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton width={220} height={32} />
        <div className="grid lg:grid-cols-3 gap-5">
          <Skeleton height={260} className="rounded-[1.75rem]" />
          <Skeleton height={260} className="rounded-[1.75rem] lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (!school) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted">Établissement introuvable.</p>
        <Button as="a" href="/schools" variant="subtle" className="mt-4">
          Retour aux écoles
        </Button>
      </Card>
    );
  }

  const isApproved = school.status === "approved";
  const isPending = school.status === "pending";
  // "Valider l'existence" → provisional (no keys). Available while the school is
  // not yet approved/provisional: from pending, or overturning a rejected/revoked.
  const canApprove = isPending || school.status === "rejected" || school.status === "revoked";
  // A provisional or approved school can be revoked.
  const canRevoke = isApproved || school.status === "provisional";

  return (
    <div className="flex flex-col gap-6">
      <FadeIn>
        <button
          type="button"
          onClick={() => router.push("/schools")}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Écoles
        </button>
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="font-display font-bold text-ink text-2xl sm:text-3xl tracking-tight">
              {school.name}
            </h1>
            <SchoolStatusBadge status={school.status} />
            {school.autoValidated && (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-semibold text-indigo-600">
                <Sparkles className="w-3 h-3" /> Auto-validée
              </span>
            )}
            {school.sireneVerified === true && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2.5 py-1 text-[11px] font-semibold text-success">
                <Building2 className="w-3 h-3" /> SIRENE vérifié
              </span>
            )}
            {school.sireneVerified === false && (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger/12 px-2.5 py-1 text-[11px] font-semibold text-danger">
                <Building2 className="w-3 h-3" /> SIRENE non confirmé
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="subtle"
              size="sm"
              onClick={doRevalidate}
              loading={acting}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Réévaluer (IA)
            </Button>
            {canApprove && (
              <Button
                size="sm"
                onClick={doApprove}
                loading={acting}
                leftIcon={<CheckCircle2 className="w-4 h-4" />}
              >
                Valider l&apos;existence
              </Button>
            )}
            {isPending && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setModal("reject")}
                leftIcon={<XCircle className="w-4 h-4" />}
              >
                Refuser
              </Button>
            )}
            {canRevoke && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setModal("revoke")}
                leftIcon={<Ban className="w-4 h-4" />}
              >
                Révoquer
              </Button>
            )}
          </div>
        </div>
      </FadeIn>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* AI validation */}
        <FadeIn className="lg:col-span-1">
          <Card strong className="p-6 h-full flex flex-col items-center text-center">
            <h3 className="font-display font-bold text-ink text-base mb-4 self-start">
              Validation IA
            </h3>
            <ScoreGauge score={school.validationScore} />
            {school.validationSignals && school.validationSignals.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {school.validationSignals.map((s, i) => (
                  <SignalChip key={i} signal={s} />
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-muted leading-relaxed">
              {school.validationReasoning ?? "Aucune analyse IA disponible (revue manuelle)."}
            </p>
            {school.validationModel && (
              <p className="mt-3 text-[11px] text-muted-soft">
                {school.validationModel} · {formatDate(school.validatedAt)}
              </p>
            )}
          </Card>
        </FadeIn>

        {/* Info */}
        <FadeIn index={1} className="lg:col-span-2">
          <Card className="p-6 h-full">
            <h3 className="font-display font-bold text-ink text-base mb-2">Informations</h3>
            <InfoRow label="SIRET" value={school.siret ?? "—"} />
            <InfoRow
              label="Registre SIRENE (INSEE)"
              value={
                school.sireneVerified === true ? (
                  <span className="inline-flex items-center gap-1.5 text-success">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Vérifié — source officielle
                  </span>
                ) : school.sireneVerified === false ? (
                  <span className="text-danger">Non confirmé</span>
                ) : (
                  <span className="text-muted-soft">Non vérifié</span>
                )
              }
            />
            {school.sireneLegalName && (
              <InfoRow label="Raison sociale officielle" value={school.sireneLegalName} />
            )}
            <InfoRow label="Code UAI (RNE)" value={school.uai ?? "—"} />
            <InfoRow label="Ville" value={school.city ?? "—"} />
            <InfoRow
              label="Domaine officiel (DNS)"
              value={
                school.verifiedOfficialDomain ? (
                  <span className="inline-flex items-center gap-1.5 text-success">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {school.verifiedOfficialDomain}
                  </span>
                ) : (
                  <span className="text-muted-soft">Non confirmé</span>
                )
              }
            />
            <InfoRow
              label="Contact"
              value={
                school.contactEmail ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-muted-soft" />
                    {school.contactEmail}
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <InfoRow label="Inscrite le" value={formatDate(school.createdAt)} />
            <InfoRow label="Validée le" value={formatDate(school.approvedAt)} />
            <InfoRow
              label="Clés PKI"
              value={
                school.hasKeys ? (
                  <span className="inline-flex items-center gap-1.5 text-success">
                    <KeyRound className="w-3.5 h-3.5" /> Générées
                  </span>
                ) : (
                  <span className="text-muted-soft">Non générées</span>
                )
              }
            />
            {school.statusReason && (
              <InfoRow label="Motif" value={<span className="text-danger">{school.statusReason}</span>} />
            )}
          </Card>
        </FadeIn>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <FadeIn>
          <Stat value={school.stats.totalDiplomas} label="Diplômes émis" icon={<GraduationCap />} />
        </FadeIn>
        <FadeIn index={1}>
          <Stat value={school.stats.activeDiplomas} label="Actifs" icon={<CheckCircle2 />} />
        </FadeIn>
        <FadeIn index={2}>
          <Stat value={school.stats.revokedDiplomas} label="Révoqués" icon={<Ban />} />
        </FadeIn>
        <FadeIn index={3}>
          <Stat value={school.stats.verifications} label="Vérifications" icon={<ScanLine />} />
        </FadeIn>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Admins */}
        <FadeIn>
          <Card className="p-6 h-full">
            <h3 className="font-display font-bold text-ink text-base mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600" /> Administrateurs
            </h3>
            {school.admins.length === 0 ? (
              <p className="text-sm text-muted">Aucun administrateur.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-hairline/60">
                {school.admins.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink-soft truncate">
                        {a.fullName ?? a.email}
                      </div>
                      <div className="text-xs text-muted-soft truncate">{a.email}</div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-soft">
                      {a.lastLoginAt ? `Vu ${formatDate(a.lastLoginAt)}` : "Jamais connecté"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </FadeIn>

        {/* Recent audit */}
        <FadeIn index={1}>
          <Card className="p-6 h-full">
            <h3 className="font-display font-bold text-ink text-base mb-3 flex items-center gap-2">
              <ScanLine className="w-4 h-4 text-indigo-600" /> Activité récente
            </h3>
            {school.recentAudit.length === 0 ? (
              <p className="text-sm text-muted">Aucune activité.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-hairline/60">
                {school.recentAudit.slice(0, 8).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm text-ink-soft">{e.type}</span>
                    <time className="shrink-0 text-xs text-muted-soft">{formatDate(e.createdAt)}</time>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </FadeIn>
      </div>

      <Modal
        open={modal !== null}
        onClose={() => {
          if (!acting) {
            setModal(null);
            setReason("");
          }
        }}
        title={modal === "reject" ? "Refuser l'établissement" : "Révoquer l'établissement"}
        description={
          modal === "reject"
            ? "L'établissement sera marqué comme refusé et ne pourra pas émettre de diplômes."
            : "La confiance est retirée : les vérifications de ses diplômes échoueront immédiatement."
        }
        footer={
          <>
            <Button
              variant="subtle"
              onClick={() => {
                setModal(null);
                setReason("");
              }}
              disabled={acting}
            >
              Annuler
            </Button>
            <Button onClick={submitReason} loading={acting} disabled={reason.trim().length < 3}>
              Confirmer
            </Button>
          </>
        }
      >
        <Field label="Motif" required>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Précisez la raison de cette décision…"
            maxLength={500}
          />
        </Field>
      </Modal>
    </div>
  );
}
