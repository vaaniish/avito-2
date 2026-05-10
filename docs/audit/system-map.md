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
| `backend/src/modules/partner/partner.routes.ts` | `/api/partner` | 18 | aggregator |
| `backend/src/modules/partner/partner.listings.routes.ts` | `/api/partner` | 3340 | 10 |
| `backend/src/modules/partner/partner.finance.routes.ts` | `/api/partner` | 299 | 1 |
| `backend/src/modules/partner/partner.payout.routes.ts` | `/api/partner` | 208 | 2 |
| `backend/src/modules/partner/partner.questions.routes.ts` | `/api/partner` | 174 | 2 |
| `backend/src/modules/partner/partner.orders.routes.ts` | `/api/partner` | 520 | 3 |
| `backend/src/modules/partner/partner.drafts.routes.ts` | `/api/partner` | 236 | 4 |
| `backend/src/modules/admin/admin.routes.ts` | `/api/admin` | 25 | aggregator |
| `backend/src/modules/admin/admin.audit.routes.ts` | `/api/admin` | 154 | 1 |
| `backend/src/modules/admin/admin.catalog.routes.ts` | `/api/admin` | 1020 | 16 |
| `backend/src/modules/admin/admin.catalog-suggestions.routes.ts` | `/api/admin` | 622 | 3 |
| `backend/src/modules/admin/admin.catalog.shared.ts` | `/api/admin` | 221 | shared helpers |
| `backend/src/modules/admin/admin.commissions.routes.ts` | `/api/admin` | 255 | 3 |
| `backend/src/modules/admin/admin.finance.routes.ts` | `/api/admin` | 476 | 2 |
| `backend/src/modules/admin/admin.listings.routes.ts` | `/api/admin` | 546 | 4 |
| `backend/src/modules/admin/admin.partnership.routes.ts` | `/api/admin` | 714 | 6 |
| `backend/src/modules/admin/admin.users.routes.ts` | `/api/admin` | 345 | 2 |
| `backend/src/modules/admin/admin.complaints.routes.ts` | `/api/admin` | 2069 | 43 |

## 4. Frontend Hotspots

| File | LOC | Why it is hard to read |
|---|---:|---|
| `frontend/src/components/pages/PartnerListingsPage.tsx` | 700 | The page is now mostly an orchestration shell; collection CRUD, inline edit, save flow, catalog loading/reset, address flow, drafts, title suggestions, mappers, API helpers, and UI sections now live in sibling modules |
| `frontend/src/components/admin/CatalogSuggestionsPage.tsx` | 289 | Suggestions workflow and catalog editor now share a thin page shell; modal UI lives in `catalog-suggestions.modals.tsx`, data/reference/actions live in `catalog-suggestions.hooks.ts`, and list/tree render sections live in `catalog-suggestions.sections.tsx` |
| `frontend/src/components/ProductDetail.tsx` | 1232 | Product detail UI, questions, wishlist, complaint/review actions still share one component, but API/types/constants/utils/rating UI now live in sibling modules |
| `frontend/src/components/admin/ComplaintsPage.tsx` | 1114 | Admin moderation data loading, filters, detail views, sanctions, and actions mixed together |
| `frontend/src/components/CheckoutPage.tsx` | 828 | Policy, delivery points, address suggest, payment polling, and order submission still share one page, but endpoint calls now live in `checkout.api.ts` |
| `frontend/src/components/pages/ProfilePage.tsx` | 805 | Profile orchestration still owns address, policy, review, wishlist, and partnership flows |

`SellersPage` has been converted into a feature-style module under `frontend/src/components/admin/sellers/` and should be used as the first small template for future admin decompositions.

`PartnerListingsPage` now has a feature-style split:
`partner-listings.types.ts`, `partner-listings.constants.ts`,
`partner-listings.api.ts`, `partner-listings.components.tsx`,
`partner-listings.utils.ts`, `partner-listings.submit.ts`,
`partner-listings.create-flow.tsx`, `partner-listings.list.tsx`, and
`partner-listings.mappers.ts`. The old hook monolith is now split into
`partner-listings.collection.hooks.ts`,
`partner-listings.inline-edit.hooks.ts`,
`partner-listings.save.hooks.ts`,
`partner-listings.catalog.hooks.ts`,
`partner-listings.address.hooks.ts`, and
`partner-listings.drafts.hooks.ts`, with `partner-listings.hooks.ts` acting as
a barrel export. Listing collection loading, notification refresh, delete
confirmation state, delete action, and status toggle live in
`usePartnerListingsCollection`. Inline edit state, address suggestions, image
upload validation, image removal, optimistic update, validation, and save API
flow live in `usePartnerListingInlineEditFlow`. Create/edit validation,
snapshotting, image moderation, payload construction, create/update API calls,
draft cleanup, and list refresh live in `usePartnerListingSaveFlow`.
Category loading, invalid catalog-path reset, characteristic schema lookup, and
catalog-reference field loading now live in catalog hooks. Draft autosave and
title suggestions live in dedicated draft hooks. The local fallback
catalog/schema has been removed; category and characteristic schemas now come
from backend catalog data. The next useful split is no longer inside this page;
the biggest remaining debt is `partner.routes.ts`.

`CatalogSuggestionsPage` now has the next feature split:
`catalog-suggestions.types.ts`, `catalog-suggestions.api.ts`,
`catalog-suggestions.components.tsx`, `catalog-suggestions.constants.ts`,
`catalog-suggestions.utils.ts`, `catalog-suggestions.modals.tsx`,
`catalog-suggestions.hooks.ts`, and `catalog-suggestions.sections.tsx`.
Review, approval, edit, delete, and catalog-reference modal UI now live in the
modal module. Suggestions loading, catalog tree loading, reference-editor
loading, approval/edit/delete/reorder actions, and page-level editor state now
live in dedicated hooks. Suggestion list and catalog tree render JSX now live in
dedicated section components. The next useful split is no longer inside this
page; the next frontend hotspot is `ProductDetail`.

`ProductDetail` now has the first feature split:
`product-detail.types.ts`, `product-detail.api.ts`, `product-detail.constants.ts`,
`product-detail.utils.ts`, and `product-detail.components.tsx`.
The next useful split is moving the questions/reviews/complaint modal blocks into components.

`CheckoutPage` now uses `checkout.api.ts` for checkout policy, delivery points,
payment status, listing availability, and order creation requests.
The next useful split is moving payment polling and Yandex suggest setup into hooks.

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
| Partner listings UI | Completed | Page is now an orchestration shell; catalog/drafts/address/create/edit/list concerns moved into typed sibling modules and thematic hooks |
| Partner routes backend | Completed | Finance analytics, listings, payout-profile, questions, orders, and drafts are split into dedicated route modules; `partner.routes.ts` is now an aggregator while preserving `/api/partner/*` |
| Admin routes backend | Completed | Finance, audit, catalog, catalog suggestions, commissions, listings moderation, partnership/KYC/payout, and users are split into dedicated route modules; `admin.routes.ts` is now an aggregator while preserving `/api/admin/*` |
| Catalog suggestions UI | Completed | Page is now a thin shell; modal UI, data/reference/action hooks, and tree/list render sections are split into dedicated modules |
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
