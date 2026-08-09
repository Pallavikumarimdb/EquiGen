-- CreateTable
CREATE TABLE "ReportHistory" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "reportData" JSONB NOT NULL,
    "pdfBase64" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reviewerName" TEXT,
    "sebiRegNo" TEXT,
    "approvedAt" TIMESTAMP(3),
    "modelUsedForFinancials" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionJob" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "stepIndex" INTEGER NOT NULL DEFAULT 0,
    "condensedContext" TEXT,
    "companyGeneral" JSONB,
    "swotAndThesis" JSONB,
    "financials" JSONB,
    "mathErrors" JSONB,
    "errorMessage" TEXT,
    "retryAfterSeconds" INTEGER,
    "reportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default-org',
    "provider" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL DEFAULT 'anonymous',
    "action" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_orgId_provider_key" ON "ApiKey"("orgId", "provider");
