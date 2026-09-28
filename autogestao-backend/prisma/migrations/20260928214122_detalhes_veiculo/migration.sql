-- AlterEnum
ALTER TYPE "VehicleType" ADD VALUE 'other';

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "category" TEXT,
ADD COLUMN     "chassis" TEXT,
ADD COLUMN     "engine_cc" INTEGER,
ADD COLUMN     "manufacture_year" INTEGER,
ADD COLUMN     "motor_power" INTEGER,
ADD COLUMN     "renavam" TEXT;
