-- CreateTable
CREATE TABLE "ad_listings" (
    "id" TEXT NOT NULL,
    "dealership_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL(12,2) NOT NULL,
    "photos" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_listings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ad_listings_dealership_id_created_at_idx" ON "ad_listings"("dealership_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ad_listings_dealership_id_vehicle_id_channel_key" ON "ad_listings"("dealership_id", "vehicle_id", "channel");

-- AddForeignKey
ALTER TABLE "ad_listings" ADD CONSTRAINT "ad_listings_dealership_id_fkey" FOREIGN KEY ("dealership_id") REFERENCES "dealerships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_listings" ADD CONSTRAINT "ad_listings_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
