"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Search,
  Filter,
  Ban,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Lock,
  Plus,
} from "lucide-react";

import { listDiplomas, revokeDiploma } from "@/lib/api/endpoints";
import { ApiClientError } from "@/lib/api/client";
import {
  Button,
  Card,
  Field,
  Input,
  Select,
  Table,
  Modal,
  Badge,
  EmptyState,
  Textarea,
  useToast,
  type TableColumn,
} from "@/components/ui";
import { FadeIn, DiplomaStatusBadge } from "@/components/school";
import { useCanEmit } from "@/hooks/useSchoolSession";
import type { DiplomaDTO } from "@contract/dto";
import type { DiplomaStatus } from "@contract/enums";

const LOCKED_EMIT_TITLE = "Disponible une fois la propriété de l'établissement vérifiée";

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: "", label: "Tous les statuts" },
  { value: "active", label: "Actifs" },
  { value: "revoked", label: "Révoqués" },
];

function buildYearOptions(): { value: string; label: string }[] {
  const current = new Date().getFullYear();
  const years: { value: string; label: string }[] = [
    { value: "", label: "Toutes les années" },
  ];
  for (let y = current; y >= current - 12; y--) {
    years.push({ value: String(y), label: String(y) });
  }
  return years;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function SchoolDiplomasPage() {
  const { success, error: toastError } = useToast();
  const canEmit = useCanEmit();
  const yearOptions = useMemo(() => buildYearOptions(), []);

  // Committed filters (drive the request).
  const [status, setStatus] = useState<"" | DiplomaStatus>("");
  const [year, setYear] = useState("");
  const [q, setQ] = useState("");
  // Pending search text (committed on submit).
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<DiplomaDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Revoke modal state.
  const [target, setTarget] = useState<DiplomaDTO | null>(null);
  const [reason, setReason] = useState("");
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listDiplomas({
        status: status || undefined,
        year: year ? Number(year) : undefined,
        q: q || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      if (err instanceof ApiClientError) {
        toastError("Chargement impossible", err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [status, year, q, page, toastError]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleSearchSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setQ(searchInput.trim());
    setPage(1);
  }

  function openRevoke(diploma: DiplomaDTO) {
    setTarget(diploma);
    setReason("");
  }

  async function confirmRevoke() {
    if (!target || revoking) return;
    setRevoking(true);
    try {
      const updated = await revokeDiploma(target.id, {
        reason: reason.trim() || undefined,
      });
      setItems((prev) =>
        prev.map((d) => (d.id === updated.id ? updated : d)),
      );
      success(
        "Diplôme révoqué",
        `${updated.holderName} — ${updated.programTitle}`,
      );
      setTarget(null);
    } catch (err) {
      if (err instanceof ApiClientError) {
        toastError("Révocation impossible", err.message);
      }
    } finally {
      setRevoking(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const columns: TableColumn<DiplomaDTO>[] = [
    {
      key: "holderName",
      header: "Titulaire",
      cell: (d) => (
        <div className="min-w-0">
          <div className="font-semibold text-ink truncate">{d.holderName}</div>
          <div className="text-xs text-muted-soft truncate">{d.holderEmail}</div>
        </div>
      ),
    },
    {
      key: "programTitle",
      header: "Programme",
      cell: (d) => (
        <div className="min-w-0">
          <div className="text-ink-soft truncate">{d.programTitle}</div>
          {d.mention && (
            <div className="text-xs text-muted-soft truncate">{d.mention}</div>
          )}
        </div>
      ),
    },
    {
      key: "issuedAt",
      header: "Émis le",
      hideOnMobile: true,
      cell: (d) => (
        <span className="whitespace-nowrap text-muted">
          {formatDate(d.issuedAt)}
        </span>
      ),
    },
    {
      key: "externalId",
      header: "Réf. externe",
      hideOnMobile: true,
      cell: (d) =>
        d.externalId ? (
          <span className="font-mono text-xs text-muted">{d.externalId}</span>
        ) : (
          <span className="text-muted-soft">—</span>
        ),
    },
    {
      key: "status",
      header: "Statut",
      align: "center",
      cell: (d) => <DiplomaStatusBadge status={d.status} />,
    },
    {
      key: "id",
      header: "Action",
      align: "right",
      cell: (d) =>
        d.status === "active" ? (
          <Button
            variant="subtle"
            size="sm"
            onClick={() => openRevoke(d)}
            leftIcon={<Ban className="w-4 h-4" />}
            className="text-danger hover:text-danger"
          >
            Révoquer
          </Button>
        ) : (
          <span className="text-xs text-muted-soft">Révoqué</span>
        ),
    },
  ];

  const hasFilters = Boolean(status || year || q);

  return (
    <div className="flex flex-col gap-7">
      <FadeIn>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 neumorph-pill rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-soft mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              {total.toLocaleString("fr-FR")} diplôme{total > 1 ? "s" : ""}
            </div>
            <h1 className="font-display font-bold text-ink tracking-tight text-3xl md:text-4xl leading-[1.08]">
              Registre des <span className="grad-text-cool">diplômes</span>
            </h1>
            <p className="mt-3 text-base text-muted leading-relaxed max-w-2xl">
              Consultez, filtrez et révoquez les diplômes émis par votre
              établissement.
            </p>
          </div>
          <Button
            as="a"
            href={canEmit ? "/ecole/diplomes/nouveau" : "#"}
            aria-disabled={!canEmit}
            title={canEmit ? undefined : LOCKED_EMIT_TITLE}
            tabIndex={canEmit ? undefined : -1}
            onClick={canEmit ? undefined : (e) => e.preventDefault()}
            leftIcon={canEmit ? <Plus className="w-4.5 h-4.5" /> : <Lock className="w-4 h-4" />}
          >
            Émettre
          </Button>
        </div>
      </FadeIn>

      {/* Filters */}
      <FadeIn index={1}>
        <Card className="p-4 sm:p-5">
          <form
            onSubmit={handleSearchSubmit}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_180px_180px_auto] lg:items-end"
          >
            <Field label="Recherche" className="min-w-0">
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Titulaire, programme, e-mail…"
                leftIcon={<Search />}
              />
            </Field>
            <Field label="Statut">
              <Select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as "" | DiplomaStatus);
                  setPage(1);
                }}
                options={STATUS_OPTIONS}
              />
            </Field>
            <Field label="Année d'émission">
              <Select
                value={year}
                onChange={(e) => {
                  setYear(e.target.value);
                  setPage(1);
                }}
                options={yearOptions}
              />
            </Field>
            <Button
              type="submit"
              variant="ghost"
              leftIcon={<Filter className="w-4 h-4" />}
            >
              Filtrer
            </Button>
          </form>
        </Card>
      </FadeIn>

      {/* Table */}
      <FadeIn index={2}>
        <Table
          columns={columns}
          rows={items}
          loading={loading}
          loadingRows={PAGE_SIZE > 8 ? 8 : PAGE_SIZE}
          rowKey={(d) => d.id}
          empty={
            <EmptyState
              icon={<GraduationCap />}
              title={hasFilters ? "Aucun résultat" : "Aucun diplôme émis"}
              description={
                hasFilters
                  ? "Aucun diplôme ne correspond à ces filtres. Ajustez votre recherche."
                  : "Émettez votre premier diplôme numérique pour le voir apparaître ici."
              }
              action={
                hasFilters ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setStatus("");
                      setYear("");
                      setQ("");
                      setSearchInput("");
                      setPage(1);
                    }}
                  >
                    Réinitialiser les filtres
                  </Button>
                ) : canEmit ? (
                  <Button
                    as="a"
                    href="/ecole/diplomes/nouveau"
                    leftIcon={<Plus className="w-4.5 h-4.5" />}
                  >
                    Émettre un diplôme
                  </Button>
                ) : (
                  <Button
                    as="a"
                    href="#"
                    aria-disabled
                    title={LOCKED_EMIT_TITLE}
                    tabIndex={-1}
                    onClick={(e) => e.preventDefault()}
                    leftIcon={<Lock className="w-4 h-4" />}
                  >
                    Émettre un diplôme
                  </Button>
                )
              }
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

      {/* Revoke modal */}
      <Modal
        open={target !== null}
        onClose={() => (revoking ? undefined : setTarget(null))}
        title="Révoquer ce diplôme"
        description="La révocation est définitive. Toute vérification future indiquera ce diplôme comme révoqué."
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setTarget(null)}
              disabled={revoking}
            >
              Annuler
            </Button>
            <Button
              onClick={confirmRevoke}
              loading={revoking}
              leftIcon={<Ban className="w-4.5 h-4.5" />}
              style={{
                background:
                  "linear-gradient(135deg, #EF4444 0%, #F43F5E 50%, #EC4899 100%)",
              }}
            >
              Confirmer la révocation
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
                    {target.mention ? ` · ${target.mention}` : ""}
                  </div>
                </div>
                <Badge tone="neutral">{formatDate(target.issuedAt)}</Badge>
              </div>
            </div>

            <Field
              label="Motif de révocation"
              hint="Optionnel — conservé dans le journal d'audit (280 caractères max)."
            >
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={280}
                rows={3}
                placeholder="Ex. erreur de saisie, diplôme délivré par erreur…"
              />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
