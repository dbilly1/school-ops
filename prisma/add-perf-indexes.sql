-- Performance pass: index every tenant table on its schoolId filter.
--
-- The tenant-scope middleware (security review C4) now appends
-- `WHERE schoolId = $1` to every query on these tables, but they had no index
-- on schoolId, so each list query became a sequential scan. Tables that already
-- have a @@unique([schoolId, ...]) are intentionally absent (their unique index
-- already covers the schoolId filter).
--
-- Index names match Prisma's `<table>_<col>_idx` convention so a later
-- `prisma db push` recognizes them as already-present and does not recreate.
--
-- CONCURRENTLY = no write lock on the table while the index builds. Postgres
-- forbids CONCURRENTLY inside a transaction block, so run this with psql against
-- the DIRECT_URL (port 5432), NOT through a pooled/transactional connection:
--
--   psql "$DIRECT_URL" -f prisma/add-perf-indexes.sql
--
-- IF NOT EXISTS makes the script safe to re-run.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "school_feature_grants_schoolId_idx"      ON "school_feature_grants" ("schoolId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "terms_schoolId_idx"                      ON "terms" ("schoolId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "school_calendar_events_schoolId_idx"     ON "school_calendar_events" ("schoolId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "grading_scales_schoolId_idx"             ON "grading_scales" ("schoolId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "timetable_slots_schoolId_idx"            ON "timetable_slots" ("schoolId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "admission_records_schoolId_idx"          ON "admission_records" ("schoolId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "student_class_assignments_schoolId_idx"  ON "student_class_assignments" ("schoolId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "student_attendance_records_schoolId_idx" ON "student_attendance_records" ("schoolId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "staff_attendance_records_schoolId_idx"   ON "staff_attendance_records" ("schoolId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "assessments_schoolId_idx"                ON "assessments" ("schoolId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "payments_schoolId_idx"                   ON "payments" ("schoolId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "payments_invoiceId_idx"                  ON "payments" ("invoiceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "feeding_configs_schoolId_idx"            ON "feeding_configs" ("schoolId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "feeding_payments_schoolId_idx"           ON "feeding_payments" ("schoolId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "feeding_payments_studentId_idx"          ON "feeding_payments" ("studentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "transport_routes_schoolId_idx"           ON "transport_routes" ("schoolId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "drivers_schoolId_idx"                    ON "drivers" ("schoolId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "transport_payments_schoolId_idx"         ON "transport_payments" ("schoolId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "transport_payments_studentId_idx"        ON "transport_payments" ("studentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "notices_schoolId_idx"                    ON "notices" ("schoolId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "announcements_schoolId_idx"              ON "announcements" ("schoolId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "notifications_schoolId_recipientId_idx"  ON "notifications" ("schoolId", "recipientId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "notification_event_logs_schoolId_idx"    ON "notification_event_logs" ("schoolId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_logs_schoolId_createdAt_idx"       ON "audit_logs" ("schoolId", "createdAt");
