-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "birth_date" TIMESTAMP(3),
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "how_met" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
