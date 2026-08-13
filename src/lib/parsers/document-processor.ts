/**
 * document-processor.ts — Phase 0 ingestion: parse once, persist per-page, target sections.
 *
 * Runs the fast native-text pass over a PDF, flags scanned/table pages, runs the section
 * detector, and persists Document → DocumentPage → DocumentTable rows so the extraction
 * pipeline never re-parses the file. Table extraction here uses ONLY the free layout step;
 * vision/OCR steps belong to the fallback ladder (ocr_recheck verdict) at extraction time.
 *
 * Persistence is best-effort: a DB failure must never fail the upload itself.
 */

import { pdfExtractor } from "./pdf-extractor";
import { detectSections, TargetingResult } from "./section-detector";
import { parseLayoutTables } from "./table-extractor";
import { prisma } from "@/lib/db";
import { computeSHA256 } from "@/lib/utils/hash";
import type { Prisma } from "@prisma/client";

export interface DocumentProcessResult {
  documentId: string | null;
  targeting: TargetingResult;
  persisted: boolean;
  error?: string;
}

export async function processPdfDocument(
  buffer: Buffer,
  fileName: string,
): Promise<DocumentProcessResult> {
  const cleanArrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const uint8Array = new Uint8Array(cleanArrayBuffer);

  const pages = await pdfExtractor.extractPages(uint8Array);
  const targeting = detectSections(
    pages.map((p) => ({
      pageNo: p.pageNo,
      text: p.nativeText,
      isScanned: p.isScanned,
    })),
  );

  if (!process.env.DATABASE_URL) {
    return {
      documentId: null,
      targeting,
      persisted: false,
      error: "No database configured — document pipeline skipped.",
    };
  }

  try {
    const document = await prisma.document.create({
      data: {
        storageKey: fileName,
        fileName,
        sha256: computeSHA256(buffer.toString("base64")),
        totalPages: pages.length,
        status: "parsed",
        targetingJson: targeting as unknown as Prisma.InputJsonValue,
        targetingVerdict: targeting.verdict,
      },
    });

    // Table layout parsing is CPU-bound, so do it BEFORE the transaction; the
    // transaction then only does fast bulk inserts (createMany, one round-trip each).
    const pageRows = pages.map((page) => ({
      documentId: document.id,
      pageNo: page.pageNo,
      nativeText: page.nativeText,
      hasTables: page.hasTables,
      isScanned: page.isScanned,
      charCount: page.nativeText.length,
      annotations: {
        financials: targeting.map.financials.includes(page.pageNo),
        narrative: targeting.map.narrative.includes(page.pageNo),
        swotCandidate: targeting.map.swotCandidates.includes(page.pageNo),
      } as unknown as Prisma.InputJsonValue,
    }));

    const tableRows = pages.flatMap((page) =>
      (page.hasTables ? parseLayoutTables(page.nativeText) : []).map(
        (rawJson, i) => ({
          documentId: document.id,
          pageNo: page.pageNo,
          tableNo: i + 1,
          detectedBy: "layout" as const,
          rawJson: rawJson as unknown as Prisma.InputJsonValue,
          quality: null,
          status: "ok" as const,
        }),
      ),
    );

    await prisma.$transaction(
      async (tx) => {
        await tx.documentPage.createMany({ data: pageRows });
        if (tableRows.length > 0) {
          await tx.documentTable.createMany({ data: tableRows });
        }
      },
      { timeout: 30000 },
    );

    return { documentId: document.id, targeting, persisted: true };
  } catch (err) {
    console.warn(
      "[DocumentProcessor] Persistence failed (upload continues):",
      err,
    );
    return {
      documentId: null,
      targeting,
      persisted: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
