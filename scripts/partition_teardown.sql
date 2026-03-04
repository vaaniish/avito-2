-- scripts/partition_teardown.sql
-- Removes partitioning from the AuditLog table and restores its original schema.

-- Exit on any error
\set ON_ERROR_STOP on

BEGIN;

-- 1. Create a new, temporary, non-partitioned table to hold the data.
CREATE TABLE "AuditLog_temp" (
    "id" SERIAL PRIMARY KEY,
    "public_id" TEXT NOT NULL UNIQUE,
    "timestamp" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "admin_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL
);

-- 2. Copy data from the partitioned table into the temporary table.
INSERT INTO "AuditLog_temp" ("id", "public_id", "timestamp", "admin_id", "action", "target_id", "target_type", "details", "ip_address")
SELECT "id", "public_id", "timestamp", "admin_id", "action", "target_id", "target_type", "details", "ip_address" FROM "AuditLog";

-- 3. Drop the partitioned table completely.
DROP TABLE "AuditLog";

-- 4. Rename the temporary table to the final name.
ALTER TABLE "AuditLog_temp" RENAME TO "AuditLog";

-- 5. Add the foreign key constraint.
ALTER TABLE "AuditLog"
    ADD CONSTRAINT "AuditLog_admin_id_fkey"
    FOREIGN KEY ("admin_id") REFERENCES "AppUser"("id") ON DELETE CASCADE;

-- 6. Reset the sequence for the id column.
-- The SERIAL type in the new table creation should handle this,
-- but we'll explicitly set the sequence to the max value to be safe.
SELECT setval(pg_get_serial_sequence('"AuditLog"', 'id'), (SELECT MAX("id") FROM "AuditLog") + 1);

COMMIT;
