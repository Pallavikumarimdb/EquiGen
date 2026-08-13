import { prisma } from "@/lib/db";
import { dayKey, minuteKey, ModelLimitRecord, TokenBudgetStore } from "./types";

/**
 * Postgres-backed TokenBudgetStore.
 *
 * Window accounting uses one row per (model, UTC-minute). The rolling 60-second window spans
 * at most two minute buckets, so `windowUsed` sums the current and previous buckets. Records are
 * upserted atomically (INSERT ... ON CONFLICT DO UPDATE used = used + excluded.used), which keeps
 * concurrent workers from losing usage — the property a single-process Map cannot provide.
 *
 * Limit rows live in `ModelLimit`, written by runtime header discovery (see limit-discovery.ts).
 */
export class PostgresBudgetStore implements TokenBudgetStore {
  async windowUsed(model: string): Promise<number> {
    const rows = await prisma.tokenBudgetUsage.findMany({
      where: {
        model,
        minuteKey: {
          in: [minuteKey(), minuteKey(new Date(Date.now() - 60_000))],
        },
      },
      select: { used: true },
    });
    return rows.reduce((sum, r) => sum + r.used, 0);
  }

  async dailyUsed(model: string): Promise<number> {
    const day = dayKey();
    // Daily total = every minute bucket whose key starts with today's date.
    const rows = await prisma.tokenBudgetUsage.findMany({
      where: {
        model,
        minuteKey: { startsWith: day },
      },
      select: { used: true },
    });
    return rows.reduce((sum, r) => sum + r.used, 0);
  }

  async recordUsage(model: string, tokens: number): Promise<void> {
    if (tokens < 1) return;
    await prisma.$executeRaw`
      INSERT INTO "TokenBudgetUsage" (model, "minuteKey", used, "updatedAt")
      VALUES (${model}, ${minuteKey()}, ${tokens}, NOW())
      ON CONFLICT ("model", "minuteKey")
      DO UPDATE SET used = "TokenBudgetUsage".used + EXCLUDED.used,
                    "updatedAt" = NOW()
    `;
  }

  async upsertLimit(record: ModelLimitRecord): Promise<void> {
    await prisma.modelLimit.upsert({
      where: { model: record.model },
      update: {
        tpm: record.tpm,
        tpd: record.tpd,
        source: record.source,
        lastDiscoveredAt: record.lastDiscoveredAt ?? null,
      },
      create: {
        model: record.model,
        tpm: record.tpm,
        tpd: record.tpd,
        source: record.source,
        lastDiscoveredAt: record.lastDiscoveredAt ?? null,
      },
    });
  }

  async getLimit(model: string): Promise<ModelLimitRecord | null> {
    const row = await prisma.modelLimit.findUnique({ where: { model } });
    if (!row) return null;
    return {
      model: row.model,
      tpm: row.tpm,
      tpd: row.tpd,
      source: row.source as ModelLimitRecord["source"],
      lastDiscoveredAt: row.lastDiscoveredAt,
    };
  }
}
