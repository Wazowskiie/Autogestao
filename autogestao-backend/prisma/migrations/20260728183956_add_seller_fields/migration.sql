-- AlterTable
ALTER TABLE "users" ADD COLUMN     "commissionRate" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "phone" TEXT;
