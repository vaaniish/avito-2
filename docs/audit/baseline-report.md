# Baseline Report

Date: 2026-04-18  
Scope: full repository baseline (frontend + backend + Prisma schema)

## 1. Snapshot

- Files in `backend/src` + `frontend/src`: `73`
- Total LOC (`backend/src` + `frontend/src`): `38557`
- Backend API modules mounted in `app.ts`:
  - `/api/auth`
  - `/api/catalog`
  - `/api/profile`
  - `/api/partner`
  - `/api/admin`
- Route handlers in backend modules: `64` (+ `/health`)

## 2. Largest Files (Hotspots)

1. `frontend/src/index.css` - 5532
2. `frontend/src/components/pages/ProfilePage.tsx` - 4082
3. `backend/src/modules/profile/profile.routes.ts` - 4026
4. `backend/src/modules/admin/admin.complaints.routes.ts` - 2076
5. `backend/src/modules/partner/partner.routes.ts` - 1792
6. `frontend/src/components/ProductDetail.tsx` - 1437
7. `frontend/src/App.tsx` - 1306
8. `backend/src/modules/catalog/catalog.routes.ts` - 1297
9. `backend/src/modules/admin/admin.routes.ts` - 1178
10. `frontend/src/components/CheckoutPage.tsx` - 1020

## 3. Build and Static Checks

Executed:

- `tsc -p backend/tsconfig.json --noEmit --noUnusedLocals --noUnusedParameters` -> pass
- `tsc -p frontend/tsconfig.json --noEmit` -> pass
- `madge --circular backend/src frontend/src` -> no circular dependencies
- `jscpd backend/src frontend/src --min-lines 20 --min-tokens 80` -> 2 clones
- `ts-prune` backend/frontend -> no actionable dead exports (mostly local-only flags)

## 4. Dependency Health Baseline

- `npm ls --depth=0` reports:
  - `@types/node` version mismatch in installed tree vs `package.json` range
  - `@types/react-dom` present in local `node_modules` as extraneous (not in `package.json`)
- `depcheck` reports `pg` / `@types/pg` as unused, but this is likely false-positive because Prisma uses `@prisma/adapter-pg` which depends on `pg` runtime.

## 5. Working Tree State (Important)

Repository is currently **dirty** (pending modifications and file deletions from previous refactor/cleanup rounds).  
Before irreversible refactors, keep changes scoped in small batches and verify after each batch.

## 6. Preliminary Risk Areas

1. Monolithic backend domain files still large:
   - `profile.routes.ts` (~4k LOC)
   - `admin.complaints.routes.ts` (~2k LOC)
2. Monolithic frontend feature pages:
   - `ProfilePage.tsx` (~4k LOC)
   - `App.tsx` (~1.3k LOC)
   - `CheckoutPage.tsx` (~1k LOC)
3. No automated test suites configured in npm scripts (`unit`, `integration`, `e2e` missing).
4. Session model uses `x-user-id`/query driven identity lookup (good for sandbox/demo, high risk for production security posture without auth tokens/signatures).

