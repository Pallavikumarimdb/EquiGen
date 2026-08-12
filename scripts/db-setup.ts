import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('[DB Setup] DATABASE_URL env variable not defined.');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('[DB Setup] Creating GIN full-text search index on DocumentPage...');
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS document_page_search_idx ON "DocumentPage" 
    USING gin(to_tsvector('english', coalesce("nativeText", '') || ' ' || coalesce("ocrText", '')));
  `);
  console.log('[DB Setup] GIN index created successfully.');
}

main()
  .catch((e) => {
    console.error('[DB Setup] Error creating index:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
