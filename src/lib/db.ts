import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const rawDatabaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/equigen_db";

// Replace legacy sslmode=require to verify-full to satisfy Node.js pg-connection-string v3 & standard libpq
const databaseUrl = rawDatabaseUrl.replace("sslmode=require", "sslmode=verify-full");

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

let pool: Pool;
if (globalForPrisma.pgPool) {
  pool = globalForPrisma.pgPool;
} else {
  pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
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

