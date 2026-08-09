-- AlterTable
ALTER TABLE "ExtractionJob" ADD COLUMN     "waitMessage" TEXT,
ADD COLUMN     "waitUntil" TIMESTAMP(3);
