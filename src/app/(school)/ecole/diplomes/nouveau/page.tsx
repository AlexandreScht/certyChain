"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  User,
  Mail,
  GraduationCap,
  Award,
  Calendar,
  Hash,
  BadgeCheck,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";

import { createDiploma, importDiplomasCsv } from "@/lib/api/endpoints";
import { ApiClientError } from "@/lib/api/client";
import {
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Stat,
  useToast,
} from "@/components/ui";
import { FadeIn } from "@/components/school";
import { useCanEmit } from "@/hooks/useSchoolSession";
import { cn } from "@/lib/utils";
import type { CreateDiplomaInput } from "@contract/schemas";
import type { ImportResultDTO } from "@contract/dto";

interface DiplomaFormState {
  holderName: string;
  holderEmail: string;
  programTitle: string;
  mention: string;
  rncp: string;
  issuedAt: string;
  externalId: string;
}

const EMPTY_FORM: DiplomaFormState = {
  holderName: "",
  holderEmail: "",
  programTitle: "",
  mention: "",
  rncp: "",
  issuedAt: "",
  externalId: "",
};

const CSV_HEADER =
  "holderName,holderEmail,programTitle,mention,issuedAt,externalId,rncp";

function buildCreatePayload(form: DiplomaFormState): CreateDiplomaInput {
  return {
    holderName: form.holderName.trim(),
    holderEmail: form.holderEmail.trim(),
    programTitle: form.programTitle.trim(),
    issuedAt: form.issuedAt,
    mention: form.mention.trim() || undefined,
    externalId: form.externalId.trim() || undefined,
    rncp: form.rncp.trim() || undefined,
  };
}

export default function NewDiplomaPage() {
  const { success, error: toastError } = useToast();
  const canEmit = useCanEmit();

  // ── Single-issue form ──────────────────────────────────────────────────
  const [form, setForm] = useState<DiplomaFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof DiplomaFormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const created = await createDiploma(buildCreatePayload(form));
      success(
        "Diplôme émis",
        `${created.holderName} — ${created.programTitle}`,
      );
      setForm(EMPTY_FORM);
    } catch (err) {
      if (err instanceof ApiClientError) {
        toastError("Émission impossible", err.message);
      } else {
        toastError("Émission impossible", "Une erreur inattendue est survenue.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── CSV import ─────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResultDTO | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setImporting(true);
    try {
      const res = await importDiplomasCsv(file);
      setResult(res);
      if (res.errors.length === 0) {
        success(
          "Import terminé",
          `${res.imported} diplôme(s) importé(s), ${res.skipped} ignoré(s).`,
        );
      } else {
        toastError(
          "Import partiel",
          `${res.imported} importé(s), ${res.errors.length} erreur(s).`,
        );
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        toastError("Import impossible", err.message);
      } else {
        toastError("Import impossible", "Une erreur inattendue est survenue.");
      }
    } finally {
      setImporting(false);
      // Allow re-selecting the same file.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <FadeIn>
        <PageHeader
          eyebrow="Émission"
          title="Émettre un"
          gradient="diplôme numérique"
          cool
          subtitle="Délivrez un diplôme signé cryptographiquement, ou importez une promotion entière par CSV."
          actions={
            <Button
              as="a"
              href="/ecole/diplomes"
              variant="subtle"
              size="sm"
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Registre
            </Button>
          }
        />
      </FadeIn>

      {/* Emission is locked until ownership is proven (verify.md: provisional
          schools hold no PKI keys — the API rejects issuance regardless). */}
      {!canEmit && (
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
                <h2 className="font-display font-bold text-ink text-lg mb-1">
                  Émission verrouillée
                </h2>
                <p className="text-sm text-muted leading-relaxed max-w-2xl">
                  Votre établissement doit d&apos;abord{" "}
                  <span className="font-semibold text-ink-soft">
                    prouver qu&apos;il contrôle réellement l&apos;institution
                  </span>{" "}
                  (DNS, courrier postal ou ProConnect) avant que ses clés PKI ne
                  soient générées et que l&apos;émission ne soit débloquée.
                </p>
              </div>
              <div className="shrink-0">
                <Button
                  as="a"
                  href="/ecole/verification"
                  size="lg"
                  leftIcon={<ShieldCheck className="w-5 h-5" />}
                  rightIcon={<ArrowRight className="w-4.5 h-4.5" />}
                >
                  Vérifier la propriété
                </Button>
              </div>
            </div>
          </Card>
        </FadeIn>
      )}

      <div
        className={cn(
          "grid gap-6 lg:grid-cols-5",
          !canEmit && "opacity-50 pointer-events-none select-none",
        )}
        aria-disabled={!canEmit}
      >
        {/* Single issue form */}
        <FadeIn index={1} className="lg:col-span-3">
          <Card strong className="p-6 sm:p-7 h-full">
            <div className="flex items-center gap-3 mb-5">
              <span className="grid place-items-center w-10 h-10 rounded-xl bg-linear-to-br from-indigo-600 to-indigo-500 text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.6)]">
                <Award className="w-5 h-5" />
              </span>
              <div>
                <h2 className="font-display font-bold text-ink text-lg leading-tight">
                  Émission individuelle
                </h2>
                <p className="text-xs text-muted">
                  Le diplôme est signé avec la clé PKI de votre établissement.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              <fieldset disabled={!canEmit} className="flex flex-col gap-4 min-w-0">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Nom du titulaire" required>
                  <Input
                    name="holderName"
                    placeholder="Alex Dubois"
                    value={form.holderName}
                    onChange={(e) => set("holderName", e.target.value)}
                    leftIcon={<User />}
                    required
                  />
                </Field>
                <Field label="E-mail du titulaire" required>
                  <Input
                    type="email"
                    name="holderEmail"
                    placeholder="alex.dubois@example.com"
                    value={form.holderEmail}
                    onChange={(e) => set("holderEmail", e.target.value)}
                    leftIcon={<Mail />}
                    required
                  />
                </Field>
              </div>

              <Field label="Intitulé du programme" required>
                <Input
                  name="programTitle"
                  placeholder="Master Data Science"
                  value={form.programTitle}
                  onChange={(e) => set("programTitle", e.target.value)}
                  leftIcon={<GraduationCap />}
                  required
                />
              </Field>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Mention" hint="Optionnel.">
                  <Input
                    name="mention"
                    placeholder="Très Bien"
                    value={form.mention}
                    onChange={(e) => set("mention", e.target.value)}
                    leftIcon={<Award />}
                  />
                </Field>
                <Field label="Date d'émission" required>
                  <Input
                    type="date"
                    name="issuedAt"
                    value={form.issuedAt}
                    onChange={(e) => set("issuedAt", e.target.value)}
                    leftIcon={<Calendar />}
                    required
                  />
                </Field>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field
                  label="Code RNCP"
                  hint="Titre du programme (France Compétences). Optionnel."
                >
                  <Input
                    name="rncp"
                    placeholder="RNCP35900"
                    value={form.rncp}
                    onChange={(e) => set("rncp", e.target.value)}
                    leftIcon={<BadgeCheck />}
                  />
                </Field>
                <Field
                  label="Référence externe"
                  hint="Identifiant interne (n° de dossier). Optionnel."
                >
                  <Input
                    name="externalId"
                    placeholder="2025-DS-0042"
                    value={form.externalId}
                    onChange={(e) => set("externalId", e.target.value)}
                    leftIcon={<Hash />}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  type="submit"
                  size="lg"
                  loading={submitting}
                  leftIcon={<Sparkles className="w-5 h-5" />}
                >
                  Émettre le diplôme
                </Button>
                <Button
                  type="button"
                  variant="subtle"
                  onClick={() => setForm(EMPTY_FORM)}
                  disabled={submitting}
                >
                  Réinitialiser
                </Button>
              </div>
              </fieldset>
            </form>
          </Card>
        </FadeIn>

        {/* CSV import */}
        <FadeIn index={2} className="lg:col-span-2">
          <Card className="p-6 sm:p-7 h-full flex flex-col">
            <div className="flex items-center gap-3 mb-5">
              <span className="grid place-items-center w-10 h-10 rounded-xl neumorph-sm text-cyan-500">
                <UploadCloud className="w-5 h-5" />
              </span>
              <div>
                <h2 className="font-display font-bold text-ink text-lg leading-tight">
                  Import CSV
                </h2>
                <p className="text-xs text-muted">Émettez une promotion entière.</p>
              </div>
            </div>

            {/* Header order reminder */}
            <div className="neumorph-inset rounded-2xl p-4 mb-4">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-soft font-semibold mb-2">
                <FileText className="w-3.5 h-3.5" />
                En-têtes attendus (dans cet ordre)
              </div>
              <code className="block font-mono text-xs text-ink-soft break-all leading-relaxed">
                {CSV_HEADER}
              </code>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              disabled={!canEmit}
              className="sr-only"
              id="csv-upload"
            />
            <label
              htmlFor="csv-upload"
              className="group flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-hairline hover:border-indigo-500/50 bg-white/40 dark:bg-white/5 px-6 py-8 text-center cursor-pointer transition-colors"
            >
              <span className="grid place-items-center w-12 h-12 rounded-xl neumorph-sm text-indigo-600 group-hover:text-indigo-500 transition-colors">
                <UploadCloud className="w-6 h-6" />
              </span>
              <span className="text-sm font-semibold text-ink">
                {importing ? "Import en cours…" : "Choisir un fichier CSV"}
              </span>
              <span className="text-xs text-muted">
                {fileName ?? "Glissez-déposez ou cliquez pour parcourir"}
              </span>
            </label>

            {importing && (
              <p className="mt-3 text-xs text-muted text-center">
                Traitement du fichier, veuillez patienter…
              </p>
            )}

            {/* Import result */}
            {result && (
              <div className="mt-5 flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Stat
                    value={result.imported.toLocaleString("fr-FR")}
                    label="Importés"
                    icon={<CheckCircle2 />}
                  />
                  <Stat
                    value={result.skipped.toLocaleString("fr-FR")}
                    label="Ignorés"
                    icon={<FileText />}
                  />
                </div>

                {result.errors.length > 0 ? (
                  <div className="rounded-2xl bg-danger/8 border border-danger/20 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-danger mb-2">
                      <AlertTriangle className="w-4 h-4" />
                      {result.errors.length} erreur
                      {result.errors.length > 1 ? "s" : ""}
                    </div>
                    <ul className="flex flex-col gap-1.5 max-h-44 overflow-y-auto">
                      {result.errors.map((err) => (
                        <li
                          key={`${err.row}-${err.message}`}
                          className="text-xs text-ink-soft flex gap-2"
                        >
                          <span className="font-mono font-semibold text-danger shrink-0">
                            L.{err.row}
                          </span>
                          <span className="min-w-0">{err.message}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-success/8 border border-success/20 p-4 flex items-center gap-2 text-sm font-semibold text-success">
                    <CheckCircle2 className="w-4 h-4" />
                    Import terminé sans erreur.
                  </div>
                )}
              </div>
            )}

            <p className="mt-auto pt-5 text-xs text-muted-soft leading-relaxed">
              Les lignes invalides sont ignorées et listées ci-dessus avec leur
              numéro. Format de date attendu&nbsp;: AAAA-MM-JJ.
            </p>
          </Card>
        </FadeIn>
      </div>
    </div>
  );
}
