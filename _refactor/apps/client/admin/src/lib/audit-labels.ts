/**
 * Libellés français des types d'événements du journal d'audit — SOURCE UNIQUE,
 * consommée par le dashboard et la page Audit. Doit couvrir TOUT l'enum
 * `audit_type` du serveur (un type absent s'afficherait en slug brut et
 * deviendrait infiltrable).
 */
export const AUDIT_LABELS: Record<string, string> = {
  school_registered: "Inscription d'école",
  school_approved: "École validée",
  school_auto_approved: "École auto-validée (IA)",
  school_provisional: "Existence confirmée (→ propriété)",
  school_rejected: "École refusée",
  school_revoked: "École révoquée",
  verification_method_chosen: "Méthode de propriété choisie",
  ownership_verified: "Propriété vérifiée",
  verification_failed: "Échec vérification propriété",
  school_login: "Connexion école",
  student_login: "Connexion élève",
  student_claim: "Diplôme récupéré (claim)",
  admin_login: "Connexion admin",
  issuance: "Émission de diplôme",
  revocation: "Révocation de diplôme",
  share_created: "Lien de partage créé",
  verification: "Vérification",
  subscription_started: "Abonnement démarré",
  subscription_updated: "Abonnement mis à jour",
  subscription_canceled: "Abonnement résilié",
};
