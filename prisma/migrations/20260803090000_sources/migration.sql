-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('RSS', 'HTML');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('ACTIVE', 'SUGGESTED', 'REJECTED');

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "feedUrl" TEXT,
    "selectors" JSONB,
    "status" "SourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "suggestedReason" TEXT,
    "lastCrawledAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "articlesFound" INTEGER NOT NULL DEFAULT 0,
    "leadsFound" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sources_organizationId_idx" ON "sources"("organizationId");

-- CreateIndex
CREATE INDEX "sources_profileId_idx" ON "sources"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "sources_organizationId_url_key" ON "sources"("organizationId", "url");

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

