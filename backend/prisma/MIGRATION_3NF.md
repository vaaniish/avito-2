# 3NF Migration Runbook

This project already uses the normalized Prisma schema in `backend/prisma/schema.prisma`.
For existing databases that still run the legacy schema, use this runbook.

## Preconditions

1. Stop app writes (maintenance mode).
2. Create a DB backup (mandatory).
3. Run migration in staging first.
4. Ensure DB host/port is correct in `.env` (`localhost:5433` in this repo, to avoid collision with local PostgreSQL on `5432`).

## Steps

1. Run legacy-to-3NF SQL backfill:
   - `psql "$DATABASE_URL" -f scripts/migrate_legacy_to_3nf.sql`
2. Apply new Prisma schema:
   - `npm run db:push`
3. Generate Prisma client:
   - `npm run db:generate`
4. Run verification queries:
   - `psql "$DATABASE_URL" -f scripts/verify_3nf.sql`
5. Start backend and smoke-check:
   - `npm run dev:backend`
6. If everything is green, optionally drop legacy columns:
   - Uncomment cleanup block in `scripts/migrate_legacy_to_3nf.sql`
   - Re-run only the cleanup section.

## Rollback

Rollback is restore-from-backup. This migration changes structure and data shape.

## Notes

- New normalized entities:
  - `seller_profile`
  - `catalog_item`
  - `listing_image`
  - `listing_attribute`
- Old denormalized listing columns should be treated as deprecated after cutover.
