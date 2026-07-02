-- AlterTable
ALTER TABLE "waybill_events" ADD COLUMN "sequence_number" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "waybill_events_waybill_number_sequence_number_key" ON "waybill_events"("waybill_number", "sequence_number");
