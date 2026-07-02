-- AlterTable
ALTER TABLE "delivery_records" ADD COLUMN "external_source" VARCHAR(50),
ADD COLUMN "external_row_id" VARCHAR(100);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_records_external_source_external_row_id_key" ON "delivery_records"("external_source", "external_row_id");

-- CreateTable
CREATE TABLE "intake_sync_state" (
    "id" UUID NOT NULL,
    "adapter_name" VARCHAR(50) NOT NULL,
    "cursor_key" VARCHAR(255) NOT NULL,
    "last_cursor" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intake_sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "intake_sync_state_adapter_name_cursor_key_key" ON "intake_sync_state"("adapter_name", "cursor_key");
