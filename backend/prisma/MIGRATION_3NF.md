# 3NF Migration Runbook

This project already uses the normalized Prisma schema in `backend/prisma/schema.prisma`.
For existing databases that still run the legacy schema, use this runbook.

## Preconditions

1. Stop app writes (maintenance mode).
2. Create a DB backup (mandatory).
3. Run migration in staging first.
4. Ensure DB host/port is correct in `.env` (`localhost:5433` in this repo, to avoid collision with local PostgreSQL on `5432`).

## Steps

0. Current migration baseline:
   - Squashed migration folder: `backend/prisma/migrations/20260317201230_init_squashed`
   - Previous folders were merged into this one:
     - `20260310120000_init_squashed`
     - `20260311212000_order_delivery_tracking`
     - `20260317160000_user_address_without_city`

1. Run legacy-to-3NF SQL backfill:
   - `psql "$DATABASE_URL" -f scripts/migrate_legacy_to_3nf.sql`
2. Apply Prisma migrations (recommended, deterministic):
   - Local/dev: `npm run db:migrate`
   - CI/prod: `npx prisma migrate deploy --schema backend/prisma/schema.prisma`
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

- If your local DB was previously migrated by old folders
  (`20260305180721_normalize_city`, `20260305190350_remove_audit_log`,
  `20260305194727_remove_gamification_models`, `20260305200558_link_reviews_to_users`,
  `20260305203605_add_notifications_model`, `20260306193155`,
  `20260308200000_align_legacy_schema`, `20260310120000_init_squashed`,
  `20260311143000_complaint_sanctions`, `20260311212000_order_delivery_tracking`,
  `20260317160000_user_address_without_city`),
  sync Prisma history after starting PostgreSQL:
  - `DELETE FROM "_prisma_migrations" WHERE migration_name IN ('20260305180721_normalize_city','20260305190350_remove_audit_log','20260305194727_remove_gamification_models','20260305200558_link_reviews_to_users','20260305203605_add_notifications_model','20260306193155','20260308200000_align_legacy_schema','20260310120000_init_squashed','20260311143000_complaint_sanctions','20260311212000_order_delivery_tracking','20260317160000_user_address_without_city');`
  - `npx prisma migrate resolve --applied 20260317201230_init_squashed`
  - `npx prisma migrate status`
- New normalized entities:
  - `seller_profile`
  - `catalog_item`
  - `listing_image`
  - `listing_attribute`
- Additional consistency hardening:
  - enum-based statuses/roles/types
  - composite city uniqueness (`name + region`)
  - `audit_log` and `order_status_history`
  - DB-level `CHECK` constraints for prices/ratings/quantities
  - partial unique index for single default address per user
- Old denormalized listing columns should be treated as deprecated after cutover.
