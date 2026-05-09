# System Map

Date: 2026-05-10

This map is the working orientation document for the decomposition effort. It should be updated whenever a large route/page is split so the project structure stays understandable without opening every file.

## 1. Runtime Topology

- Frontend: Vite 7 + React 19 (`frontend/src`)
- Backend: Express 5 + Prisma 7 (`backend/src`)
- DB: PostgreSQL via Prisma schema (`backend/prisma/schema.prisma`)
- Shared runtime helpers: API/session/search/routing in `frontend/src/lib`, Prisma/session/observability in `backend/src/lib`

## 2. Current Refactor Baseline

The working tree already contains many user changes and generated-artifact deletions. Refactors must avoid reverting unrelated changes.

| Area | Current state | Refactor rule |
|---|---|---|
| `node_modules`, `dist`, `report_assets`, `test-results` | Dirty/generated or deleted artifacts are present in git status | Do not mix cleanup with application refactors |
| `frontend/src`, `backend/src`, `scripts/tests` | Application code target for decomposition | Preserve behavior and public contracts |
| `data/catalog-reference` | Large source data JSON set | Treat as data, not code decomposition target |

## 3. Backend Route Map

| Module file | Mounted prefix | LOC | Route handlers |
|---|---|---:|---:|
| `backend/src/modules/auth/auth.routes.ts` | `/api/auth` | 240 | 3 |
| `backend/src/modules/public/public.routes.ts` | `/api/public` | 40 | 1 |
| `backend/src/modules/catalog/catalog.routes.ts` | `/api/catalog` | 1617 | 24 |
| `backend/src/modules/profile/profile.routes.ts` | `/api/profile` | 108 | aggregator |
| `backend/src/modules/profile/profile.account.routes.ts` | `/api/profile` | 399 | 8 |
| `backend/src/modules/profile/profile.address.routes.ts` | `/api/profile` | 469 | 8 |
| `backend/src/modules/profile/profile.engagement.routes.ts` | `/api/profile` | 780 | 6 |
| `backend/src/modules/profile/profile.orders.routes.ts` | `/api/profile` | 1614 | 7 |
| `backend/src/modules/profile/profile.user.routes.ts` | `/api/profile` | 331 | 2 |
| `backend/src/modules/partner/partner.routes.ts` | `/api/partner` | 4678 | 35 |
| `backend/src/modules/admin/admin.routes.ts` | `/api/admin` | 4130 | 65 |
| `backend/src/modules/admin/admin.complaints.routes.ts` | `/api/admin` | 2069 | 43 |

## 4. Frontend Hotspots

| File | LOC | Why it is hard to read |
|---|---:|---|
| `frontend/src/components/pages/PartnerListingsPage.tsx` | 5522 | API, catalog schema logic, drafts, address flow, create/edit UI, image moderation, and list rendering are all in one module |
| `frontend/src/components/admin/CatalogSuggestionsPage.tsx` | 2463 | Suggestions workflow and catalog editor/reference editor are coupled |
| `frontend/src/components/ProductDetail.tsx` | 1549 | Product detail UI, questions, views, wishlist, complaint/review actions mixed together |
| `frontend/src/components/admin/ComplaintsPage.tsx` | 1114 | Admin moderation data loading, filters, detail views, sanctions, and actions mixed together |
| `frontend/src/components/CheckoutPage.tsx` | 864 | Policy, delivery points, address suggest, payment polling, and order submission mixed together |
| `frontend/src/components/pages/ProfilePage.tsx` | 805 | Profile orchestration still owns address, policy, review, wishlist, and partnership flows |

`SellersPage` has been converted into a feature-style module under `frontend/src/components/admin/sellers/` and should be used as the first small template for future admin decompositions.

## 5. Feature Module Shape

Use this shape when splitting large files:

- `*.types.ts` / `*.models.ts`: DTO and domain types.
- `*.constants.ts`: stable filter/tab/status constants.
- `*.utils.ts`: pure formatting, parsing, matching, and transformation helpers.
- `*.api.ts`: typed frontend API calls or backend external-service calls.
- `*.hooks.ts`: React state/effects and data loading.
- `components/` or named component files: presentational UI pieces.
- Backend routes: keep route files as orchestration; move validation to `*.validators.ts`, business decisions to `*.service.ts`, and response shaping to `*.mapper.ts`.

## 6. Decomposition Progress

| Area | Status | Notes |
|---|---|---|
| Admin sellers UI | Started | Types, constants, API, utilities, status badge, detail primitives, and review modal split out |
| Shared finance backend | Started | Admin/partner finance constants, parsers, period keys, status helpers, and settlement bucket logic moved to `backend/src/modules/finance/finance.shared.ts` |
| Partner listings UI | Pending | Highest frontend priority; split catalog/drafts/address/create/edit/list concerns |
| Partner routes backend | Pending | Highest backend priority; split listings/drafts/payout/finance/orders/questions while preserving `/api/partner/*` |
| Admin routes backend | Pending | Split catalog, finance, partnership/KYC/payout, listings moderation, users, commissions, audit |
| Catalog suggestions UI | Pending | Split suggestion queue from catalog/reference editor |
| App root | Pending | Separate session/cart/catalog/routing state from render switch |

## 7. Contract Rules

- Do not change route paths, request payloads, response shapes, Prisma schema, or frontend URL paths during refactor-only steps.
- If a real improvement requires a breaking API/UI change, stop and describe the exact endpoint or flow before editing it.
- Prefer small, buildable slices: split one concern, compile, then continue.

## 8. Validation Gates

Run after each major slice:

- `npm run build:backend`
- `npm run build:frontend`
- `npm run test:unit`
- `npm run test:integration`

Run UI/e2e checks for flow-level changes:

- `npm run test:e2e:smoke`
- Manual browser smoke for admin sellers, partner listings, checkout, and profile when those views are touched.
