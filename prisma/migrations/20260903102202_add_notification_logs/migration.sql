-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LEAVE_SUBMITTED', 'LEAVE_APPROVED', 'LEAVE_REJECTED', 'TEST_EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "type" "NotificationType" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "last_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_logs_status_created_at_idx" ON "notification_logs"("status", "created_at");

-- CreateIndex
CREATE INDEX "notification_logs_entity_type_entity_id_idx" ON "notification_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "notification_logs_recipient_created_at_idx" ON "notification_logs"("recipient", "created_at");
