-- CreateTable
CREATE TABLE "vehicle_files" (
    "id" TEXT NOT NULL,
    "dealership_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storage_key" TEXT,
    "url" TEXT,
    "mime_type" TEXT,
    "size" INTEGER,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_invoices" (
    "id" TEXT NOT NULL,
    "dealership_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "number" TEXT,
    "series" TEXT,
    "access_key" TEXT,
    "operation" TEXT,
    "cfop" TEXT,
    "type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'authorized',
    "issuer_name" TEXT,
    "issuer_document" TEXT,
    "recipient_name" TEXT,
    "recipient_document" TEXT,
    "amount" DECIMAL(12,2),
    "issued_at" TIMESTAMP(3),
    "xml_storage_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_renave" (
    "id" TEXT NOT NULL,
    "dealership_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "entry_status" TEXT NOT NULL DEFAULT 'not_sent',
    "entry_at" TIMESTAMP(3),
    "entry_protocol" TEXT,
    "exit_status" TEXT NOT NULL DEFAULT 'not_sent',
    "exit_at" TIMESTAMP(3),
    "exit_protocol" TEXT,
    "notes" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_renave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_expenses" (
    "id" TEXT NOT NULL,
    "dealership_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "supplier" TEXT,
    "requester" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "add_to_cost" BOOLEAN NOT NULL DEFAULT true,
    "financial_transaction_id" TEXT,
    "created_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_acquisitions" (
    "id" TEXT NOT NULL,
    "dealership_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownership_type" TEXT NOT NULL DEFAULT 'own',
    "supplier_name" TEXT,
    "supplier_document" TEXT,
    "supplier_phone" TEXT,
    "document_owner_name" TEXT,
    "document_owner_document" TEXT,
    "purchase_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payoff_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "debts_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "financial_transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_acquisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_pendencies" (
    "id" TEXT NOT NULL,
    "dealership_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "done_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_pendencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_web" (
    "id" TEXT NOT NULL,
    "dealership_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "web_price" DECIMAL(12,2),
    "promo_price" DECIMAL(12,2),
    "youtube_url" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_web_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_files_vehicle_id_idx" ON "vehicle_files"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_invoices_vehicle_id_idx" ON "vehicle_invoices"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_renave_vehicle_id_key" ON "vehicle_renave"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_expenses_financial_transaction_id_key" ON "vehicle_expenses"("financial_transaction_id");

-- CreateIndex
CREATE INDEX "vehicle_expenses_vehicle_id_idx" ON "vehicle_expenses"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_acquisitions_vehicle_id_key" ON "vehicle_acquisitions"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_acquisitions_financial_transaction_id_key" ON "vehicle_acquisitions"("financial_transaction_id");

-- CreateIndex
CREATE INDEX "vehicle_pendencies_vehicle_id_idx" ON "vehicle_pendencies"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_web_vehicle_id_key" ON "vehicle_web"("vehicle_id");

-- AddForeignKey
ALTER TABLE "vehicle_files" ADD CONSTRAINT "vehicle_files_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_invoices" ADD CONSTRAINT "vehicle_invoices_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_renave" ADD CONSTRAINT "vehicle_renave_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_expenses" ADD CONSTRAINT "vehicle_expenses_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_acquisitions" ADD CONSTRAINT "vehicle_acquisitions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_pendencies" ADD CONSTRAINT "vehicle_pendencies_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_web" ADD CONSTRAINT "vehicle_web_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
