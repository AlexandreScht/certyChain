/**
 * Régression audit A2 : chaque type d'événement de l'enum serveur `audit_type`
 * doit avoir un libellé français — un type absent s'afficherait en slug brut et
 * deviendrait infiltrable. La liste ci-dessous est le MIROIR de l'enum
 * (apps/server/src/db/schema.ts) : si un type y est ajouté, ce test rappelle
 * de compléter `lib/audit-labels.ts`.
 */
import { AUDIT_LABELS } from "../../../apps/client/admin/src/lib/audit-labels";

const AUDIT_TYPE_ENUM = [
  "school_registered",
  "school_approved",
  "school_auto_approved",
  "school_provisional",
  "school_rejected",
  "school_revoked",
  "verification_method_chosen",
  "ownership_verified",
  "verification_failed",
  "school_login",
  "student_login",
  "student_claim",
  "admin_login",
  "issuance",
  "revocation",
  "share_created",
  "verification",
  "subscription_started",
  "subscription_updated",
  "subscription_canceled",
  "cdc_export_generated",
  "cdc_export_submitted",
  "cdc_crt_ingested",
  "cdc_identity_purged",
  "cdc_module_toggled",
  "cdc_settings_updated",
  "cdc_identity_upserted",
  "cdc_identity_deleted",
  "cdc_export_downloaded",
  "vc_offer_created",
  "vc_credential_issued",
  "transparency_report",
  "school_unfrozen",
  "pq_degraded",
  "refresh_reuse_detected",
] as const;

describe("AUDIT_LABELS (régression A2)", () => {
  it.each(AUDIT_TYPE_ENUM)("possède un libellé pour « %s »", (type) => {
    expect(typeof AUDIT_LABELS[type]).toBe("string");
    expect(AUDIT_LABELS[type]!.length).toBeGreaterThan(0);
  });

  it("ne contient pas de libellés orphelins (types disparus de l'enum)", () => {
    for (const key of Object.keys(AUDIT_LABELS)) {
      expect(AUDIT_TYPE_ENUM).toContain(key as (typeof AUDIT_TYPE_ENUM)[number]);
    }
  });
});
