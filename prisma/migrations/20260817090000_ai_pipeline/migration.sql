-- CreateEnum
CREATE TYPE "AiStage" AS ENUM ('CLASSIFY', 'EXTRACT', 'ENRICH');

-- CreateEnum
CREATE TYPE "ContactSource" AS ENUM ('ARTICLE', 'WEB_SEARCH', 'INFERRED_ROLE', 'NONE');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'DISMISSED');

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "classifierConfidence" DOUBLE PRECISION,
ADD COLUMN     "signalType" TEXT;

-- CreateTable
CREATE TABLE "token_usages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stage" "AiStage" NOT NULL,
    "model" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL,
    "tokensOut" INTEGER NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "suburb" TEXT,
    "state" TEXT,
    "siteAddress" TEXT,
    "signalType" TEXT NOT NULL,
    "whyItsALead" TEXT NOT NULL,
    "estimatedTimeframe" TEXT,
    "score" INTEGER NOT NULL,
    "scoreBreakdown" JSONB NOT NULL,
    "contactName" TEXT,
    "contactRole" TEXT,
    "contactSource" "ContactSource" NOT NULL DEFAULT 'NONE',
    "contactConfidence" DOUBLE PRECISION,
    "sourceUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "token_usages_organizationId_idx" ON "token_usages"("organizationId");

-- CreateIndex
CREATE INDEX "token_usages_runId_idx" ON "token_usages"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "leads_articleId_key" ON "leads"("articleId");

-- CreateIndex
CREATE INDEX "leads_organizationId_idx" ON "leads"("organizationId");

-- CreateIndex
CREATE INDEX "leads_profileId_idx" ON "leads"("profileId");

-- AddForeignKey
ALTER TABLE "token_usages" ADD CONSTRAINT "token_usages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_usages" ADD CONSTRAINT "token_usages_runId_fkey" FOREIGN KEY ("runId") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
