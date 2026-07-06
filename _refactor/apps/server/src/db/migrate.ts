import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../config/env";
import { logger } from "../lib/logger";

/** Applies pending SQL migrations from the `drizzle/` folder (idempotent). */
export async function runMigrations(): Promise<void> {
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  const client = postgres(env.DATABASE_URL, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder });
    logger.info("migrations.applied", { migrationsFolder });
  } finally {
    await client.end({ timeout: 5 });
  }
}
