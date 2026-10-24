ALTER TABLE "ad_listings"
  ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "published_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "external_url" TEXT,
  ADD COLUMN IF NOT EXISTS "removed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "removed_by_id" TEXT;
