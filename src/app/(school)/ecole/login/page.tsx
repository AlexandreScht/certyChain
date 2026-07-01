"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Mail, Lock, ArrowRight, KeyRound } from "lucide-react";

import { loginSchool, verifySchoolTotp } from "@/lib/api/endpoints";
import { ApiClientError } from "@/lib/api/client";
import { Button, Field, Input, useToast } from "@/components/ui";
import { AuthShell } from "@/components/school";

export default function SchoolLoginPage() {
  const router = useRouter();
  const { error: toastError } = useToast();

  const [stage, setStage] = useState<"password" | "totp">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mfaStage, setMfaStage] = useState<"enroll" | "verify">("verify");
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handlePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await loginSchool({ email, password });
      setMfaStage(res.mfaStage);
      setOtpauthUri(res.otpauthUri ?? null);
      setSecret(res.secret ?? null);
      setStage("totp");
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : "Une erreur inattendue est survenue.";
      toastError("Connexion impossible", msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTotp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await verifySchoolTotp(code);
      router.push("/ecole/dashboard");
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : "Une erreur inattendue est survenue.";
      toastError("Vérification impossible", msg);
      setSubmitting(false);
    }
  }

  if (stage === "totp") {
    return (
      <AuthShell
        eyebrow="Authentification à deux facteurs"
        title={mfaStage === "enroll" ? "Activez votre" : "Saisissez votre"}
        highlight={mfaStage === "enroll" ? "authentificateur" : "code à 6 chiffres"}
        subtitle={
          mfaStage === "enroll"
            ? "Scannez ce QR code avec votre application d'authentification, puis entrez le code généré."
            : "Entrez le code à 6 chiffres affiché par votre application d'authentification."
        }
        scroll
      >
        {mfaStage === "enroll" && otpauthUri && (
          <div className="mb-4 flex items-center gap-4 rounded-2xl neumorph-sm p-3">
            <div className="shrink-0 rounded-xl bg-white p-2">
              <QRCodeSVG value={otpauthUri} size={140} marginSize={1} />
            </div>
            {secret && (
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-muted-soft font-semibold">
                  Saisie manuelle
                </p>
                <code className="mt-1 block font-mono text-xs text-ink-soft break-all leading-snug">
                  {secret}
                </code>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleTotp} className="flex flex-col gap-3" noValidate>
          <Field label="Code d'authentification">
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              leftIcon={<KeyRound />}
              required
            />
          </Field>
          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={submitting}
            disabled={code.length !== 6}
            rightIcon={<ArrowRight className="w-5 h-5" />}
          >
            Vérifier
          </Button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Portail établissement"
      title="Accédez à votre"
      highlight="espace émission"
      subtitle="Connectez-vous pour émettre, gérer et révoquer les diplômes numériques de votre institution."
    >
      <form onSubmit={handlePassword} className="flex flex-col gap-4" noValidate>
        <Field label="Adresse e-mail">
          <Input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="admin@votre-ecole.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail />}
            required
          />
        </Field>

        <Field label="Mot de passe">
          <Input
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={<Lock />}
            required
          />
        </Field>

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={submitting}
          rightIcon={<ArrowRight className="w-5 h-5" />}
          className="mt-1"
        >
          Se connecter
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Votre établissement n&apos;est pas encore certifié&nbsp;?{" "}
        <Link
          href="/ecole/register"
          className="font-semibold text-indigo-600 hover:text-indigo-500 transition-colors"
        >
          Démarrer le dossier KYB
        </Link>
      </p>
    </AuthShell>
  );
}
