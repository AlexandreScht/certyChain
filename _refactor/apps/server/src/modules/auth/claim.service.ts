import { eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { type Student, diplomas, students, studentEmailAliases } from "../../db/schema";
import { fail } from "../../lib/http-error";

/**
 * Completes a claim: binds `personalEmail` (just proven via OTP) as the
 * holder's durable login identity for the given alias. Two cases:
 *  - First claim ever for this person → activates the provisional student
 *    created at issuance (fills in `students.email`).
 *  - `personalEmail` already belongs to another (already-claimed) student —
 *    e.g. a diploma from a second school reaching the same person — → merges
 *    the provisional student's diplomas and aliases into that existing wallet
 *    and discards the now-empty provisional row.
 * Atomic (single transaction): a partial merge would corrupt ownership.
 */
export async function claimAlias(aliasId: string, personalEmail: string): Promise<Student> {
  return db.transaction(async (tx) => {
    const [alias] = await tx
      .select()
      .from(studentEmailAliases)
      .where(eq(studentEmailAliases.id, aliasId))
      .limit(1);
    if (!alias) throw fail.notFound("Lien de récupération invalide");
    if (alias.verifiedAt) throw fail.conflict("Ce diplôme a déjà été récupéré");

    const provisionalId = alias.studentId;
    const [existing] = await tx
      .select()
      .from(students)
      .where(sql`lower(${students.email}) = lower(${personalEmail})`)
      .limit(1);

    let target: Student;
    if (existing && existing.id !== provisionalId) {
      // Merge: fold the provisional identity's diplomas + aliases into the
      // holder's existing wallet, then discard the now-empty provisional row.
      await tx
        .update(diplomas)
        .set({ studentId: existing.id })
        .where(eq(diplomas.studentId, provisionalId));
      await tx
        .update(studentEmailAliases)
        .set({ studentId: existing.id })
        .where(eq(studentEmailAliases.studentId, provisionalId));
      await tx.delete(students).where(eq(students.id, provisionalId));
      target = existing;
    } else {
      // First claim ever for this person: activate the provisional row in place.
      const [activated] = await tx
        .update(students)
        .set({ email: personalEmail })
        .where(eq(students.id, provisionalId))
        .returning();
      if (!activated) throw fail.internal();
      target = activated;
    }

    // `verifiedAt` is the sole "done" signal — the token itself is left in place
    // (not nulled) so a stale link still resolves to a clear "already claimed"
    // status instead of a confusing "not found" (loadClaimableAlias looks it up
    // by token; every route already gates on `verifiedAt`, so this is inert).
    await tx
      .update(studentEmailAliases)
      .set({ verifiedAt: new Date() })
      .where(eq(studentEmailAliases.id, aliasId));

    return target;
  });
}
