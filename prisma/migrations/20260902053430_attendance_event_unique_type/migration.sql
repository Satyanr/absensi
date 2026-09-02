/*
  Warnings:

  - A unique constraint covering the columns `[attendance_day_id,event_type]` on the table `attendance_events` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "attendance_events_attendance_day_id_event_type_key" ON "attendance_events"("attendance_day_id", "event_type");
