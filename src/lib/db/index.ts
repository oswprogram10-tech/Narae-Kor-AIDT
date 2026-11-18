import "server-only";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

// DATABASE_URL이 있으면 PostgreSQL(예: Supabase 무료 티어)에, 없으면 내장 PGlite(./.data/pglite)에 저장한다.
// 두 드라이버 모두 같은 스키마·마이그레이션(./drizzle)을 쓴다.

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

type GlobalWithDb = typeof globalThis & { __naraeDb?: Promise<DB> };
const g = globalThis as GlobalWithDb;

async function create(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { max: 5, prepare: false });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as DB;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (dir !== "memory://") fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  if (!g.__naraeDb) {
    g.__naraeDb = create().catch((err) => {
      g.__naraeDb = undefined;
      throw err;
    });
  }
  return g.__naraeDb;
}

export { schema };
