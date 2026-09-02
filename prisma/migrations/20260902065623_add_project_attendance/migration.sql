-- CreateEnum
CREATE TYPE "AttendanceMode" AS ENUM ('OFFICE', 'PROJECT');

-- AlterTable
ALTER TABLE "attendance_days" ADD COLUMN     "attendance_mode" "AttendanceMode" NOT NULL DEFAULT 'OFFICE',
ADD COLUMN     "project_id" TEXT;

-- AlterTable
ALTER TABLE "attendance_events" ADD COLUMN     "attendance_mode" "AttendanceMode" NOT NULL DEFAULT 'OFFICE',
ADD COLUMN     "project_id" TEXT;

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE INDEX "attendance_days_project_id_attendance_date_idx" ON "attendance_days"("project_id", "attendance_date");

-- CreateIndex
CREATE INDEX "attendance_events_project_id_server_received_at_idx" ON "attendance_events"("project_id", "server_received_at");

-- AddForeignKey
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
