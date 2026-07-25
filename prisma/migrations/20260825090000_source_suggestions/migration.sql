-- AlterEnum
ALTER TYPE "AiStage" ADD VALUE 'SUGGEST_SOURCES';

-- AlterTable
ALTER TABLE "token_usages" ALTER COLUMN "runId" DROP NOT NULL;
