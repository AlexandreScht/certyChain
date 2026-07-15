"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Flag,
  Lock,
  ScrollText,
  ShieldAlert,
} from "lucide-react";

import { getSchoolJournal, reportJournalEntry } from "@/lib/api/endpoints";
import { ApiClientError } from "@/lib/api/client";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Table,
  Textarea,
  useToast,
  type TableColumn,
} from "@certifychain/shared/ui";
import { FadeIn } from "@/components/school";
import type { SchoolJournalEntryDTO } from "@certifychain/contract/dto";

const PAGE_SIZE = 20;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SchoolJournalPage() {
  const { success, error: toastError } = useToast();
  const [items, setItems] = useState<SchoolJournalEntryDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [issuanceFrozenAt, setIssuanceFrozenAt] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Report confirmation modal state.
  const [target, setTarget] = useState<SchoolJournalEntryDTO | null>(null);
  const [reason, setReason] = useState("");
  const [reporting, setReporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSchoolJournal({ page, pageSize: PAGE_SIZE });
      setItems(res.items);
      setTotal(res.total);
      setIssuanceFrozenAt(res.issuanceFrozenAt);
    } catch (err) {
      if (err instanceof ApiClientError) {
        toastError("Chargement impossible", err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [page, toastError]);

  useEffect(() => {
    void load();
  }, [load]);

  function openReport(entry: SchoolJournalEntryDTO) {
    setTarget(entry);
    setReason("");
  }

  async function confirmReport() {
    if (!target || reporting) return;
    setReporting(true);
    try {
      const result = await reportJournalEntry({
        diplomaId: target.diplomaId,
        reason: reason.trim() || undefined,
      });
      const reportedAt = new Date().toISOString();
      setItems((prev) =>
        prev.map((item) =>
          item.diplomaId === target.diplomaId ? { ...item, reportedAt } : item,
        ),
      );
      setIssuanceFrozenAt(result.issuanceFrozenAt);
      success(
        "Émission signalée",
        "L'émission de nouveaux diplômes est désormais gelée jusqu'à déblocage par un administrateur CertifyChain.",
      );
      setTarget(null);
    } catch (err) {
      if (err instanceof ApiClientError) {
        toastError("Signalement impossible", err.message);
      }
    } finally {
      setReporting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const columns: TableColumn<SchoolJournalEntryDTO>[] = [
    {
      key: "leafIndex",
      header: "Position",
      hideOnMobile: true,
      cell: (row) => (
        <span className="font-mono text-xs text-muted-soft">
          {(row.leafIndex + 1).toLocaleString("fr-FR")}
        </span>
      ),
    },
    {
      key: "holderName",
      header: "Diplômé",
      cell: (row) => (
        <span className="font-semibold text-ink">{row.holderName}</span>
      ),
    },
    {
      key: "programTitle",
      header: "Formation",
      cell: (row) => <span className="text-ink-soft">{row.programTitle}</span>,
    },
    {
      key: "issuedAt",
      header: "Émis le",
      hideOnMobile: true,
      cell: (row) => (
        <span className="whitespace-nowrap text-muted">
          {formatDate(row.issuedAt)}
        </span>
      ),
    },
    {
      key: "loggedAt",
      header: "Inscrit au registre le",
      hideOnMobile: true,
      cell: (row) => (
        <span className="whitespace-nowrap text-muted">
          {formatDateTime(row.loggedAt)}
        </span>
      ),
    },
    {
      key: "reportedAt",
      header: "Statut",
      align: "right",
      cell: (row) =>
        row.reportedAt ? (
          <Button
            size="sm"
            variant="subtle"
            disabled
            leftIcon={<Flag className="w-4 h-4" />}
          >
            Signalé le {formatDate(row.reportedAt)}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="subtle"
            onClick={() => openReport(row)}
            leftIcon={<Flag className="w-4 h-4" />}
            className="text-danger hover:text-danger"
          >
            Signaler
          </Button>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-7">
      <FadeIn>
        <PageHeader
          eyebrow="Traçabilité"
          title="Registre de"
          gradient="transparence"
          cool
          subtitle="Chaque diplôme émis par votre établissement est inscrit dans le registre public horodaté de CertifyChain. Consultez la liste et signalez toute émission que vous n'avez pas réalisée."
        />
      </FadeIn>

      {/* Persistent freeze banner — stays visible for the whole session while frozen. */}
      {issuanceFrozenAt && (
        <FadeIn>
          <div
            role="alert"
            className="rounded-2xl bg-danger/10 px-5 py-4 flex items-start gap-3"
          >
            <span className="shrink-0 w-9 h-9 rounded-xl grid place-items-center bg-danger text-white">
              <Lock className="w-4.5 h-4.5" />
            </span>
            <p className="text-sm text-ink-soft leading-relaxed">
              <span className="font-semibold text-ink">
                Émissions gelées depuis le {formatDateTime(issuanceFrozenAt)}.
              </span>{" "}
              Contactez un administrateur CertifyChain pour rétablir l&apos;émission.
            </p>
          </div>
        </FadeIn>
      )}

      {/* Table */}
      <FadeIn index={1}>
        <Table
          columns={columns}
          rows={items}
          loading={loading}
          loadingRows={PAGE_SIZE > 8 ? 8 : PAGE_SIZE}
          rowKey={(row) => row.diplomaId}
          empty={
            <EmptyState
              icon={<ScrollText />}
              title="Aucune émission inscrite"
              description="Les diplômes émis par votre établissement apparaîtront ici dès leur inscription au registre public."
            />
          }
        />
      </FadeIn>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted">
            {rangeStart}–{rangeEnd} sur {total.toLocaleString("fr-FR")}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="subtle"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              leftIcon={<ChevronLeft className="w-4 h-4" />}
            >
              Précédent
            </Button>
            <span className="text-sm font-semibold text-ink-soft px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              rightIcon={<ChevronRight className="w-4 h-4" />}
            >
              Suivant
            </Button>
          </div>
        </div>
      )}

      {/* Report confirmation modal */}
      <Modal
        open={target !== null}
        onClose={() => (reporting ? undefined : setTarget(null))}
        title="Signaler cette émission"
        description="Signaler cette émission gèle immédiatement toute nouvelle émission de diplômes de votre établissement jusqu'à déblocage par un administrateur CertifyChain. La vérification des diplômes déjà émis n'est pas affectée."
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setTarget(null)}
              disabled={reporting}
            >
              Annuler
            </Button>
            <Button
              onClick={() => void confirmReport()}
              loading={reporting}
              leftIcon={<Flag className="w-4.5 h-4.5" />}
              style={{
                background:
                  "linear-gradient(135deg, #EF4444 0%, #F43F5E 50%, #EC4899 100%)",
              }}
            >
              Confirmer le signalement
            </Button>
          </>
        }
      >
        {target && (
          <div className="flex flex-col gap-4">
            <div className="neumorph-inset rounded-2xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-ink truncate">
                    {target.holderName}
                  </div>
                  <div className="text-xs text-muted truncate">
                    {target.programTitle}
                  </div>
                </div>
                <Badge tone="neutral">{formatDate(target.issuedAt)}</Badge>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-2xl bg-amber-500/10 px-4 py-3">
              <ShieldAlert
                className="w-4 h-4 mt-0.5 shrink-0 text-amber-600"
                aria-hidden
              />
              <p className="text-xs text-ink-soft leading-relaxed">
                Cette action est réservée aux émissions que vous n&apos;avez pas
                réalisées vous-même (usurpation ou fuite de clé suspectée).
              </p>
            </div>

            <Field
              label="Motif (optionnel)"
              hint="Conservé dans le journal d'audit (500 caractères max)."
            >
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Ex. je n'ai jamais émis ce diplôme…"
              />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
