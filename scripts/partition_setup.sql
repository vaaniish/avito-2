-- scripts/partition_setup.sql
-- Sets up range partitioning on the AuditLog table based on the 'timestamp' column.
-- WARNING: This script changes the primary key of the AuditLog table to ("id", "timestamp").
-- This is a requirement for partitioning in PostgreSQL and may affect how Prisma interacts with this table.

-- Exit on any error
\set ON_ERROR_STOP on

BEGIN;

-- 1. Rename the existing AuditLog table to avoid conflicts.
ALTER TABLE "AuditLog" RENAME TO "AuditLog_old";

-- 2. Create the new partitioned table with the final name "AuditLog".
CREATE TABLE "AuditLog" (
    "id" INTEGER NOT NULL,
    "public_id" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(3) NOT NULL,
    "admin_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    PRIMARY KEY ("id", "timestamp")
) PARTITION BY RANGE ("timestamp");

-- 3. Create partitions for different time ranges.
-- Example partitions for March and April 2026.
CREATE TABLE "AuditLog_y2026m03" PARTITION OF "AuditLog"
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE "AuditLog_y2026m04" PARTITION OF "AuditLog"
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- A default partition is crucial to catch data that doesn't fit into any other partition.
CREATE TABLE "AuditLog_default" PARTITION OF "AuditLog" DEFAULT;

-- 4. Create a unique index on public_id for each partition.
CREATE UNIQUE INDEX ON "AuditLog_y2026m03" ("public_id");
CREATE UNIQUE INDEX ON "AuditLog_y2026m04" ("public_id");
CREATE UNIQUE INDEX ON "AuditLog_default" ("public_id");


-- 5. Copy data from the old table into the new partitioned table.
INSERT INTO "AuditLog" ("id", "public_id", "timestamp", "admin_id", "action", "target_id", "target_type", "details", "ip_address")
SELECT "id", "public_id", "timestamp", "admin_id", "action", "target_id", "target_type", "details", "ip_address" FROM "AuditLog_old";

-- 6. Add the foreign key constraint to the parent partitioned table.
ALTER TABLE "AuditLog"
    ADD CONSTRAINT "AuditLog_admin_id_fkey"
    FOREIGN KEY ("admin_id") REFERENCES "AppUser"("id") ON DELETE CASCADE;

-- 7. Re-create the auto-incrementing 'id' sequence.
CREATE SEQUENCE "AuditLog_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
-- Set the sequence's start value to the max id from the copied data.
SELECT setval('"AuditLog_id_seq"', (SELECT MAX("id") FROM "AuditLog") + 1);

-- Link the sequence to the 'id' column to make it auto-incrementing.
ALTER TABLE "AuditLog" ALTER COLUMN "id" SET DEFAULT nextval('"AuditLog_id_seq"');
ALTER SEQUENCE "AuditLog_id_seq" OWNED BY "AuditLog"."id";


-- 8. Drop the old table.
DROP TABLE "AuditLog_old";

COMMIT;
