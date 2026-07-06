/**
 * Redacts an email address for display/logging: keeps the first 2 local-part
 * characters, masks the rest, keeps the domain (e.g. "al••••••@ecole.fr").
 *
 * Lives in `lib/` (not in an auth service) so any layer — including the mailer
 * and loggers — can mask recipient PII without importing a feature module.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "••••";
  const visible = local.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(local.length - visible.length, 2))}@${domain}`;
}
