"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { listAdminAudit } from "@/lib/api/endpoints";
import { ApiClientError } from "@/lib/api/client";
import { Button, Card, Select, Table, PageHeader, useToast, type TableColumn } from "@/components/ui";
import { FadeIn } from "@/components/admin";
import type { AdminAuditEntryDTO } from "@contract/dto";

const AUDIT_LABELS: Record<string, string> = {
  school_registered: "Inscription d'école",
  school_approved: "École validée",
  school_auto_approved: "École auto-validée (IA)",
  school_rejected: "École refusée",
  school_revoked: "École révoquée",
  school_login: "Connexion école",
  student_login: "Connexion élève",
  admin_login: "Connexion admin",
  issuance: "Émission de diplôme",
  revocation: "Révocation de diplôme",
  share_created: "Lien de partage créé",
  verification: "Vérification",
};

const TYPE_OPTIONS = [
  { value: "", label: "Tous les événements" },
  ...Object.entries(AUDIT_LABELS).map(([value, label]) => ({ value, label })),
];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminAuditPage() {
  const { error: toastError } = useToast();

  const [type, setType] = useState<string>("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    items: AdminAuditEntryDTO[];
    total: number;
    page: number;
    pageSize: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listAdminAudit({ type: type || undefined, page }));
    } catch (err) {
      if (err instanceof ApiClientError) toastError("Chargement impossible", err.message);
    } finally {
      setLoading(false);
    }
  }, [type, page, toastError]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: TableColumn<AdminAuditEntryDTO>[] = [
    {
      key: "type",
      header: "Événement",
      cell: (row) => <span className="font-semibold text-ink-soft">{AUDIT_LABELS[row.type] ?? row.type}</span>,
    },
    {
      key: "schoolName",
      header: "Établissement",
      hideOnMobile: true,
      cell: (row) => <span className="text-muted">{row.schoolName ?? "—"}</span>,
    },
    {
      key: "result",
      header: "Résultat",
      align: "center",
      cell: (row) => <span className="text-muted">{row.result ?? "—"}</span>,
    },
    {
      key: "createdAt",
      header: "Date",
      cell: (row) => <span className="text-muted">{formatDateTime(row.createdAt)}</span>,
    },
  ];

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <FadeIn>
        <PageHeader
          eyebrow="Traçabilité"
          title="Journal"
          gradient="d'audit"
          cool
          subtitle="Historique global des événements de la plateforme (RGPD : acteurs pseudonymisés)."
        />
      </FadeIn>

      <FadeIn>
        <Card className="p-4 flex justify-end">
          <Select
            options={TYPE_OPTIONS}
            value={type}
            onChange={(e) => {
              setPage(1);
              setType(e.target.value);
            }}
            className="sm:w-64"
            aria-label="Filtrer par type d'événement"
          />
        </Card>
      </FadeIn>

      <FadeIn index={1}>
        <Table columns={columns} rows={data?.items ?? []} loading={loading} rowKey={(row) => row.id} />
      </FadeIn>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>{data.total} événements</span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              leftIcon={<ChevronLeft className="w-4 h-4" />}
            >
              Précédent
            </Button>
            <span className="tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              rightIcon={<ChevronRight className="w-4 h-4" />}
            >
              Suivant
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
