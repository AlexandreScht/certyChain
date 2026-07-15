"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileCheck2,
  FileUp,
  History,
  PackageCheck,
  Send,
  Settings2,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  Table,
  useToast,
  type TableColumn,
} from "@certifychain/shared/ui";
import type {
  CdcEligibleDiplomaDTO,
  CdcExportDetailDTO,
  CdcExportDTO,
  CdcExportListDTO,
  CdcSettingsDTO,
} from "@certifychain/contract/dto";
import type {
  CdcExportStatus,
  CdcObtentionMethod,
} from "@certifychain/contract/enums";

import { FadeIn } from "@/components/school";
import { ApiClientError } from "@/lib/api/client";
import {
  cancelCdcExport,
  createCdcExport,
  deleteCdcIdentity,
  downloadCdcExport,
  getCdcExport,
  getCdcSettings,
  importCdcIdentitiesCsv,
  listCdcEligibleDiplomas,
  listCdcExports,
  markCdcExportSubmitted,
  saveCdcIdentity,
  updateCdcSettings,
  uploadCdcCrt,
} from "@/lib/api/endpoints";

const CDC_PORTAL = "https://certificateurs.moncompteformation.gouv.fr/";
const CDC_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
const OBJECT_URL_REVOKE_DELAY_MS = 30_000;

const STATUS: Record<
  CdcExportStatus,
  { label: string; tone: "success" | "danger" | "indigo" | "cyan" | "neutral" }
> = {
  generated: { label: "À déposer", tone: "indigo" },
  submitted: { label: "Déposé — en attente", tone: "cyan" },
  accepted: { label: "Accepté", tone: "success" },
  partially_rejected: { label: "Partiellement rejeté", tone: "danger" },
  rejected: { label: "Rejeté", tone: "danger" },
  cancelled: { label: "Annulé", tone: "neutral" },
};

interface SettingsDraft {
  certificateurSiret: string;
  contactEmail: string;
  emitterIdClient: string;
  certificateurIdClient: string;
  contractId: string;
}

const EMPTY_SETTINGS: SettingsDraft = {
  certificateurSiret: "",
  contactEmail: "",
  emitterIdClient: "",
  certificateurIdClient: "",
  contractId: "",
};

function settingsDraft(settings: CdcSettingsDTO): SettingsDraft {
  return {
    certificateurSiret: settings.certificateurSiret,
    contactEmail: settings.contactEmail ?? "",
    emitterIdClient: settings.emitterIdClient ?? "",
    certificateurIdClient: settings.certificateurIdClient ?? "",
    contractId: settings.contractId ?? "",
  };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_REVOKE_DELAY_MS);
}

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? error.message
    : "Une erreur inattendue est survenue. Réessayez dans quelques instants.";
}

function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export default function AccrochagePage() {
  const { success, error: toastError } = useToast();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<CdcSettingsDTO | null>(null);
  const [draft, setDraft] = useState<SettingsDraft>(EMPTY_SETTINGS);
  const [eligible, setEligible] = useState<CdcEligibleDiplomaDTO[]>([]);
  const [exportsState, setExportsState] = useState<CdcExportListDTO | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [batchDetails, setBatchDetails] = useState<Record<string, CdcExportDetailDTO>>({});
  const [batchDetailError, setBatchDetailError] = useState<Record<string, string>>({});
  const [batchDetailBusy, setBatchDetailBusy] = useState<string | null>(null);
  const [identityDiploma, setIdentityDiploma] = useState<CdcEligibleDiplomaDTO | null>(null);
  const [nir, setNir] = useState("");
  const [birthLastName, setBirthLastName] = useState("");
  const [obtentionMethod, setObtentionMethod] =
    useState<CdcObtentionMethod>("PAR_ADMISSION");
  const [showNir, setShowNir] = useState(false);

  const loadEnabledData = useCallback(async () => {
    const [diplomas, batches] = await Promise.all([
      listCdcEligibleDiplomas(),
      listCdcExports({ page: 1, pageSize: 50 }),
    ]);
    setEligible(diplomas);
    setExportsState(batches);
    setSelected((current) => {
      const stillEligible = new Set(diplomas.filter((item) => item.identityComplete).map((item) => item.id));
      return new Set([...current].filter((id) => stillEligible.has(id)));
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const current = await getCdcSettings();
      setSettings(current);
      setDraft(settingsDraft(current));
      if (current.enabled) await loadEnabledData();
      else {
        setEligible([]);
        setExportsState(null);
      }
    } catch (error) {
      const message = errorMessage(error);
      setLoadError(message);
      toastError("Chargement impossible", message);
    } finally {
      setLoading(false);
    }
  }, [loadEnabledData, toastError]);

  useEffect(() => {
    // The initial request intentionally hydrates this client-only workspace.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const selectableIds = useMemo(
    () => eligible.filter((item) => item.identityComplete).map((item) => item.id),
    [eligible],
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  async function saveSettings(): Promise<void> {
    if (busy) return;
    setBusy("settings");
    try {
      const updated = await updateCdcSettings({
        certificateurSiret: draft.certificateurSiret.trim(),
        contactEmail: draft.contactEmail.trim() || null,
        emitterIdClient: draft.emitterIdClient.trim() || null,
        certificateurIdClient: draft.certificateurIdClient.trim() || null,
        contractId: draft.contractId.trim() || null,
      });
      setSettings(updated);
      setDraft(settingsDraft(updated));
      success("Configuration enregistrée", "Les prochains lots utiliseront ces identifiants CDC.");
    } catch (error) {
      toastError("Enregistrement impossible", errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function closeIdentityModal(): void {
    setIdentityDiploma(null);
    setNir("");
    setBirthLastName("");
    setObtentionMethod("PAR_ADMISSION");
    setShowNir(false);
  }

  async function submitIdentity(): Promise<void> {
    if (busy || !identityDiploma) return;
    setBusy("identity");
    try {
      await saveCdcIdentity({
        diplomaId: identityDiploma.id,
        nir,
        birthLastName,
        obtentionMethod,
      });
      closeIdentityModal();
      await loadEnabledData();
      success("Identité CDC enregistrée", "Le NIR est chiffré et ne sera jamais réaffiché.");
    } catch (error) {
      toastError("Identité invalide", errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function removeIdentity(diplomaId: string): Promise<void> {
    if (busy) return;
    setBusy(`identity-delete:${diplomaId}`);
    try {
      await deleteCdcIdentity(diplomaId);
      await loadEnabledData();
      success("Identité retirée", "Les données CDC de ce diplôme ont été supprimées.");
    } catch (error) {
      toastError("Suppression impossible", errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function importCsv(file: File): Promise<void> {
    if (busy) return;
    setBusy("csv");
    try {
      const result = await importCdcIdentitiesCsv(file);
      await loadEnabledData();
      if (result.errors.length > 0) {
        toastError(
          "Import partiel",
          `${result.imported} identité(s) importée(s), ${result.errors.length} ligne(s) rejetée(s). ${result.errors[0]?.message ?? ""}`,
        );
      } else {
        success("Import terminé", `${result.imported} identité(s) importée(s).`);
      }
    } catch (error) {
      toastError("Import impossible", errorMessage(error));
    } finally {
      setBusy(null);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  }

  function downloadCsvTemplate(): void {
    const header = "diploma_id,external_id,nir,nom_naissance,obtention_certification";
    const rows = eligible.map((item) =>
      [item.id, "", "", "", "PAR_ADMISSION"].map(escapeCsv).join(","),
    );
    triggerBlobDownload(
      new Blob([[header, ...rows].join("\r\n")], { type: "text/csv;charset=utf-8" }),
      "modele-identites-cdc.csv",
    );
  }

  async function downloadBatch(id: string): Promise<void> {
    if (busy) return;
    setBusy(`download:${id}`);
    try {
      const file = await downloadCdcExport(id);
      triggerBlobDownload(file.blob, file.fileName);
    } catch (error) {
      toastError("Téléchargement impossible", errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function generateBatch(): Promise<void> {
    if (busy || selected.size === 0) return;
    setBusy("generate");
    try {
      const batch = await createCdcExport({ diplomaIds: [...selected] });
      const file = await downloadCdcExport(batch.id);
      triggerBlobDownload(file.blob, file.fileName);
      setSelected(new Set());
      await loadEnabledData();
      success("Lot CDC généré", "Le fichier XML est prêt. Déposez-le ensuite sur l’espace certificateurs.");
    } catch (error) {
      toastError("Génération impossible", errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function mutateBatch(
    id: string,
    action: "submitted" | "cancel" | "crt",
    content?: string,
  ): Promise<void> {
    if (busy) return;
    setBusy(`${action}:${id}`);
    try {
      if (action === "submitted") await markCdcExportSubmitted(id);
      else if (action === "cancel") await cancelCdcExport(id);
      else await uploadCdcCrt(id, content ?? "");
      await loadEnabledData();
      success(
        action === "submitted"
          ? "Lot marqué comme déposé"
          : action === "cancel"
            ? "Lot annulé"
            : "Compte rendu intégré",
        "Le suivi CDC a été actualisé.",
      );
    } catch (error) {
      toastError("Action impossible", errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function readAndUploadCrt(id: string, file: File): Promise<void> {
    if (file.size > CDC_UPLOAD_MAX_BYTES) {
      toastError("Compte rendu trop volumineux", "La taille maximale autorisée est de 2 Mo.");
      return;
    }
    try {
      await mutateBatch(id, "crt", await file.text());
    } catch {
      toastError("Lecture impossible", "Le compte rendu sélectionné ne peut pas être lu.");
    }
  }

  async function toggleBatchDetails(id: string): Promise<void> {
    if (expandedBatchId === id) {
      setExpandedBatchId(null);
      return;
    }

    setExpandedBatchId(id);
    if (batchDetails[id] || batchDetailBusy === id) return;

    setBatchDetailBusy(id);
    setBatchDetailError((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    try {
      const detail = await getCdcExport(id);
      setBatchDetails((current) => ({ ...current, [id]: detail }));
    } catch (error) {
      const message = errorMessage(error);
      setBatchDetailError((current) => ({ ...current, [id]: message }));
      toastError("Détail indisponible", message);
    } finally {
      setBatchDetailBusy(null);
    }
  }

  const columns: TableColumn<CdcEligibleDiplomaDTO>[] = [
    {
      key: "id",
      header: (
        <input
          type="checkbox"
          aria-label="Sélectionner toutes les identités complètes"
          checked={allSelected}
          onChange={() => setSelected(allSelected ? new Set() : new Set(selectableIds))}
          disabled={selectableIds.length === 0}
          className="h-4 w-4 accent-indigo-600"
        />
      ),
      cell: (row) => (
        <input
          type="checkbox"
          aria-label={`Sélectionner ${row.holderName}`}
          checked={selected.has(row.id)}
          disabled={!row.identityComplete}
          onChange={() =>
            setSelected((current) => {
              const next = new Set(current);
              if (next.has(row.id)) next.delete(row.id);
              else next.add(row.id);
              return next;
            })
          }
          className="h-4 w-4 accent-indigo-600 disabled:opacity-40"
        />
      ),
      className: "w-12",
    },
    {
      key: "holderName",
      header: "Diplôme",
      cell: (row) => (
        <div>
          <p className="font-semibold text-ink">{row.holderName}</p>
          <p className="mt-0.5 text-xs text-muted">{row.programTitle}</p>
        </div>
      ),
    },
    { key: "rncp", header: "Certification", cell: (row) => <Badge tone="indigo">{row.rncp}</Badge> },
    {
      key: "identityComplete",
      header: "Identité CDC",
      cell: (row) => (
        <Badge tone={row.identityComplete ? "success" : "danger"} dot>
          {row.identityComplete ? "Complète" : "Manquante"}
        </Badge>
      ),
    },
    {
      key: "inFlight",
      header: "Action",
      align: "right",
      cell: (row) => (
        <div className="flex justify-end gap-2">
          {row.identityComplete && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Supprimer l’identité de ${row.holderName}`}
              onClick={() => void removeIdentity(row.id)}
              loading={busy === `identity-delete:${row.id}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          )}
          <Button size="sm" variant="subtle" onClick={() => setIdentityDiploma(row)}>
            {row.identityComplete ? "Corriger" : "Renseigner"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-7">
      <FadeIn>
        <PageHeader
          eyebrow="Conformité réglementaire"
          title="Accrochage CDC"
          gradient="Passeport de compétences"
          cool
          subtitle="Préparez les données minimales, générez un XML conforme au kit CDC et suivez son traitement sans conserver le fichier en base."
        />
      </FadeIn>

      <section aria-labelledby="cdc-configuration" className="scroll-mt-24">
        <FadeIn>
          <Card strong className="p-6 sm:p-7">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-500/10 text-indigo-600">
                <Settings2 className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="cdc-configuration" className="font-display text-lg font-bold text-ink">
                    1. État et configuration
                  </h2>
                  {!loading && settings && (
                    <Badge tone={settings.enabled ? "success" : "neutral"} dot={settings.enabled}>
                      {settings.enabled ? "Module activé" : "Module désactivé"}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  L’activation est réservée à la plateforme après habilitation de votre organisme auprès de la CDC.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2"><Skeleton height={68} /><Skeleton height={68} /></div>
            ) : loadError ? (
              <LoadErrorBlock message={loadError} onRetry={() => void load()} />
            ) : settings?.enabled ? (
              <div className="mt-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="SIRET certificateur" required>
                    <Input
                      inputMode="numeric"
                      maxLength={14}
                      value={draft.certificateurSiret}
                      onChange={(event) => setDraft({ ...draft, certificateurSiret: event.target.value })}
                    />
                  </Field>
                  <Field label="Identifiant émetteur CDC" hint="8 caractères fournis par la CDC">
                    <Input
                      maxLength={8}
                      value={draft.emitterIdClient}
                      onChange={(event) => setDraft({ ...draft, emitterIdClient: event.target.value })}
                    />
                  </Field>
                  <Field label="Identifiant certificateur CDC" hint="8 caractères fournis par la CDC">
                    <Input
                      maxLength={8}
                      value={draft.certificateurIdClient}
                      onChange={(event) => setDraft({ ...draft, certificateurIdClient: event.target.value })}
                    />
                  </Field>
                  <Field label="Identifiant contrat CDC">
                    <Input
                      maxLength={20}
                      value={draft.contractId}
                      onChange={(event) => setDraft({ ...draft, contractId: event.target.value })}
                    />
                  </Field>
                  <Field label="E-mail de contact" className="sm:col-span-2">
                    <Input
                      type="email"
                      value={draft.contactEmail}
                      onChange={(event) => setDraft({ ...draft, contactEmail: event.target.value })}
                    />
                  </Field>
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <a
                    href={CDC_PORTAL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:underline"
                  >
                    Ouvrir l’espace certificateurs <ExternalLink className="h-4 w-4" aria-hidden />
                  </a>
                  <Button onClick={() => void saveSettings()} loading={busy === "settings"}>
                    Enregistrer la configuration
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-amber-400/25 bg-amber-400/8 p-5 sm:flex-row sm:items-center">
                <ShieldAlert className="h-7 w-7 shrink-0 text-amber-600" aria-hidden />
                <div className="flex-1">
                  <p className="font-semibold text-ink">Votre module n’est pas encore activé</p>
                  <p className="mt-1 text-sm text-muted">
                    Finalisez d’abord votre habilitation CDC, puis contactez CertifyChain pour activer l’accrochage.
                  </p>
                </div>
                <Button as="a" href={CDC_PORTAL} target="_blank" rel="noreferrer" variant="subtle">
                  Portail CDC <ExternalLink className="ml-1 h-4 w-4" aria-hidden />
                </Button>
              </div>
            )}
          </Card>
        </FadeIn>
      </section>

      <section aria-labelledby="cdc-preparation">
        <FadeIn>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="cdc-preparation" className="font-display text-xl font-bold text-ink">
                2. Préparation des identités
              </h2>
              <p className="mt-1 text-sm text-muted">Seuls les diplômes actifs portant un code RNCP sont proposés.</p>
            </div>
            {settings?.enabled && (
              <div className="flex flex-wrap gap-2">
                <Button variant="subtle" size="sm" onClick={downloadCsvTemplate} leftIcon={<Download className="h-4 w-4" />}>
                  Modèle CSV
                </Button>
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => csvInputRef.current?.click()}
                  loading={busy === "csv"}
                  leftIcon={<FileUp className="h-4 w-4" />}
                >
                  Importer les identités
                </Button>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  aria-label="Fichier CSV d’identités CDC"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void importCsv(file);
                  }}
                />
              </div>
            )}
          </div>
          {loadError ? (
            <DataUnavailableBlock />
          ) : loading ? (
            <div className="grid gap-3"><Skeleton height={96} /><Skeleton height={96} /></div>
          ) : settings?.enabled ? (
            <Table
              columns={columns}
              rows={eligible}
              rowKey={(row) => row.id}
              loading={loading}
              empty={<EmptyState title="Aucun diplôme RNCP éligible" description="Les diplômes déjà engagés dans un lot n’apparaissent plus ici." />}
            />
          ) : (
            <DisabledBlock />
          )}
        </FadeIn>
      </section>

      <section aria-labelledby="cdc-generation">
        <FadeIn>
          <Card className="p-6 sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
                  <PackageCheck className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h2 id="cdc-generation" className="font-display text-lg font-bold text-ink">
                    3. Génération et dépôt
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
                    Le XML est construit à la demande, contrôlé par empreinte SHA-256 puis téléchargé. Aucune copie contenant un NIR n’est conservée.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => void generateBatch()}
                loading={busy === "generate"}
                disabled={!settings?.enabled || selected.size === 0}
                leftIcon={<FileCheck2 className="h-4 w-4" />}
              >
                Générer le fichier ({selected.size})
              </Button>
            </div>
            {settings?.enabled && (
              <ol className="mt-5 grid gap-3 text-sm text-muted sm:grid-cols-3">
                <li className="rounded-2xl bg-black/3 p-4 dark:bg-white/4"><strong className="block text-ink">1. Téléchargez</strong> le fichier XML généré.</li>
                <li className="rounded-2xl bg-black/3 p-4 dark:bg-white/4"><strong className="block text-ink">2. Déposez-le</strong> sur l’espace certificateurs CDC.</li>
                <li className="rounded-2xl bg-black/3 p-4 dark:bg-white/4"><strong className="block text-ink">3. Revenez ici</strong> marquer le dépôt puis importer le CRT.</li>
              </ol>
            )}
          </Card>
        </FadeIn>
      </section>

      <section aria-labelledby="cdc-history">
        <FadeIn>
          <div className="mb-4 flex items-center gap-3">
            <History className="h-5 w-5 text-indigo-600" aria-hidden />
            <div>
              <h2 id="cdc-history" className="font-display text-xl font-bold text-ink">4. Historique des lots</h2>
              <p className="mt-1 text-sm text-muted">Suivez les acceptations et les rejets sans exposer les identités.</p>
            </div>
          </div>
          {loadError ? (
            <DataUnavailableBlock />
          ) : loading ? (
            <div className="grid gap-3"><Skeleton height={116} /><Skeleton height={116} /></div>
          ) : !settings?.enabled ? (
            <DisabledBlock />
          ) : !exportsState || exportsState.items.length === 0 ? (
            <Card><EmptyState title="Aucun lot généré" description="Sélectionnez des identités complètes pour créer votre premier lot CDC." /></Card>
          ) : (
            <div className="grid gap-3">
              {exportsState.items.map((batch) => (
                <BatchCard
                  key={batch.id}
                  batch={batch}
                  busy={busy}
                  onDownload={() => void downloadBatch(batch.id)}
                  onSubmitted={() => void mutateBatch(batch.id, "submitted")}
                  onCancel={() => void mutateBatch(batch.id, "cancel")}
                  onCrt={(file) => void readAndUploadCrt(batch.id, file)}
                  expanded={expandedBatchId === batch.id}
                  detail={batchDetails[batch.id]}
                  detailError={batchDetailError[batch.id]}
                  detailLoading={batchDetailBusy === batch.id}
                  onToggleDetails={() => void toggleBatchDetails(batch.id)}
                />
              ))}
            </div>
          )}
        </FadeIn>
      </section>

      <Modal
        open={identityDiploma !== null}
        onClose={() => { if (!busy) closeIdentityModal(); }}
        title="Identité réglementaire CDC"
        description={identityDiploma ? `${identityDiploma.holderName} · ${identityDiploma.rncp}` : undefined}
        footer={
          <>
            <Button variant="subtle" onClick={closeIdentityModal} disabled={busy === "identity"}>Annuler</Button>
            <Button
              onClick={() => void submitIdentity()}
              loading={busy === "identity"}
              disabled={!nir.trim() || !birthLastName.trim()}
            >
              Chiffrer et enregistrer
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="NIR complet avec clé" required hint="15 caractères. Cette valeur ne sera jamais réaffichée.">
            <Input
              type={showNir ? "text" : "password"}
              autoComplete="off"
              inputMode="text"
              value={nir}
              onChange={(event) => setNir(event.target.value)}
              maxLength={20}
              rightIcon={
                <button
                  type="button"
                  aria-label={showNir ? "Masquer le NIR" : "Afficher le NIR"}
                  onClick={() => setShowNir((value) => !value)}
                  className="cursor-pointer text-muted hover:text-ink"
                >
                  {showNir ? <EyeOff /> : <Eye />}
                </button>
              }
            />
          </Field>
          <Field label="Nom de naissance" required>
            <Input value={birthLastName} maxLength={60} onChange={(event) => setBirthLastName(event.target.value)} />
          </Field>
          <Field label="Mode d’obtention" required>
            <Select
              value={obtentionMethod}
              onChange={(event) => setObtentionMethod(event.target.value as CdcObtentionMethod)}
              options={[
                { value: "PAR_ADMISSION", label: "Par admission" },
                { value: "PAR_SCORING", label: "Par scoring" },
              ]}
            />
          </Field>
          <p className="flex gap-2 rounded-2xl bg-indigo-500/8 p-3 text-xs leading-relaxed text-muted">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
            Minimisation RGPD : seules les données strictement exigées par le schéma CDC officiel sont collectées et elles sont purgées après acceptation.
          </p>
        </div>
      </Modal>
    </div>
  );
}

function DisabledBlock() {
  return (
    <Card className="p-6 text-center">
      <ShieldAlert className="mx-auto h-7 w-7 text-muted-soft" aria-hidden />
      <p className="mt-2 font-semibold text-ink">Fonction indisponible tant que le module est désactivé</p>
      <p className="mt-1 text-sm text-muted">Aucune donnée d’identité ne peut être saisie ou exportée.</p>
    </Card>
  );
}

function LoadErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="mt-6 flex flex-col gap-4 rounded-2xl border border-danger/20 bg-danger/6 p-5 sm:flex-row sm:items-center">
      <ShieldAlert className="h-7 w-7 shrink-0 text-danger" aria-hidden />
      <div className="flex-1">
        <p className="font-semibold text-ink">Le module ne peut pas être chargé</p>
        <p className="mt-1 text-sm text-muted">{message}</p>
      </div>
      <Button variant="subtle" onClick={onRetry}>Réessayer</Button>
    </div>
  );
}

function DataUnavailableBlock() {
  return (
    <Card role="status" className="p-6 text-center">
      <ShieldAlert className="mx-auto h-7 w-7 text-danger" aria-hidden />
      <p className="mt-2 font-semibold text-ink">Données temporairement indisponibles</p>
      <p className="mt-1 text-sm text-muted">Le statut d’activation n’a pas pu être vérifié.</p>
    </Card>
  );
}

function BatchCard({
  batch,
  busy,
  onDownload,
  onSubmitted,
  onCancel,
  onCrt,
  expanded,
  detail,
  detailError,
  detailLoading,
  onToggleDetails,
}: {
  batch: CdcExportDTO;
  busy: string | null;
  onDownload: () => void;
  onSubmitted: () => void;
  onCancel: () => void;
  onCrt: (file: File) => void;
  expanded: boolean;
  detail: CdcExportDetailDTO | undefined;
  detailError: string | undefined;
  detailLoading: boolean;
  onToggleDetails: () => void;
}) {
  const crtRef = useRef<HTMLInputElement>(null);
  const status = STATUS[batch.status];
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone} dot>{status.label}</Badge>
            <span className="truncate font-mono text-xs text-muted" title={batch.fileName}>{batch.fileName}</span>
          </div>
          <p className="mt-2 text-sm text-muted">Généré le {formatDate(batch.generatedAt)}</p>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-xs sm:flex sm:gap-3">
          <Count value={batch.counts.total} label="Total" />
          <Count value={batch.counts.accepted} label="Acceptés" good />
          <Count value={batch.counts.rejected} label="Rejetés" bad />
          <Count value={batch.counts.pending} label="En attente" />
        </div>
        <div className="flex flex-wrap gap-2 xl:justify-end">
          {batch.status !== "cancelled" && (
            <Button size="sm" variant="subtle" onClick={onDownload} loading={busy === `download:${batch.id}`} leftIcon={<Download className="h-4 w-4" />}>
              XML
            </Button>
          )}
          {batch.status === "generated" && (
            <>
              <Button size="sm" onClick={onSubmitted} loading={busy === `submitted:${batch.id}`} leftIcon={<Send className="h-4 w-4" />}>
                Marquer déposé
              </Button>
              <Button size="sm" variant="ghost" onClick={onCancel} loading={busy === `cancel:${batch.id}`} leftIcon={<XCircle className="h-4 w-4" />}>
                Annuler
              </Button>
            </>
          )}
          {batch.status === "submitted" && (
            <>
              <Button size="sm" onClick={() => crtRef.current?.click()} loading={busy === `crt:${batch.id}`} leftIcon={<FileUp className="h-4 w-4" />}>
                Importer le CRT
              </Button>
              <input
                ref={crtRef}
                type="file"
                accept=".xml,text/xml,application/xml"
                className="sr-only"
                aria-label={`Compte rendu du lot ${batch.fileName}`}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onCrt(file);
                  event.target.value = "";
                }}
              />
            </>
          )}
          {batch.resolvedAt && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onToggleDetails}
              loading={detailLoading}
            >
              {expanded ? "Masquer le détail" : "Voir le détail"}
            </Button>
          )}
        </div>
      </div>
      <p className="mt-3 truncate font-mono text-[10px] text-muted-soft" title={batch.fileSha256}>
        SHA-256 · {batch.fileSha256}
      </p>
      {expanded && (
        <BatchItems detail={detail} error={detailError} loading={detailLoading} />
      )}
    </Card>
  );
}

function BatchItems({
  detail,
  error,
  loading,
}: {
  detail: CdcExportDetailDTO | undefined;
  error: string | undefined;
  loading: boolean;
}) {
  if (loading) {
    return <div aria-label="Chargement du détail du lot" className="mt-4"><Skeleton height={88} /></div>;
  }
  if (error) {
    return <p role="alert" className="mt-4 rounded-xl bg-danger/6 p-3 text-sm text-danger">{error}</p>;
  }
  if (!detail) return null;

  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="mb-3 text-sm font-semibold text-ink">Détail du traitement CDC</p>
      <ul className="grid gap-2">
        {detail.items.map((item) => (
          <li key={item.diplomaId} className="rounded-xl bg-black/3 p-3 text-sm dark:bg-white/4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-ink">{item.holderName}</p>
                <p className="text-xs text-muted">{item.programTitle}</p>
              </div>
              <Badge tone={item.status === "accepted" ? "success" : item.status === "rejected" ? "danger" : "neutral"}>
                {item.status === "accepted" ? "Accepté" : item.status === "rejected" ? "Rejeté" : "En attente"}
              </Badge>
            </div>
            {item.status === "rejected" && (
              <p className="mt-2 text-xs text-danger">
                {item.rejectCode && <strong className="mr-1 font-mono">{item.rejectCode}</strong>}
                {item.rejectReason ?? "Motif non communiqué par la CDC"}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Count({ value, label, good, bad }: { value: number; label: string; good?: boolean; bad?: boolean }) {
  return (
    <span className="rounded-xl bg-black/3 px-2.5 py-2 dark:bg-white/4">
      <strong className={good ? "text-success" : bad ? "text-danger" : "text-ink"}>{value}</strong>
      <span className="block text-[10px] text-muted">{label}</span>
    </span>
  );
}
