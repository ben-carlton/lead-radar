-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productsSold" TEXT NOT NULL,
    "industriesTargeted" TEXT[],
    "buyerRoles" TEXT[],
    "regions" TEXT[],
    "signalKeywords" TEXT[],
    "excludeKeywords" TEXT[],
    "scoringWeights" JSONB NOT NULL DEFAULT '{"signalStrength":30,"geographicFit":25,"industryFit":20,"recency":15,"contactAvailability":10}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profiles_organizationId_idx" ON "profiles"("organizationId");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

