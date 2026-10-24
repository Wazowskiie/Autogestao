-- Execute via Prisma migrate deploy; faça backup antes.
ALTER TABLE "ad_listings" ADD COLUMN "vehicle_snapshot" JSONB;
ALTER TABLE "ad_listings" ADD COLUMN "archived_at" TIMESTAMP(3);
ALTER TABLE "ad_listings" ALTER COLUMN "vehicle_id" DROP NOT NULL;
-- Preserva snapshot para anúncios existentes antes de qualquer exclusão.
UPDATE "ad_listings" AS a
SET "vehicle_snapshot" = jsonb_build_object(
  'vehicleId', v."id", 'brand', v."brand", 'model', v."model",
  'version', v."version", 'year', v."year", 'km', v."km")
FROM "vehicles" AS v WHERE a."vehicle_id" = v."id";
ALTER TABLE "ad_listings" DROP CONSTRAINT "ad_listings_vehicle_id_fkey";
ALTER TABLE "ad_listings" ADD CONSTRAINT "ad_listings_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
