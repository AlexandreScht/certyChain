"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Mail, Lock, ArrowRight, ShieldCheck, KeyRound } from "lucide-react";

import { adminLogin, adminVerifyTotp } from "@/lib/api/endpoints";
import { ApiClientError } from "@/lib/api/client";
import { Button, Field, Input, useToast } from "@/components/ui";
import { AuthShell } from "@/components/admin";

export default function AdminLoginPage() {
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
      const res = await adminLogin({ email, password });
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
      await adminVerifyTotp(code);
      router.push("/");
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
            ? "Scannez ce QR code avec Google Authenticator (ou équivalent), puis entrez le code généré pour finaliser l'activation."
            : "Entrez le code à 6 chiffres affiché par votre application d'authentification."
        }
      >
        {mfaStage === "enroll" && otpauthUri && (
          <div className="mb-5 flex flex-col items-center gap-3">
            <div className="rounded-2xl bg-white p-3 neumorph-sm">
              <QRCodeSVG value={otpauthUri} size={168} marginSize={1} />
            </div>
            {secret && (
              <p className="text-center text-xs text-muted">
                Saisie manuelle&nbsp;:{" "}
                <code className="font-mono text-ink-soft break-all">{secret}</code>
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleTotp} className="flex flex-col gap-4" noValidate>
          <Field label="Code d'authentification" required>
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
      eyebrow="Accès restreint"
      title="Console"
      highlight="d'administration"
      subtitle="Authentification réservée aux administrateurs CertifyChain. Toutes les connexions sont journalisées."
    >
      <form onSubmit={handlePassword} className="flex flex-col gap-4" noValidate>
        <Field label="Adresse e-mail" required>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="admin@certifychain.local"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail />}
            required
          />
        </Field>

        <Field label="Mot de passe" required>
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
          Continuer
        </Button>
      </form>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-soft">
        <ShieldCheck className="w-3.5 h-3.5" />
        Protégé par mot de passe + 2FA
      </p>
    </AuthShell>
  );
}
