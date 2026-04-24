# E2E Scenario Checklist

Date: 2026-04-18
Scope: frontend + backend + PostgreSQL consistency checks.

## 1. Prerequisites

- Docker daemon running (`docker compose up -d db`).
- `.env` has valid `DATABASE_URL` for `backend/prisma/schema.prisma`.
- Prisma client generated: `npm run db:generate`.
- Backend started: `npm run dev:backend`.
- Frontend started: `npm run dev:frontend`.

## 2. Current Status Snapshot

- Static TypeScript checks: PASS (`frontend` and `backend`).
- Frontend production build: PASS.
- Route-pattern coverage (UI -> API): PASS (no unmapped frontend endpoints).
- Runtime E2E execution: BLOCKED in current shell due missing Docker daemon / DB env.

## 3. P0 Scenarios (Must Pass)

1. Auth lifecycle (signup/login/me)
- UI: Auth page signup and login for buyer/seller/admin.
- API: `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`.
- DB: `AppUser` row exists and role matches session.
- Verify: role-based navigation (`adminPanel`, `profile`, protected routes).

2. Catalog browse and detail
- UI: Home list, filters, open product card.
- API: `GET /api/catalog/listings`, `GET /api/catalog/listings/:publicId`.
- DB: listing references valid category/item/seller.
- Verify: no 500, details page resolves deep-link id.

3. Cart -> checkout -> order create
- UI: add item, open cart, checkout, create order.
- API: `POST /api/profile/orders`, `GET /api/profile/orders/payment-status`.
- DB: `MarketOrder`, `MarketOrderItem`, `PlatformTransaction` are consistent.
- Verify: unavailable item handling removes stale cart ids.

4. Profile read/write
- UI: open profile, edit names/email/password.
- API: `GET /api/profile/me`, `PATCH /api/profile/me`.
- DB: `AppUser`/`SellerProfile` updates persisted and reloaded.

5. Addresses CRUD
- UI: create/update/delete/set default address.
- API: `GET/POST/PATCH/DELETE /api/profile/addresses*`, `POST /api/profile/addresses/:id/default`.
- DB: exactly one default address per user after each mutation.

6. Partner listing operations
- UI: create/edit/archive listing in partner cabinet.
- API: `GET/POST/PATCH/DELETE /api/partner/listings*`.
- DB: `MarketplaceListing`, `ListingImage`, `ListingAttribute` updated atomically.

7. Admin moderation baseline
- UI: admin login -> users/listings/complaints pages.
- API: `GET /api/admin/users`, `GET /api/admin/listings`, `GET /api/admin/complaints*`.
- DB: status changes recorded with audit log rows.

## 4. P1 Scenarios (High Value)

1. Wishlist consistency
- API: `POST/DELETE /api/profile/wishlist/:listingPublicId`, `GET /api/profile/wishlist`.
- Verify: UI badge and profile wishlist are synchronized.

2. Notifications read flow
- API: `GET /api/profile/notifications`, `PATCH /api/profile/notifications/mark-as-read`.
- Verify: unread counter and DB flags match.

3. Partner orders status and tracking
- API: `GET /api/partner/orders`, `PATCH /api/partner/orders/:publicId/status`, `PATCH /tracking`.
- Verify: status history rows are appended, not overwritten.

4. Complaint lifecycle
- API: complaint creation from listing, admin approve/reject.
- Verify: sanctions and audit entries are idempotent with admin idempotency keys.

## 5. P2 Scenarios (Hardening)

1. Failure injection
- invalid session role, missing headers/query ids, malformed payloads.
- expected: stable 4xx with useful errors, no silent 500.

2. Payment callback robustness
- test webhook replay for `POST /api/profile/payments/yookassa/webhook`.
- expected: idempotent updates, no duplicate state transitions.

3. Query performance sanity
- high-cardinality list endpoints (`admin complaints`, `catalog list`, `partner orders`).
- expected: response under target SLO and no N+1 query explosion.

## 6. DB Integrity Checklist (Per Run)

1. Foreign keys valid for new orders/listings/complaints.
2. Soft-deleted or inactive entities are filtered correctly in UI-facing endpoints.
3. Status enum transitions follow allowed graph (order, complaint, moderation, user status).
4. Audit records include actor id + action + entity id on each admin mutation.

## 7. Execution Commands

```bash
# static checks
node node_modules/typescript/bin/tsc -p backend/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit

# builds
node node_modules/typescript/bin/tsc -p backend/tsconfig.json
node node_modules/vite/bin/vite.js build --config frontend/vite.config.ts

# when docker is available
docker compose up -d db
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

## 8. Exit Criteria

- All P0 scenarios PASS.
- No P1 scenario has data-integrity regressions.
- No 500 errors in happy-path UI flows.
- DB integrity checklist PASS after scenario run.
