/*
  Warnings:

  - You are about to drop the column `project_id` on the `attendance_days` table. All the data in the column will be lost.
  - You are about to drop the column `project_id` on the `attendance_events` table. All the data in the column will be lost.
  - You are about to drop the `projects` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "attendance_days" DROP CONSTRAINT "attendance_days_project_id_fkey";

-- DropForeignKey
ALTER TABLE "attendance_events" DROP CONSTRAINT "attendance_events_project_id_fkey";

-- DropIndex
DROP INDEX "attendance_days_project_id_attendance_date_idx";

-- DropIndex
DROP INDEX "attendance_events_project_id_server_received_at_idx";

-- AlterTable
ALTER TABLE "attendance_days" DROP COLUMN "project_id";

-- AlterTable
ALTER TABLE "attendance_events" DROP COLUMN "project_id";

-- DropTable
DROP TABLE "projects";
