-- CreateEnum
CREATE TYPE "ArticleStage" AS ENUM ('FETCHED', 'KEYWORD_REJECTED', 'KEYWORD_PASSED', 'CLASSIFIED', 'LEAD_EXTRACTED');

-- CreateEnum
CREATE TYPE "RunMode" AS ENUM ('BACKFILL', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "bodyText" TEXT,
    "stage" "ArticleStage" NOT NULL DEFAULT 'FETCHED',
    "keywordScore" INTEGER NOT NULL DEFAULT 0,
    "rejectReason" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "mode" "RunMode" NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "lookbackDays" INTEGER,
    "articlesFetched" INTEGER NOT NULL DEFAULT 0,
    "articlesFiltered" INTEGER NOT NULL DEFAULT 0,
    "articlesClassified" INTEGER NOT NULL DEFAULT 0,
    "leadsCreated" INTEGER NOT NULL DEFAULT 0,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "errors" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "articles_organizationId_idx" ON "articles"("organizationId");

-- CreateIndex
CREATE INDEX "articles_sourceId_idx" ON "articles"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "articles_organizationId_urlHash_key" ON "articles"("organizationId", "urlHash");

-- CreateIndex
CREATE INDEX "runs_organizationId_idx" ON "runs"("organizationId");

-- CreateIndex
CREATE INDEX "runs_profileId_idx" ON "runs"("profileId");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

