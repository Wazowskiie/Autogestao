-- CreateTable
CREATE TABLE "RenaveIntegration" (
    "id" TEXT NOT NULL,
    "dealershipId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenaveIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RenaveIntegration_dealershipId_key" ON "RenaveIntegration"("dealershipId");
