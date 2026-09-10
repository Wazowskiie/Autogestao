-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "accepts_trade" BOOLEAN,
ADD COLUMN     "color" TEXT,
ADD COLUMN     "doors" INTEGER,
ADD COLUMN     "fuel" TEXT,
ADD COLUMN     "has_manual" BOOLEAN,
ADD COLUMN     "has_spare_key" BOOLEAN,
ADD COLUMN     "ipva_paid" BOOLEAN,
ADD COLUMN     "origin" TEXT,
ADD COLUMN     "owner_count" INTEGER,
ADD COLUMN     "plate" TEXT,
ADD COLUMN     "transmission" TEXT,
ADD COLUMN     "version" TEXT;
