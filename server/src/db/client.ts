import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env";
import * as schema from "./schema";

/** Shared query client (connection pool). */
const queryClient = postgres(env.DATABASE_URL, {
  max: env.isProd ? 10 : 5,
  idle_timeout: 30,
  connect_timeout: 10,
  prepare: true,
});

export const db = drizzle(queryClient, { schema });
export { schema };
export const sqlClient = queryClient;
export type DB = typeof db;
