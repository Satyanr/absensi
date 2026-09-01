CREATE TYPE "UserRole" AS ENUM ('EMPLOYEE', 'OFFICER', 'LEADER', 'ADMIN');
CREATE TYPE "AttendanceEventType" AS ENUM ('CHECK_IN', 'CHECK_OUT');
CREATE TYPE "AttendanceSource" AS ENUM ('WEB_CAMERA', 'WEB_FILE_CAPTURE', 'ADMIN', 'LEGACY_IMPORT');
CREATE TYPE "AttendanceDayStatus" AS ENUM ('PRESENT', 'LEAVE', 'SICK', 'PERMISSION', 'ABSENT', 'HOLIDAY');
CREATE TYPE "CheckInStatus" AS ENUM ('ON_TIME', 'LATE', 'OVERTIME', 'LEGACY');
CREATE TYPE "CheckOutStatus" AS ENUM ('NORMAL', 'EARLY_LEAVE', 'OVERTIME', 'LEGACY');
CREATE TYPE "LeaveType" AS ENUM ('PERMISSION', 'SICK', 'ANNUAL_LEAVE');
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'LOGIN', 'LOGOUT', 'IMPORT', 'RESTORE');

CREATE TABLE "employees" (
  "id" TEXT PRIMARY KEY,
  "employee_code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "email" TEXT UNIQUE,
  "phone" TEXT,
  "join_date" DATE,
  "leave_eligible" BOOLEAN NOT NULL DEFAULT TRUE,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "legacy_id" BIGINT UNIQUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "users" (
  "id" TEXT PRIMARY KEY,
  "employee_id" TEXT,
  "email" TEXT UNIQUE,
  "username" TEXT UNIQUE,
  "password_hash" TEXT,
  "pin_hash" TEXT,
  "role" "UserRole" NOT NULL DEFAULT 'EMPLOYEE',
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "users_employee_id_idx" ON "users"("employee_id");

CREATE TABLE "sessions" (
  "id" TEXT PRIMARY KEY,
  "token_hash" TEXT NOT NULL UNIQUE,
  "user_id" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip_address" TEXT,
  "user_agent" TEXT,
  CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

CREATE TABLE "attendance_policies" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "effective_from" DATE NOT NULL,
  "effective_until" DATE,
  "work_start" TEXT NOT NULL,
  "late_after" TEXT NOT NULL,
  "work_end" TEXT NOT NULL,
  "overtime_after" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  "weekend_is_overtime" BOOLEAN NOT NULL DEFAULT TRUE,
  "saturday_working" BOOLEAN NOT NULL DEFAULT FALSE,
  "sunday_working" BOOLEAN NOT NULL DEFAULT FALSE,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "attendance_policies_effective_from_effective_until_idx" ON "attendance_policies"("effective_from", "effective_until");

CREATE TABLE "attendance_locations" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "latitude" DECIMAL(10,7) NOT NULL,
  "longitude" DECIMAL(10,7) NOT NULL,
  "radius_meters" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "attendance_days" (
  "id" TEXT PRIMARY KEY,
  "employee_id" TEXT NOT NULL,
  "attendance_date" DATE NOT NULL,
  "check_in_at" TIMESTAMP(3),
  "check_out_at" TIMESTAMP(3),
  "check_in_status" "CheckInStatus",
  "check_out_status" "CheckOutStatus",
  "late_minutes" INTEGER NOT NULL DEFAULT 0,
  "early_leave_minutes" INTEGER NOT NULL DEFAULT 0,
  "overtime_minutes" INTEGER NOT NULL DEFAULT 0,
  "status" "AttendanceDayStatus" NOT NULL DEFAULT 'PRESENT',
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_days_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "attendance_days_employee_id_attendance_date_key" UNIQUE ("employee_id", "attendance_date")
);
CREATE INDEX "attendance_days_attendance_date_idx" ON "attendance_days"("attendance_date");

CREATE TABLE "attachments" (
  "id" TEXT PRIMARY KEY,
  "storage_disk" TEXT NOT NULL DEFAULT 'local',
  "storage_path" TEXT NOT NULL UNIQUE,
  "original_filename" TEXT,
  "mime_type" TEXT NOT NULL,
  "file_size" BIGINT NOT NULL,
  "checksum" TEXT NOT NULL,
  "legacy_filename" TEXT UNIQUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "attendance_events" (
  "id" TEXT PRIMARY KEY,
  "attendance_day_id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "event_type" "AttendanceEventType" NOT NULL,
  "client_captured_at" TIMESTAMP(3),
  "server_received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "location_accuracy" DECIMAL(10,2),
  "location_captured_at" TIMESTAMP(3),
  "address" TEXT,
  "photo_id" TEXT,
  "source" "AttendanceSource" NOT NULL,
  "device_info" JSONB,
  "outside_geofence" BOOLEAN,
  "distance_meters" DECIMAL(10,2),
  "legacy_absensi_id" BIGINT UNIQUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_events_attendance_day_id_fkey" FOREIGN KEY ("attendance_day_id") REFERENCES "attendance_days"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "attendance_events_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "attendance_events_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "attendance_events_employee_id_server_received_at_idx" ON "attendance_events"("employee_id", "server_received_at");
CREATE INDEX "attendance_events_attendance_day_id_event_type_idx" ON "attendance_events"("attendance_day_id", "event_type");

CREATE TABLE "leave_requests" (
  "id" TEXT PRIMARY KEY,
  "employee_id" TEXT NOT NULL,
  "type" "LeaveType" NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
  "attachment_id" TEXT,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_at" TIMESTAMP(3),
  "approved_by" TEXT,
  "legacy_approval_id" BIGINT UNIQUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "leave_requests_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "leave_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "leave_requests_employee_id_start_date_end_date_idx" ON "leave_requests"("employee_id", "start_date", "end_date");
CREATE INDEX "leave_requests_status_idx" ON "leave_requests"("status");

CREATE TABLE "leave_balances" (
  "id" TEXT PRIMARY KEY,
  "employee_id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "entitlement" INTEGER NOT NULL DEFAULT 0,
  "carried_over" INTEGER NOT NULL DEFAULT 0,
  "used" INTEGER NOT NULL DEFAULT 0,
  "adjusted" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "leave_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "leave_balances_employee_id_year_key" UNIQUE ("employee_id", "year")
);

CREATE TABLE "audit_logs" (
  "id" TEXT PRIMARY KEY,
  "actor_id" TEXT,
  "action" "AuditAction" NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT,
  "before" JSONB,
  "after" JSONB,
  "reason" TEXT,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");
