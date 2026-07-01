import { runMigrations } from "../db/migrate";
import { logger } from "../lib/logger";

runMigrations()
  .then(() => {
    logger.info("migrate.done");
    process.exit(0);
  })
  .catch((e) => {
    logger.error("migrate.failed", { error: String(e) });
    process.exit(1);
  });
