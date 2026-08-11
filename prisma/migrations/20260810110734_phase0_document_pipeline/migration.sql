-- AlterTable
ALTER TABLE "ExtractionJob" ADD COLUMN     "degradedChunks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "documentId" TEXT,
ADD COLUMN     "schemaVersion" TEXT,
ADD COLUMN     "targetingVerdict" TEXT;

-- AlterTable
ALTER TABLE "ReportHistory" ADD COLUMN     "dataQuality" TEXT NOT NULL DEFAULT 'ok';

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sha256" TEXT,
    "totalPages" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'parsing',
    "targetingJson" JSONB,
    "targetingVerdict" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentPage" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNo" INTEGER NOT NULL,
    "nativeText" TEXT,
    "ocrText" TEXT,
    "hasTables" BOOLEAN NOT NULL DEFAULT false,
    "isScanned" BOOLEAN NOT NULL DEFAULT false,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "annotations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTable" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNo" INTEGER NOT NULL,
    "tableNo" INTEGER NOT NULL DEFAULT 1,
    "detectedBy" TEXT NOT NULL DEFAULT 'layout',
    "rawJson" JSONB,
    "normalizedJson" JSONB,
    "quality" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "error" TEXT,
    "modelUsed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChunkExtraction" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "chunkKey" TEXT NOT NULL,
    "extractType" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "extractionJson" JSONB,
    "citePages" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "retries" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "latencyMs" INTEGER,
    "modelUsed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChunkExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenBudgetUsage" (
    "model" TEXT NOT NULL,
    "minuteKey" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenBudgetUsage_pkey" PRIMARY KEY ("model","minuteKey")
);

-- CreateTable
CREATE TABLE "ModelLimit" (
    "model" TEXT NOT NULL,
    "tpm" INTEGER NOT NULL DEFAULT 6000,
    "tpd" INTEGER NOT NULL DEFAULT 1000000,
    "source" TEXT NOT NULL DEFAULT 'configured',
    "lastDiscoveredAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelLimit_pkey" PRIMARY KEY ("model")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "reportId" TEXT,
    "jobId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'unread',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentPage_documentId_idx" ON "DocumentPage"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPage_documentId_pageNo_key" ON "DocumentPage"("documentId", "pageNo");

-- CreateIndex
CREATE INDEX "DocumentTable_documentId_idx" ON "DocumentTable"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTable_documentId_pageNo_tableNo_key" ON "DocumentTable"("documentId", "pageNo", "tableNo");

-- CreateIndex
CREATE INDEX "ChunkExtraction_jobId_status_idx" ON "ChunkExtraction"("jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChunkExtraction_jobId_chunkKey_extractType_key" ON "ChunkExtraction"("jobId", "chunkKey", "extractType");

-- CreateIndex
CREATE INDEX "TokenBudgetUsage_model_idx" ON "TokenBudgetUsage"("model");

-- AddForeignKey
ALTER TABLE "DocumentPage" ADD CONSTRAINT "DocumentPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTable" ADD CONSTRAINT "DocumentTable_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTable" ADD CONSTRAINT "DocumentTable_pageNo_documentId_fkey" FOREIGN KEY ("pageNo", "documentId") REFERENCES "DocumentPage"("pageNo", "documentId") ON DELETE CASCADE ON UPDATE CASCADE;
