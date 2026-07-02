/*
  Warnings:

  - The primary key for the `drivers` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE "delivery_records" DROP CONSTRAINT "delivery_records_driver_id_fkey";

-- AlterTable
ALTER TABLE "delivery_records" ALTER COLUMN "driver_id" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "drivers" DROP CONSTRAINT "drivers_pkey",
ADD COLUMN     "pin_hash" VARCHAR(255),
ALTER COLUMN "id" SET DATA TYPE VARCHAR(100),
ADD CONSTRAINT "drivers_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "dispatchers" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatchers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dispatchers_email_key" ON "dispatchers"("email");

-- AddForeignKey
ALTER TABLE "delivery_records" ADD CONSTRAINT "delivery_records_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
