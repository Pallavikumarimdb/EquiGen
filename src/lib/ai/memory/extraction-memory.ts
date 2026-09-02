/**
 * Extraction Memory Store (Phase 3 — Agent Intelligence)
 *
 * Caches successful PDF extraction strategies, table formats, and document hints
 * per company ticker and sector. Helps future extractions recall high-accuracy
 * parsing patterns for identical or similar document formats.
 */

export interface ExtractionPatternHint {
  ticker: string;
  sector: string;
  financialPageRanges?: number[];
  tableFormatType?: "income_statement" | "balance_sheet" | "segment_breakdown" | "concall_qa";
  preferredMode?: "layout" | "vision" | "ocr";
  knownPitfalls?: string[];
  successCount: number;
  lastUpdatedAt: string;
}

export class ExtractionMemoryStore {
  private static inMemoryCache: Map<string, ExtractionPatternHint> = new Map();

  /**
   * Retrieves extraction hints for a target ticker or sector
   */
  public static getExtractionHints(ticker: string, sector?: string): ExtractionPatternHint | null {
    const upperTicker = ticker.toUpperCase();
    const cached = this.inMemoryCache.get(upperTicker);
    if (cached) return cached;

    if (sector) {
      const sectorKey = `SECTOR_${sector.toUpperCase()}`;
      const sectorCached = this.inMemoryCache.get(sectorKey);
      if (sectorCached) return sectorCached;
    }

    return null;
  }

  /**
   * Records a successful extraction outcome to memory
   */
  public static recordExtractionOutcome(
    ticker: string,
    sector: string,
    details: {
      financialPageRanges?: number[];
      preferredMode?: "layout" | "vision" | "ocr";
      knownPitfalls?: string[];
    }
  ): void {
    const key = ticker.toUpperCase();
    const existing = this.inMemoryCache.get(key);

    const hint: ExtractionPatternHint = {
      ticker: key,
      sector: sector.toUpperCase(),
      financialPageRanges: details.financialPageRanges ?? existing?.financialPageRanges,
      preferredMode: details.preferredMode ?? existing?.preferredMode ?? "layout",
      knownPitfalls: details.knownPitfalls ?? existing?.knownPitfalls ?? [],
      successCount: (existing?.successCount ?? 0) + 1,
      lastUpdatedAt: new Date().toISOString(),
    };

    this.inMemoryCache.set(key, hint);
  }

  /**
   * Clears in-memory cache (primarily for tests)
   */
  public static clear(): void {
    this.inMemoryCache.clear();
  }
}
