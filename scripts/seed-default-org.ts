import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

async function main() {
  let prisma: PrismaClient;
  if (databaseUrl) {
    const pool = new Pool({ connectionString: databaseUrl });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
  } else {
    prisma = new PrismaClient();
  }

  console.log("Checking and seeding default organization ('default-org')...");
  
  const defaultOrg = await prisma.organization.upsert({
    where: { id: "default-org" },
    update: {},
    create: {
      id: "default-org",
      name: "Default Organization",
    },
  });
  
  console.log("Successfully seeded organization:", defaultOrg);
  
  // Re-generate Prisma Client just to be safe
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Error seeding organization:", err);
  process.exit(1);
});
