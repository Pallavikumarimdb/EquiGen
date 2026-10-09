import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Database connection string.
 *
 * SECURITY: this previously fell back to a hardcoded credential-bearing DSN
 * (`postgresql://postgres:postgres@localhost:5432/equigen_db`). A deployment that
 * forgot DATABASE_URL would silently connect to a local database instead of failing
 * loudly — which reads as "the app is broken" rather than "you forgot configuration",
 * and in a container with a mounted local Postgres could point at the wrong data.
 *
 * There is no default now. Resolution stays lazy so `next build` (which imports this
 * module without a runtime environment) still succeeds.
 */
function databaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      "[db] DATABASE_URL is not set. The application will not guess a database. " +
        "Set it in your environment (see .env.example).",
    );
  }
  // Replace legacy sslmode=require to verify-full to satisfy Node.js
  // pg-connection-string v3 & standard libpq.
  return raw.replace("sslmode=require", "sslmode=verify-full");
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

let pool: Pool;
if (globalForPrisma.pgPool) {
  pool = globalForPrisma.pgPool;
} else {
  pool = new Pool({
    connectionString: databaseUrl(),
    max: 10,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 45000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });
  pool.setMaxListeners(50);
  pool.on("error", (err) => {
    console.warn("[PG Pool] Client connection drop handled:", err.message);
  });
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pgPool = pool;
  }
}

const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

