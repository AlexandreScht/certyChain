"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Building2, Mail, CheckCircle2, AlertTriangle, Save } from "lucide-react";

import { getSettings, updateSettings } from "@/lib/api/endpoints";
import { ApiClientError } from "@/lib/api/client";
import { Button, Card, Field, Input, Skeleton, PageHeader, useToast } from "@/components/ui";
import { FadeIn } from "@/components/admin";
import { cn } from "@/lib/utils";
import type { PlatformSettingsDTO } from "@contract/dto";

export default function AdminSettingsPage() {
  const { success, error: toastError } = useToast();

  const [settings, setSettings] = useState<PlatformSettingsDTO | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [minScore, setMinScore] = useState(85);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getSettings();
      setSettings(s);
      setEnabled(s.autoValidateEnabled);
      setMinScore(s.autoValidateMinScore);
    } catch (err) {
      if (err instanceof ApiClientError) toastError("Chargement impossible", err.message);
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await updateSettings({
        autoValidateEnabled: enabled,
        autoValidateMinScore: Math.max(0, Math.min(100, minScore)),
      });
      setSettings(updated);
      success("Paramètres enregistrés", "La configuration d'auto-validation a été mise à jour.");
    } catch (err) {
      if (err instanceof ApiClientError) toastError("Enregistrement impossible", err.message);
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    settings !== null &&
    (enabled !== settings.autoValidateEnabled || minScore !== settings.autoValidateMinScore);

  return (
    <div className="flex flex-col gap-6">
      <FadeIn>
        <PageHeader
          eyebrow="Configuration"
          title="Paramètres"
          gradient="de validation"
          cool
          subtitle="Pilotez l'auto-validation des écoles par l'IA et les notifications de revue."
        />
      </FadeIn>

      {loading ? (
        <Skeleton height={320} className="rounded-[1.75rem]" />
      ) : (
        <>
          <FadeIn>
            <Card strong className="p-6">
              <div className="flex items-start gap-4">
                <span className="grid place-items-center w-11 h-11 rounded-xl bg-indigo-100 text-indigo-600 shrink-0">
                  <Bot className="w-5 h-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-bold text-ink text-base">Auto-validation par IA</h3>
                  <p className="text-sm text-muted mt-0.5 leading-relaxed">
                    Lorsqu&apos;elle est activée, une école dont le SIRET est confirmé au registre
                    SIRENE <strong>et</strong> dont le score atteint le seuil est approuvée
                    automatiquement (génération des clés + certificat). Sinon, une revue manuelle
                    est requise et un e-mail d&apos;alerte est envoyé.
                  </p>

                  {/* Toggle */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={() => setEnabled((v) => !v)}
                    className={cn(
                      "mt-5 inline-flex items-center gap-3 cursor-pointer rounded-full p-1 pr-4 transition-colors",
                      enabled ? "bg-success/15" : "neumorph-inset",
                    )}
                  >
                    <span
                      className={cn(
                        "relative w-12 h-7 rounded-full transition-colors",
                        enabled ? "bg-success" : "bg-muted-soft/40",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform",
                          enabled && "translate-x-5",
                        )}
                      />
                    </span>
                    <span className="text-sm font-semibold text-ink-soft">
                      {enabled ? "Activée" : "Désactivée"}
                    </span>
                  </button>

                  {/* Threshold */}
                  <div className={cn("mt-6 max-w-xs transition-opacity", !enabled && "opacity-50")}>
                    <Field
                      label="Score minimum requis pour auto-valider"
                      hint="0–100. Recommandé : ≥ 85 pour limiter les faux positifs."
                    >
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={minScore}
                        disabled={!enabled}
                        onChange={(e) => setMinScore(Number(e.target.value))}
                      />
                    </Field>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <Button onClick={handleSave} loading={saving} disabled={!dirty} leftIcon={<Save className="w-4 h-4" />}>
                  Enregistrer
                </Button>
              </div>
            </Card>
          </FadeIn>

          {/* Provider / notification status */}
          <FadeIn index={1}>
            <Card className="p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft">
                  <Building2 className="w-4 h-4 text-muted-soft" />
                  Registre SIRENE (INSEE) — source de vérité
                </span>
                {settings?.inseeConfigured ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-3 py-1.5 text-xs font-semibold text-success">
                    <CheckCircle2 className="w-4 h-4" /> Configuré
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/12 px-3 py-1.5 text-xs font-semibold text-amber-500">
                    <AlertTriangle className="w-4 h-4" /> Clé absente — repli IA/manuel
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-hairline/60 pt-4">
                <span className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft">
                  <Bot className="w-4 h-4 text-muted-soft" />
                  Vérification IA ({settings?.geminiModel})
                </span>
                {settings?.geminiConfigured ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-3 py-1.5 text-xs font-semibold text-success">
                    <CheckCircle2 className="w-4 h-4" /> Configuré
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/12 px-3 py-1.5 text-xs font-semibold text-amber-500">
                    <AlertTriangle className="w-4 h-4" /> Clé absente — revue manuelle
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-hairline/60 pt-4">
                <span className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft">
                  <Mail className="w-4 h-4 text-muted-soft" />
                  Notifications de revue
                </span>
                <code className="text-xs text-muted break-all">{settings?.notifyEmail}</code>
              </div>
            </Card>
          </FadeIn>
        </>
      )}
    </div>
  );
}
