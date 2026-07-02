-- AlterTable
ALTER TABLE "delivery_records" ADD COLUMN "priority_label" VARCHAR(10),
ADD COLUMN "driver_queue_rank" INTEGER;

-- CreateIndex
CREATE INDEX "delivery_records_driver_id_driver_queue_rank_idx" ON "delivery_records"("driver_id", "driver_queue_rank");
