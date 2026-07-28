"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  Building2,
  Hash,
  BadgeCheck,
  MapPin,
  Mail,
  Lock,
  User,
  ArrowRight,
  AlertTriangle,
  ShieldCheck,
  Clock,
  Terminal,
} from "lucide-react";

import { registerSchool } from "@/lib/api/endpoints";
import { ApiClientError, apiErrorMessage } from "@/lib/api/client";
import { Button, Field, Input, useToast } from "@certifychain/shared/ui";
import { AuthShell } from "@/components/school";
import type { RegisterSchoolInput } from "@certifychain/contract/schemas";

interface FormState {
  name: string;
  siret: string;
  uai: string;
  city: string;
  contactEmail: string;
  adminEmail: string;
  adminPassword: string;
  adminFullName: string;
}

type FieldKey = keyof FormState;
type Errors = Partial<Record<FieldKey, string>>;

const INITIAL: FormState = {
  name: "",
  siret: "",
  uai: "",
  city: "",
  contactEmail: "",
  adminEmail: "",
  adminPassword: "",
  adminFullName: "",
};

/** Human labels — reused by the field <label>s and the error summary. */
const FIELD_LABELS: Record<FieldKey, string> = {
  name: "Nom de l'établissement",
  siret: "SIRET",
  uai: "Code UAI (RNE)",
  city: "Ville",
  contactEmail: "E-mail de contact",
  adminEmail: "Identifiant",
  adminPassword: "Mot de passe",
  adminFullName: "Nom complet du responsable",
};

/** Fields the contract marks optional (everything else is required). */
const OPTIONAL_FIELDS = new Set<FieldKey>(["uai", "city", "adminFullName"]);

/**
 * Renders a field label. Optional fields get a subtle "(optionnelle)" tag;
 * required fields show only the label (no asterisk, no "(requis)").
 */
function fieldLabel(key: FieldKey): ReactNode {
  if (!OPTIONAL_FIELDS.has(key)) return FIELD_LABELS[key];
  return (
    <>
      {FIELD_LABELS[key]} <span className="font-normal text-muted-soft">(optionnelle)</span>
    </>
  );
}

/** DOM order — used to focus the first invalid control on submit. */
const FIELD_ORDER: FieldKey[] = [
  "name",
  "siret",
  "uai",
  "city",
  "contactEmail",
  "adminFullName",
  "adminEmail",
  "adminPassword",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Inlined at build: the self-service activation tip only makes sense in dev
// (the API answers 403 elsewhere).
const IS_DEV = process.env.NODE_ENV !== "production";

/** Removes every whitespace character (users often paste SIRET/UAI with spaces). */
function stripSpaces(v: string): string {
  return v.replace(/\s+/g, "");
}

/**
 * Cleans the raw form into exactly what the API expects: whitespace stripped from
 * the SIRET/UAI numbers, other text fields trimmed. The password is left intact
 * (spaces can be legitimate there).
 */
function normalize(form: FormState): FormState {
  return {
    name: form.name.trim(),
    siret: stripSpaces(form.siret),
    uai: stripSpaces(form.uai).toUpperCase(),
    city: form.city.trim(),
    contactEmail: form.contactEmail.trim(),
    adminEmail: form.adminEmail.trim(),
    adminPassword: form.adminPassword,
    adminFullName: form.adminFullName.trim(),
  };
}

/**
 * Client-side validation mirroring the server contract (`RegisterSchoolSchema`).
 * Returns a per-field message map; empty means the form is ready to send. The
 * server remains the source of truth — this only gives instant, precise feedback.
 */
function validate(f: FormState): Errors {
  const errors: Errors = {};

  if (f.name.length < 2) errors.name = "Renseignez le nom de l'établissement (2 caractères min).";
  else if (f.name.length > 160) errors.name = "Nom trop long (160 caractères max).";

  if (!f.siret) errors.siret = "Renseignez le SIRET (14 chiffres).";
  else if (!/^\d{14}$/.test(f.siret))
    errors.siret = "Le SIRET doit comporter exactement 14 chiffres.";

  if (f.uai && !/^\d{7}[A-Z]$/.test(f.uai))
    errors.uai = "UAI = 7 chiffres suivis d'une lettre (ex. 0751234A).";

  if (f.city && f.city.length > 120) errors.city = "Ville trop longue (120 caractères max).";

  if (!EMAIL_RE.test(f.contactEmail)) errors.contactEmail = "Adresse e-mail invalide.";

  if (!EMAIL_RE.test(f.adminEmail)) errors.adminEmail = "Adresse e-mail invalide.";

  if (f.adminPassword.length < 12) errors.adminPassword = "12 caractères minimum.";
  else if (f.adminPassword.length > 200) errors.adminPassword = "Mot de passe trop long (200 max).";

  if (f.adminFullName.length > 120) errors.adminFullName = "Nom trop long (120 caractères max).";

  return errors;
}

/** Builds the API payload from an already-normalized form (drops empty optionals). */
function buildPayload(form: FormState): RegisterSchoolInput {
  return {
    name: form.name,
    siret: form.siret,
    contactEmail: form.contactEmail,
    adminEmail: form.adminEmail,
    adminPassword: form.adminPassword,
    city: form.city || undefined,
    uai: form.uai || undefined,
    adminFullName: form.adminFullName || undefined,
  };
}

/** Softens raw Zod defaults; contract messages are already in French. */
function translateServerMessage(key: FieldKey, raw: string): string {
  if (/^required$/i.test(raw)) return `${FIELD_LABELS[key]} requis.`;
  if (/invalid email/i.test(raw)) return "Adresse e-mail invalide.";
  return raw;
}

/**
 * Maps an API error back onto the offending field(s): Zod 422 `fieldErrors`, and
 * 409 uniqueness conflicts (duplicate SIRET / existing account) → the input the
 * user must change. Returns null when the error isn't field-specific.
 */
function mapServerError(err: ApiClientError): Errors | null {
  if (err.code === "validation_error") {
    const fe = (err.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors;
    if (fe) {
      const out: Errors = {};
      for (const [k, msgs] of Object.entries(fe)) {
        if (k in INITIAL && Array.isArray(msgs) && typeof msgs[0] === "string") {
          out[k as FieldKey] = translateServerMessage(k as FieldKey, msgs[0]);
        }
      }
      if (Object.keys(out).length > 0) return out;
    }
  }
  if (err.code === "conflict") {
    if (/siret/i.test(err.message)) return { siret: err.message };
    if (/compte|e-?mail/i.test(err.message)) return { adminEmail: err.message };
  }
  return null;
}

export default function SchoolRegisterPage() {
  const { error: toastError } = useToast();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  // null = form; otherwise the status the API answered with — the success
  // screen adapts (provisional = auto-validated → ownership proof is next).
  const [done, setDone] = useState<null | "pending" | "provisional">(null);
  const formRef = useRef<HTMLFormElement>(null);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear this field's error as soon as the user edits it.
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  /** Moves keyboard focus to the first invalid control (DOM order). */
  function focusFirstError(errs: Errors) {
    const first = FIELD_ORDER.find((k) => errs[k]);
    if (first && formRef.current) {
      formRef.current.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    // Clean the input (strip spaces from SIRET/UAI…) and reflect it back, then
    // validate client-side. If anything is off, show which fields and stop here.
    const normalized = normalize(form);
    setForm(normalized);
    const errs = validate(normalized);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      focusFirstError(errs);
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      const res = await registerSchool(buildPayload(normalized));
      setDone(res.status === "provisional" ? "provisional" : "pending");
    } catch (err) {
      const mapped = err instanceof ApiClientError ? mapServerError(err) : null;
      if (mapped) {
        setErrors(mapped);
        focusFirstError(mapped);
      } else {
        toastError("Envoi impossible", apiErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const invalidFields = FIELD_ORDER.filter((k) => errors[k]);

  if (done) {
    const provisional = done === "provisional";
    return (
      <AuthShell
        eyebrow="Dossier transmis"
        title={provisional ? "Existence confirmée —" : "Dossier reçu —"}
        highlight={provisional ? "prouvez la propriété" : "validation KYB sous 48h"}
        subtitle={
          provisional
            ? "Votre établissement est confirmé au registre SIRENE. Dernière étape avant d'émettre : prouver que vous le contrôlez (DNS, courrier postal ou ProConnect) — un e-mail vient de vous être envoyé."
            : "Nos équipes vérifient l'identité de votre établissement (Know Your Business). Vous recevrez un e-mail dès l'approbation."
        }
      >
        <div className="flex flex-col items-center text-center gap-5">
          <div className="relative w-16 h-16">
            <span className="absolute inset-0 rounded-full bg-success/20 animate-pulse-ring" />
            <span className="relative grid place-items-center w-16 h-16 rounded-full bg-linear-to-br from-success to-cyan-500 text-white shadow-[0_12px_28px_-10px_rgba(16,185,129,0.6)]">
              <ShieldCheck className="w-8 h-8" />
            </span>
          </div>

          <ul className="w-full flex flex-col gap-2.5 text-left">
            {provisional ? (
              <li className="flex items-start gap-3 neumorph-sm rounded-2xl px-4 py-3">
                <ShieldCheck className="w-4.5 h-4.5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-ink">
                    Preuve de propriété à réaliser
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    Connectez-vous puis choisissez une méthode (DNS, courrier postal
                    ou ProConnect) dans l&apos;onglet « Vérification ».
                  </div>
                </div>
              </li>
            ) : (
              <li className="flex items-start gap-3 neumorph-sm rounded-2xl px-4 py-3">
                <Clock className="w-4.5 h-4.5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-ink">
                    Vérification KYB sous 48h
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    Contrôle SIRET (registre SIRENE) et de l&apos;identité du responsable.
                  </div>
                </div>
              </li>
            )}
            {IS_DEV && (
              <li className="flex items-start gap-3 neumorph-sm rounded-2xl px-4 py-3">
                <Terminal className="w-4.5 h-4.5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-ink">
                    Activation développeur
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    En environnement de dev, activez l&apos;établissement en libre-service
                    depuis le tableau de bord pour générer vos clés PKI immédiatement.
                  </div>
                </div>
              </li>
            )}
          </ul>

          <Button
            as="a"
            href="/ecole/login"
            variant="ghost"
            fullWidth
            rightIcon={<ArrowRight className="w-4.5 h-4.5" />}
          >
            Aller à la connexion
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Onboarding KYB"
      title="Certifiez votre"
      highlight="établissement"
      subtitle="Renseignez l'identité de votre institution et créez le compte administrateur. La validation Know Your Business est requise avant la première émission."
      maxWidthClass="max-w-xl"
      scroll
    >
      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        {/* Error summary — lists exactly which fields block the submission. */}
        {invalidFields.length > 0 && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-2xl border border-danger/30 bg-danger/8 px-4 py-3"
          >
            <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5 text-danger" aria-hidden />
            <div className="text-sm">
              <p className="font-semibold text-danger">
                {invalidFields.length === 1
                  ? "Un champ nécessite votre attention :"
                  : `${invalidFields.length} champs nécessitent votre attention :`}
              </p>
              <p className="mt-0.5 text-danger/90">
                {invalidFields.map((k) => FIELD_LABELS[k]).join(", ")}
              </p>
            </div>
          </div>
        )}

        {/* Institution */}
        <fieldset className="flex flex-col gap-4">
          <legend className="text-[11px] uppercase tracking-wider text-muted-soft font-semibold mb-1">
            Établissement
          </legend>

          <Field
            label={fieldLabel("name")}
            hint="Tel qu'il figurera sur les diplômes émis."
            error={errors.name}
          >
            <Input
              name="name"
              placeholder="HEC Paris"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              leftIcon={<Building2 />}
              required
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field
              label={fieldLabel("siret")}
              hint="14 chiffres — vérifié au registre SIRENE (INSEE)."
              error={errors.siret}
            >
              <Input
                name="siret"
                inputMode="numeric"
                placeholder="12345678900012"
                value={form.siret}
                onChange={(e) => set("siret", stripSpaces(e.target.value))}
                leftIcon={<Hash />}
                required
              />
            </Field>
            <Field
              label={fieldLabel("uai")}
              hint="Identifiant officiel de l'établissement."
              error={errors.uai}
            >
              <Input
                name="uai"
                placeholder="0751234A"
                value={form.uai}
                onChange={(e) => set("uai", stripSpaces(e.target.value).toUpperCase())}
                leftIcon={<BadgeCheck />}
              />
            </Field>
          </div>

          <Field
            label={fieldLabel("city")}
            hint="Ville de l'établissement — recoupée avec la commune officielle (SIRENE)."
            error={errors.city}
          >
            <Input
              name="city"
              autoComplete="address-level2"
              placeholder="Paris"
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              leftIcon={<MapPin />}
            />
          </Field>

          <Field label={fieldLabel("contactEmail")} error={errors.contactEmail}>
            <Input
              type="email"
              name="contactEmail"
              autoComplete="email"
              placeholder="contact@votre-ecole.fr"
              value={form.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
              leftIcon={<Mail />}
              required
            />
          </Field>
        </fieldset>

        {/* Administrator */}
        <fieldset className="flex flex-col gap-4">
          <legend className="text-[11px] uppercase tracking-wider text-muted-soft font-semibold mb-1">
            Compte administrateur
          </legend>

          <Field label={fieldLabel("adminFullName")} error={errors.adminFullName}>
            <Input
              name="adminFullName"
              autoComplete="name"
              placeholder="Camille Durand"
              value={form.adminFullName}
              onChange={(e) => set("adminFullName", e.target.value)}
              leftIcon={<User />}
            />
          </Field>

          <Field label={fieldLabel("adminEmail")} error={errors.adminEmail}>
            <Input
              type="email"
              name="adminEmail"
              autoComplete="email"
              placeholder="admin@votre-ecole.fr"
              value={form.adminEmail}
              onChange={(e) => set("adminEmail", e.target.value)}
              leftIcon={<Mail />}
              required
            />
          </Field>

          <Field
            label={fieldLabel("adminPassword")}
            hint="12 caractères minimum."
            error={errors.adminPassword}
          >
            <Input
              type="password"
              name="adminPassword"
              autoComplete="new-password"
              placeholder="••••••••••••"
              value={form.adminPassword}
              onChange={(e) => set("adminPassword", e.target.value)}
              leftIcon={<Lock />}
              minLength={12}
              required
            />
          </Field>
        </fieldset>

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={submitting}
          rightIcon={<ArrowRight className="w-5 h-5" />}
          className="mt-1"
        >
          Soumettre le dossier KYB
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Déjà certifié&nbsp;?{" "}
        <Link
          href="/ecole/login"
          className="font-semibold text-indigo-600 hover:text-indigo-500 transition-colors"
        >
          Se connecter
        </Link>
      </p>
    </AuthShell>
  );
}
