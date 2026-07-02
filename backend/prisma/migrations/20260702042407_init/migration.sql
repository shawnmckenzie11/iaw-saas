-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('DRAFT', 'PICKED_UP', 'DELIVERED', 'INVOICED', 'VOIDED');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('CAR', 'MINIVAN', 'TRUCK', 'CARGO_VAN', 'OTHER');

-- CreateEnum
CREATE TYPE "PriorityLevel" AS ENUM ('REGULAR', 'RUSH');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "QboSyncStatus" AS ENUM ('NOT_SYNCED', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "PricingTier" AS ENUM ('TIER_1', 'TIER_2', 'TIER_3');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "qbo_customer_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "billing_address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_rates" (
    "id" UUID NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "flat_rate" DECIMAL(10,2) NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_records" (
    "id" UUID NOT NULL,
    "client_side_uuid" UUID NOT NULL,
    "waybill_number" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'DRAFT',
    "sync_status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "sync_error" TEXT,
    "customer_id" UUID,
    "qbo_customer_id" TEXT,
    "driver_id" UUID,
    "vehicle_type" "VehicleType" NOT NULL DEFAULT 'CAR',
    "parcel_description" TEXT NOT NULL,
    "parcel_quantity" INTEGER NOT NULL DEFAULT 1,
    "parcel_weight_lbs" DECIMAL(6,2),
    "parcel_weight_class" TEXT,
    "parcel_dimensions_inch" TEXT,
    "pickup_location_name" TEXT NOT NULL,
    "pickup_address" TEXT NOT NULL,
    "pickup_contact_name" TEXT,
    "pickup_contact_phone" TEXT,
    "pickup_latitude" DECIMAL(9,6),
    "pickup_longitude" DECIMAL(9,6),
    "dropoff_destination_name" TEXT NOT NULL,
    "dropoff_address" TEXT NOT NULL,
    "dropoff_contact_name" TEXT,
    "dropoff_contact_phone" TEXT,
    "dropoff_latitude" DECIMAL(9,6),
    "dropoff_longitude" DECIMAL(9,6),
    "priority" "PriorityLevel" NOT NULL DEFAULT 'REGULAR',
    "business_or_residential" TEXT,
    "additional_comments" TEXT,
    "requested_pickup_time" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "signed_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "signature_name" TEXT,
    "signature_image_url" TEXT,
    "signature_hash" TEXT,
    "signature_consent_text" TEXT,
    "signature_ip_address" TEXT,
    "signature_gps_latitude" DECIMAL(9,6),
    "signature_gps_longitude" DECIMAL(9,6),
    "proof_photo_url" TEXT,
    "pricing_tier" "PricingTier" NOT NULL DEFAULT 'TIER_2',
    "applied_route_rate_id" UUID,
    "pricing_is_manually_adjusted" BOOLEAN NOT NULL DEFAULT false,
    "pricing_override_reason" TEXT,
    "pricing_base_rate" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "pricing_distance_miles" DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    "pricing_distance_rate" DECIMAL(6,2) NOT NULL DEFAULT 0.00,
    "pricing_fuel_surcharge" DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    "pricing_priority_surcharge" DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    "pricing_after_hours_surcharge" DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    "pricing_extra_weight_surcharge" DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    "pricing_total_cost" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "qbo_sync_status" "QboSyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
    "qbo_invoice_id" TEXT,
    "qbo_journal_entry_id" TEXT,
    "qbo_sync_error" TEXT,
    "qbo_posted_at" TIMESTAMP(3),

    CONSTRAINT "delivery_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waybill_events" (
    "id" UUID NOT NULL,
    "client_side_uuid" UUID NOT NULL,
    "waybill_number" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waybill_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_qbo_customer_id_key" ON "customers"("qbo_customer_id");

-- CreateIndex
CREATE INDEX "idx_route_rates_lookup" ON "route_rates"("origin", "destination", "effective_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_records_client_side_uuid_key" ON "delivery_records"("client_side_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_records_waybill_number_key" ON "delivery_records"("waybill_number");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_records_qbo_invoice_id_key" ON "delivery_records"("qbo_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_records_qbo_journal_entry_id_key" ON "delivery_records"("qbo_journal_entry_id");

-- CreateIndex
CREATE INDEX "delivery_records_client_side_uuid_idx" ON "delivery_records"("client_side_uuid");

-- CreateIndex
CREATE INDEX "delivery_records_waybill_number_idx" ON "delivery_records"("waybill_number");

-- CreateIndex
CREATE INDEX "delivery_records_status_idx" ON "delivery_records"("status");

-- CreateIndex
CREATE INDEX "delivery_records_customer_id_idx" ON "delivery_records"("customer_id");

-- CreateIndex
CREATE INDEX "delivery_records_driver_id_idx" ON "delivery_records"("driver_id");

-- CreateIndex
CREATE INDEX "waybill_events_waybill_number_idx" ON "waybill_events"("waybill_number");

-- CreateIndex
CREATE INDEX "waybill_events_client_side_uuid_idx" ON "waybill_events"("client_side_uuid");

-- AddForeignKey
ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_applied_route_rate_id_fkey" FOREIGN KEY ("applied_route_rate_id") REFERENCES "route_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
