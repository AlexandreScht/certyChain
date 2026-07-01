import { desc, eq } from "drizzle-orm";
import { env } from "../../config/env";
import type { PlatformSettingsDTO } from "../../contract/dto";
import type { UpdateSettingsInput } from "../../contract/schemas";
import { db } from "../../db/client";
import { type PlatformSettings, platformSettings } from "../../db/schema";
import { fail } from "../../lib/http-error";

/** Loads the singleton settings row, creating it (from env defaults) if absent. */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  const [existing] = await db
    .select()
    .from(platformSettings)
    .orderBy(desc(platformSettings.updatedAt))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(platformSettings)
    .values({
      autoValidateEnabled: env.SCHOOL_AUTO_VALIDATE,
      autoValidateMinScore: env.SCHOOL_AUTO_VALIDATE_MIN_SCORE,
    })
    .returning();
  if (!created) throw fail.internal();
  return created;
}

export async function updatePlatformSettings(
  input: UpdateSettingsInput,
  adminId: string,
): Promise<PlatformSettings> {
  const current = await getPlatformSettings();
  const [updated] = await db
    .update(platformSettings)
    .set({
      autoValidateEnabled: input.autoValidateEnabled,
      autoValidateMinScore: input.autoValidateMinScore,
      updatedAt: new Date(),
      updatedByAdminId: adminId,
    })
    .where(eq(platformSettings.id, current.id))
    .returning();
  if (!updated) throw fail.internal();
  return updated;
}

export function toPlatformSettingsDTO(s: PlatformSettings): PlatformSettingsDTO {
  return {
    autoValidateEnabled: s.autoValidateEnabled,
    autoValidateMinScore: s.autoValidateMinScore,
    notifyEmail: env.ADMIN_NOTIFY_EMAIL,
    geminiConfigured: env.geminiConfigured,
    geminiModel: env.GEMINI_MODEL,
    inseeConfigured: env.inseeConfigured,
    updatedAt: s.updatedAt ? s.updatedAt.toISOString() : null,
  };
}
