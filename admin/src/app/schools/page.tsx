"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";

import { listAdminSchools } from "@/lib/api/endpoints";
import { ApiClientError } from "@/lib/api/client";
import { Button, Card, Input, Select, Table, PageHeader, useToast, type TableColumn } from "@/components/ui";
import { FadeIn, SchoolStatusBadge } from "@/components/admin";
import type { AdminSchoolListDTO, AdminSchoolListItemDTO } from "@contract/dto";

const STATUS_OPTIONS = [
  { value: "", label: "Tous les statuts" },
  { value: "pending", label: "En attente" },
  { value: "approved", label: "Validées" },
  { value: "rejected", label: "Refusées" },
  { value: "revoked", label: "Révoquées" },
];

function scoreColor(score: number | null): string {
  if (score === null) return "text-muted-soft";
  if (score >= 85) return "text-success";
  if (score >= 60) return "text-amber-500";
  return "text-danger";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function SchoolsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { error: toastError } = useToast();

  const [status, setStatus] = useState<string>(searchParams.get("status") ?? "");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminSchoolListDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAdminSchools({
        status: (status || undefined) as AdminSchoolListItemDTO["status"] | undefined,
        q: query || undefined,
        page,
      });
      setData(res);
    } catch (err) {
      if (err instanceof ApiClientError) toastError("Chargement impossible", err.message);
    } finally {
      setLoading(false);
    }
  }, [status, query, page, toastError]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  const columns: TableColumn<AdminSchoolListItemDTO>[] = [
    {
      key: "name",
      header: "Établissement",
      cell: (row) => (
        <div className="min-w-0">
          <div className="font-semibold text-ink truncate">{row.name}</div>
          {row.siret && (
            <div className="text-xs text-muted-soft flex items-center gap-1">
              SIRET {row.siret}
              {row.sireneVerified === true && (
                <CheckCircle2 className="w-3 h-3 text-success" aria-label="SIRENE vérifié" />
              )}
            </div>
          )}
        </div>
      ),
    },
    { key: "status", header: "Statut", cell: (row) => <SchoolStatusBadge status={row.status} /> },
    {
      key: "validationScore",
      header: "Score IA",
      align: "center",
      cell: (row) => (
        <span className={`font-display font-bold ${scoreColor(row.validationScore)}`}>
          {row.validationScore === null ? "—" : row.validationScore}
        </span>
      ),
    },
    {
      key: "diplomaCount",
      header: "Diplômes",
      align: "center",
      hideOnMobile: true,
      cell: (row) => <span className="text-muted">{row.diplomaCount}</span>,
    },
    {
      key: "createdAt",
      header: "Inscrite le",
      hideOnMobile: true,
      cell: (row) => <span className="text-muted">{formatDate(row.createdAt)}</span>,
    },
  ];

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <FadeIn>
        <PageHeader
          eyebrow="Établissements"
          title="Validation des"
          gradient="écoles"
          cool
          subtitle="Approuvez, refusez ou révoquez les établissements, assistés par le score IA."
        />
      </FadeIn>

      <FadeIn>
        <Card className="p-4 flex flex-col sm:flex-row gap-3">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <Input
              type="search"
              placeholder="Rechercher par nom ou SIRET…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search />}
            />
            <Button type="submit" variant="subtle">
              Rechercher
            </Button>
          </form>
          <Select
            options={STATUS_OPTIONS}
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            className="sm:w-52"
            aria-label="Filtrer par statut"
          />
        </Card>
      </FadeIn>

      <FadeIn index={1}>
        <Table
          columns={columns}
          rows={data?.items ?? []}
          loading={loading}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/schools/${row.id}`)}
        />
      </FadeIn>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            {data.total} établissement{data.total > 1 ? "s" : ""}
          </span>
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

export default function AdminSchoolsPage() {
  return (
    <Suspense fallback={null}>
      <SchoolsView />
    </Suspense>
  );
}
