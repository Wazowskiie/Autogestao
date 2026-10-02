-- AlterTable
ALTER TABLE "RenaveIntegration" ADD COLUMN     "city" TEXT,
ADD COLUMN     "cnpj" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "mobile" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "requestedAt" TIMESTAMP(3),
ADD COLUMN     "responsibleName" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'draft',
ADD COLUMN     "tradeName" TEXT,
ADD COLUMN     "uf" TEXT;
