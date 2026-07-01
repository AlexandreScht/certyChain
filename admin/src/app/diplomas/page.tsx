"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { listAdminDiplomas } from "@/lib/api/endpoints";
import { ApiClientError } from "@/lib/api/client";
import { Button, Card, Input, Select, Table, PageHeader, useToast, type TableColumn } from "@/components/ui";
import { FadeIn, DiplomaStatusBadge } from "@/components/admin";
import type { DiplomaDTO, DiplomaListDTO } from "@contract/dto";

const STATUS_OPTIONS = [
  { value: "", label: "Tous les statuts" },
  { value: "active", label: "Actifs" },
  { value: "revoked", label: "Révoqués" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminDiplomasPage() {
  const { error: toastError } = useToast();

  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DiplomaListDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(
        await listAdminDiplomas({
          status: (status || undefined) as DiplomaDTO["status"] | undefined,
          q: query || undefined,
          page,
        }),
      );
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

  const columns: TableColumn<DiplomaDTO>[] = [
    {
      key: "holderName",
      header: "Titulaire",
      cell: (row) => <span className="font-semibold text-ink">{row.holderName}</span>,
    },
    { key: "programTitle", header: "Diplôme", cell: (row) => <span className="text-ink-soft">{row.programTitle}</span> },
    {
      key: "schoolName",
      header: "Établissement",
      hideOnMobile: true,
      cell: (row) => <span className="text-muted">{row.schoolName}</span>,
    },
    { key: "status", header: "Statut", align: "center", cell: (row) => <DiplomaStatusBadge status={row.status} /> },
    {
      key: "issuedAt",
      header: "Émis le",
      hideOnMobile: true,
      cell: (row) => <span className="text-muted">{formatDate(row.issuedAt)}</span>,
    },
  ];

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <FadeIn>
        <PageHeader
          eyebrow="Supervision"
          title="Diplômes"
          gradient="émis"
          cool
          subtitle="Vue globale, en lecture seule, de tous les diplômes émis sur la plateforme."
        />
      </FadeIn>

      <FadeIn>
        <Card className="p-4 flex flex-col sm:flex-row gap-3">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <Input
              type="search"
              placeholder="Rechercher par titulaire ou diplôme…"
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
        <Table columns={columns} rows={data?.items ?? []} loading={loading} rowKey={(row) => row.id} />
      </FadeIn>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            {data.total} diplôme{data.total > 1 ? "s" : ""}
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
