-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "margin" DECIMAL(8,4) NOT NULL DEFAULT 0,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "profit" DECIMAL(12,2) NOT NULL DEFAULT 0;
