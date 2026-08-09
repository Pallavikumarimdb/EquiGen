-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "actorType" TEXT NOT NULL DEFAULT 'human',
ADD COLUMN     "fromState" TEXT,
ADD COLUMN     "toState" TEXT;

-- AlterTable
ALTER TABLE "ReportHistory" ADD COLUMN     "approvedByIp" TEXT,
ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "versionNo" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "CorrectionProposal" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reasoning" TEXT,
    "origin" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorrectionProposal_pkey" PRIMARY KEY ("id")
);
