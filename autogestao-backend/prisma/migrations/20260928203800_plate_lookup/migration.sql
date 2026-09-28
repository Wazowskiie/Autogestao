-- CreateTable
CREATE TABLE "PlateLookup" (
    "plate" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlateLookup_pkey" PRIMARY KEY ("plate")
);
