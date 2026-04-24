# Decision Log (2026-04-19)

## D-001: Validate Scenario Matrix CSV Before Automation

- Decision: Fixed malformed CSV quoting in `docs/audit/test-scenarios.csv`.
- Why: Non-valid CSV breaks test tooling and creates false negatives in QA pipelines.
- Practice basis:
  - RFC 4180-style CSV interoperability expectations.
  - "Fail fast on broken inputs" reliability principle.
  - `standards.md` section 7 (validation gates).

## D-002: Align Smoke DB Source With Runtime DB

- Decision: Updated `scripts/e2e-smoke.mjs` to load `.env` via `dotenv/config` and changed fallback DB from `avito-db-ci` to `avito-db-dev`.
- Why: API calls were hitting one DB while smoke assertions were reading another DB, producing false failures (`audit log did not grow`).
- Practice basis:
  - Twelve-Factor App: config from environment (single source of truth).
  - Deterministic test environments (same config for app + verification).
  - `standards.md` sections 1 and 7.

## D-003: Harden Frontend API Error Semantics

- Decision: Improved `frontend/src/lib/api.ts`:
  - Added request timeout (`VITE_API_TIMEOUT_MS`, default 12000ms).
  - Added explicit timeout error message.
  - Stopped rewriting login/signup 401 responses into "session expired".
  - Kept session-clearing behavior for non-auth 401 responses.
- Why: Users were seeing poor/ambiguous auth failure behavior; network hangs could appear as "silent" UI.
- Practice basis:
  - OWASP ASVS: clear auth error handling without leaking sensitive details.
  - HTTP semantics: preserve endpoint-specific error meaning.
  - `standards.md` sections 5 and 6.

## D-004: Low-Risk Cleanup First

- Decision: Removed unused default `React` imports in frontend files and deleted obvious dead locals in:
  - `CartPage.tsx` (`currentQuantity` dead parameter path)
  - `Hero.tsx` (unused local handler)
  - `YandexMapPicker.tsx` (unused `locationHint` state)
- Why: Reduces noise and review surface without changing API contracts.
- Practice basis:
  - Keep modules focused and readable.
  - Remove dead code only after call-site verification.
  - `standards.md` sections 3 and 6.

## D-005: Single Navigation Authority After Auth Success

- Decision: Removed `onBack()` calls after successful auth in `frontend/src/components/pages/AuthPage.tsx`.
- Why: `App` already decides post-login route (`profile`/`adminPanel`). Calling `onBack` in child component overrode that decision and caused confusing UX.
- Practice basis:
  - React architecture: keep navigation state ownership in one place.
  - Predictable state transitions and reduced side effects.
  - `standards.md` sections 2 and 6.

## D-006: First Backend Decomposition Slice (Profile Account Endpoints)

- Decision: extracted `wishlist + notifications` handlers from `profile.routes.ts` into:
  - `backend/src/modules/profile/profile.account.routes.ts`
  - mounted via `profileRouter.use(profileAccountRouter)` without URL changes.
- Why: start with low-coupling routes to reduce risk while shrinking monolith router file.
- Contract impact: none (`/api/profile/wishlist*`, `/api/profile/notifications*` unchanged).
- Practice basis:
  - Single responsibility and route composition (Express router modules).
  - Stable contracts first (`standards.md` section 2.1).
  - Incremental refactor with runtime gate (compile + smoke after each slice).

## D-007: Second Backend Decomposition Slice (Profile Engagement Endpoints)

- Decision: extracted engagement endpoints into:
  - `backend/src/modules/profile/profile.engagement.routes.ts`
  - mounted via `profileRouter.use(profileEngagementRouter)`.
- Endpoints moved (unchanged contracts):
  - `POST /partnership-requests`
  - `POST /listings/:listingPublicId/review`
- Why: these handlers are domain-cohesive (user engagement/trust actions) and weakly coupled to other profile flows.
- Practice basis:
  - Domain-driven module boundaries and reduced route-file blast radius.
  - Incremental refactor with compile + scenario smoke gate.

## D-008: Normalize External Provider Timeout Semantics

- Decision: added `UND_ERR_CONNECT_TIMEOUT` to retryable network classifier in `profile` payment integration path.
- Why: provider connect timeouts surfaced as generic `500`; now they follow external-dependency semantics (`502` path with provider message).
- Practice basis:
  - RFC 9110 gateway/dependency failure semantics.
  - Reliability patterns for third-party API integration.

## D-009: Third Backend Decomposition Slice (Profile Orders Domain)

- Decision: extracted orders-related endpoints into factory router:
  - `backend/src/modules/profile/profile.orders.routes.ts`
  - mounted from `profile.routes.ts` via `createProfileOrdersRouter({...deps})`.
- Endpoints moved (contracts unchanged):
  - `POST /payments/yookassa/webhook`
  - `GET /orders/payment-status`
  - `POST /orders`
  - `GET /orders`
- Why this pattern: orders flow depends on many existing helpers/integrations (YooKassa, Yandex, address builders). Factory injection allowed safe extraction without risky helper relocation in one shot.
- Practice basis:
  - Dependency injection for modularization with minimal behavioral drift.
  - Incremental refactor with strict runtime gates.

## D-010: Fourth Backend Decomposition Slice (Profile Address Domain)

- Decision: extracted address/location endpoints into factory router:
  - `backend/src/modules/profile/profile.address.routes.ts`
  - mounted via `createProfileAddressRouter({...deps})`.
- Endpoints moved (contracts unchanged):
  - `GET /addresses`
  - `POST /addresses`
  - `PATCH /addresses/:id`
  - `DELETE /addresses/:id`
  - `POST /addresses/:id/default`
  - `GET /location/suggest`
  - `GET /delivery-points`
- Why this pattern: these handlers depend on existing in-file helpers (`mapUserAddressToDto`, geosuggest/delivery utilities). DI extraction minimizes migration risk while still shrinking monolith routes.
- Practice basis:
  - Stable contracts first.
  - Router composition + dependency injection.
  - Compile + smoke gate after each slice.

## D-011: Fifth Backend Decomposition Slice (Profile User Domain)

- Decision: extracted profile user endpoints into factory router:
  - `backend/src/modules/profile/profile.user.routes.ts`
  - mounted via `createProfileUserRouter({...deps})`.
- Endpoints moved (contracts unchanged):
  - `GET /me`
  - `PATCH /me`
- Why this pattern: `/me` combines multiple relation-heavy reads and DTO mapping; extraction isolates profile-user behavior and reduces monolith route complexity.
- Practice basis:
  - Domain-focused routing boundaries.
  - Stable external contracts with internal modular evolution.
  - Mandatory compile + smoke gate post-refactor.

## D-012: Immediate Helper/Import Hygiene Pass

- Decision: after extraction, removed now-unused types/imports from `profile.routes.ts` and tightened type contract in `profile.user.routes.ts` for DTO spread safety.
- Why: prevents latent type drift and keeps helper surface intentionally minimal.
- Practice basis:
  - Type safety first.
  - Dead-code/unused-symbol cleanup after modular moves.

## D-013: Centralize Profile Shared Helpers Into Dedicated Module

- Decision: moved shared address/profile helpers from `profile.routes.ts` into:
  - `backend/src/modules/profile/profile.shared.ts`
  - functions: `normalizeTextField`, `parseLegacyBuilding`, `buildAddressFullAddress`, `mapUserAddressToDto`, `extractPrimaryCityFromAddresses`.
- Additional cleanup:
  - removed duplicated `extractPrimaryCityFromAddresses` from `profile.account.routes.ts` and reused shared helper.
  - tightened DTO typings in `profile.user.routes.ts` and `profile.address.routes.ts` with `ProfileAddressDto`.
- Why: helpers were cross-domain utilities used by multiple routers; keeping them in aggregator file increased coupling and made future extraction riskier.
- Practice basis:
  - Single-responsibility module boundaries.
  - DRY for cross-router helper logic.
  - Type-contract consistency across modules.

## D-014: Extract Delivery/Yandex/RussianPost Engine From Profile Aggregator

- Decision: moved delivery and logistics helper stack out of `profile.routes.ts` into:
  - `backend/src/modules/profile/profile.delivery.ts`
- Scope extracted:
  - delivery provider parsing/normalization and providers list
  - Yandex geosuggest/geocoder lookups
  - Russian Post DBF and office-detail resolution
  - pickup-point meta-tag helpers
  - Yandex tracking bootstrap and delivery-points aggregator
- Integration mode:
  - `profile.routes.ts` now imports helpers and passes them via existing DI contracts.
  - `ensureYandexTrackingForOrders` is injected as wrapper with explicit Prisma dependency.
- Why: aggregator had become orchestration + infrastructure in one file; extraction isolates volatile integration logic and reduces router-level cognitive load.
- Practice basis:
  - Separation of concerns (routing vs integration/service logic).
  - Dependency injection for explicit infrastructure dependencies.
  - Incremental refactor without contract change.

## D-015: Split Delivery Module Into Points + Tracking Submodules

- Decision: split delivery monolith into focused modules:
  - `backend/src/modules/profile/profile.delivery.points.ts`
  - `backend/src/modules/profile/profile.delivery.tracking.ts`
  - shared primitives/config in `backend/src/modules/profile/profile.delivery.shared.ts`
  - compatibility barrel `backend/src/modules/profile/profile.delivery.ts`
- Why: `profile.delivery.ts` was still too large and mixed independent concerns (pickup search vs tracking lifecycle).
- Integration mode:
  - kept existing import contract for callers via barrel re-exports.
  - no API URL/payload changes.
- Practice basis:
  - Cohesion by subdomain boundary.
  - Explicit shared dependencies through module-level exports.
  - Backward-compatible internal refactor.

## D-016: Extract YooKassa Payment Client From Profile Router

- Decision: moved YooKassa request/retry/parsing helpers from `profile.routes.ts` into:
  - `backend/src/modules/profile/profile.payment.ts`
- Exported surface:
  - `createYooKassaPayment`
  - `fetchYooKassaPaymentById`
  - `extractYooKassaPaymentBaseId`
- Integration mode:
  - `profile.routes.ts` imports payment helpers and passes them into orders-router DI unchanged.
- Why: payment transport/client logic is infrastructure concern, not router composition concern; extraction reduces route-file responsibility and keeps payment behavior centralized.
- Practice basis:
  - Separation of concerns.
  - Encapsulated third-party integration clients.
  - Backward-compatible refactor through existing DI seam.

## D-017: ProfilePage Address Helpers Extraction + Dead Suggest Pipeline Cleanup

- Decision: extracted pure address helper logic from `ProfilePage.tsx` into:
  - `frontend/src/components/pages/profile.address-helpers.ts`
- Additional cleanup:
  - removed unused in-component address suggest pipeline functions and stale cache plumbing that had no call sites.
  - narrowed state tuples to setter-only where value was never read.
- Why: the page mixed UI rendering with a large amount of pure string/address normalization utilities and dead code paths; this increased cognitive load and hid actual runtime flow.
- Practice basis:
  - React component slimness (keep pure logic in reusable modules).
  - Dead code elimination after usage verification.
  - Small, behavior-preserving refactor slices.

## D-018: CheckoutPage UI Decomposition Into Focused Submodules

- Decision: split large visual sections from `CheckoutPage.tsx` into dedicated components:
  - `frontend/src/components/checkout.delivery-section.tsx`
  - `frontend/src/components/checkout.payment-method-section.tsx`
  - `frontend/src/components/checkout.order-summary.tsx`
- Integration mode:
  - kept `CheckoutPage.tsx` as orchestration layer (state, API side effects, payment polling, order creation).
  - moved only presentational/UI assembly and delegated actions via explicit props callbacks.
  - no API endpoints, payload contracts, or route behavior changed.
- Why: `CheckoutPage` mixed high-churn UI markup with operational checkout logic, making changes risky and hard to review.
- Practice basis:
  - React composition and single-responsibility boundaries.
  - Separation of concerns (orchestration vs presentational rendering).
  - Incremental, behavior-preserving refactor slices.

## D-019: App View Shell Consolidation For Repeated Header/Footer Layout

- Decision: extracted repeated page chrome (`Header + Footer`) into:
  - `frontend/src/components/AppPageShell.tsx`
- Integration mode:
  - `App.tsx` now defines `renderWithAppShell(...)` and uses it for product/seller/checkout/order/static/home routes.
  - cart/auth/profile/admin flows keep their existing dedicated rendering paths.
  - no route URLs, no API payloads, and no state transitions changed.
- Why: `App.tsx` had many duplicated view branches with identical chrome wiring, which increased change surface and regression risk.
- Practice basis:
  - DRY for shared layout composition.
  - React composition (container/shell reuse).
  - Behavior-preserving refactor by extracting only presentation scaffolding.

## D-020: ProfilePage Tab Panels Extraction (Orders/Wishlist/Partnership)

- Decision: extracted tab-panel rendering blocks from `ProfilePage.tsx` into:
  - `frontend/src/components/pages/profile.tab-panels.tsx`
  - exported panels: `ProfileOrdersTab`, `ProfileWishlistTab`, `ProfilePartnershipTab`.
- Integration mode:
  - kept async/business handlers in `ProfilePage.tsx` (API calls, modal state, review submit, wishlist remove, partnership submit).
  - wired new panels through explicit props callbacks only.
  - no API endpoint, payload, or route contract changes.
- Additional type hygiene:
  - introduced shared `PartnershipForm` type in `profile.models.ts` and reused it in page state/panel props.
- Why: large tab JSX blocks were tightly packed inside `ProfilePage`, making review and localized changes risky.
- Practice basis:
  - React presentational/container split.
  - Strong typing for shared form contracts.
  - Incremental, behavior-preserving modularization.

## D-021: ProfilePage Addresses Tab Extraction (List + Modal + Map UI)

- Decision: extracted the addresses tab UI (address list + create-address modal + map block) from `ProfilePage.tsx` into:
  - `frontend/src/components/pages/profile.addresses-tab.tsx`
  - exported panel: `ProfileAddressesTab`.
- Integration mode:
  - preserved all stateful/async behavior in `ProfilePage.tsx` (address create/delete/default, blur timeout handling, suggest-focus flags, geocode apply flow).
  - moved only render composition into the panel and connected via explicit callbacks/props.
  - no API contract, endpoint usage, or route behavior changed.
- Additional type hygiene:
  - introduced shared `AddressFormState` in `profile.models.ts`.
- Why: addresses tab was the largest JSX block left in `ProfilePage`, tightly mixing modal markup and map UI with unrelated tab logic.
- Practice basis:
  - Container vs presentational split.
  - Strongly typed props/contracts for extracted UI modules.
  - Incremental decomposition with behavior preservation.

## D-022: ProfilePage Sidebar + Settings Tab Extraction

- Decision: extracted two additional high-volume UI areas from `ProfilePage.tsx` into dedicated modules:
  - `frontend/src/components/pages/profile.sidebar.tsx`
  - `frontend/src/components/pages/profile.settings-tab.tsx`
- Integration mode:
  - `ProfilePage.tsx` keeps orchestration (state, async handlers, tab routing) and passes explicit callbacks/props.
  - sidebar tab selection and logout behavior remain unchanged.
  - profile save flow and password field behavior remain unchanged.
- Additional type hygiene:
  - introduced shared `ProfileFormState` in `profile.models.ts`.
- Why: sidebar and settings form were large static markup blocks in the main orchestrator and increased cognitive load during edits.
- Practice basis:
  - Container/presentational decomposition.
  - Shared form-state typing across components.
  - Incremental behavior-preserving modularization.

## D-023: ProfilePage Active Tab Router Simplification + Partner Tab Orchestrator Extraction

- Decision:
  - extracted partner-tab orchestrator into `frontend/src/components/pages/profile.partner-tab.tsx`.
  - replaced `renderActiveTab` if-chain in `ProfilePage.tsx` with base-renderer map + partner fallback.
- Integration mode:
  - non-partner tabs (`profile`, `addresses`, `orders`, `wishlist`, `partnership`) are selected through `baseTabRenderers` mapping.
  - partner tab behavior preserved via extracted `ProfilePartnerTab` (same lazy pages + same fallback texts).
  - no API/route/state contract changes.
- Why: long if-chain + inline partner lazy-routing added branching complexity in the page orchestrator.
- Practice basis:
  - Table-driven dispatch over branching chain.
  - Focused component boundaries for async/lazy orchestration blocks.
  - Behavior-preserving refactor through explicit props.

## D-024: Profile Header Extraction + Geocode No-op Cleanup

- Decision:
  - extracted profile page top header block into `frontend/src/components/pages/profile.header.tsx`.
  - removed no-op `resolveCityRegion` helper and equivalent empty fallbacks inside geocode merge flow.
- Integration mode:
  - `ProfilePage.tsx` now renders `<ProfileHeader profile={profile} onBack={onBack} />`.
  - geocode behavior unchanged because removed fallback always resolved to empty string before.
  - no endpoint/payload/route contract changes.
- Why: reduce page-level markup volume and eliminate dead fallback logic that added cognitive noise.
- Practice basis:
  - Presentational extraction for repeated/standalone sections.
  - Dead-code cleanup only when behavior-equivalent.
  - Keep orchestrator components focused on state/effects.

## D-025: Extract Profile Tab Dispatcher Into Dedicated Router Component

- Decision: moved active-tab dispatch logic from `ProfilePage.tsx` into:
  - `frontend/src/components/pages/profile.tab-router.tsx`
- Integration mode:
  - `ProfilePage.tsx` now passes `activeTab`, `baseTabRenderers`, and `onRequestAddressChange` into `<ProfileTabRouter />`.
  - partner fallback remains delegated to existing `ProfilePartnerTab`.
  - no API, route, or state contract changes.
- Why: removing dispatch branching from page-level render keeps `ProfilePage` focused on state/effects orchestration.
- Practice basis:
  - Extract control-flow routers from container views.
  - Keep mapping-based dispatch isolated and testable.
  - Behavior-preserving incremental refactor.

## D-026: Extract Profile Address Geocode Engine From ProfilePage

- Decision: moved geocoding engine (address parsing + forward/reverse geocode merge flow) from `ProfilePage.tsx` into:
  - `frontend/src/components/pages/profile.geocode.ts`
- Integration mode:
  - `ProfilePage.tsx` now uses imported `geocodeProfileAddress(...)` service in timeout wrapper and address creation flow.
  - removed duplicated in-page geocode helpers while preserving existing fallback order and constraints.
  - no API/route/payload contract changes.
- Why: geocode logic was the largest infrastructure-like block left in the page and obscured UI/state orchestration intent.
- Practice basis:
  - Service extraction from UI containers.
  - Keep component files focused on view state + event orchestration.
  - Behavior-preserving incremental refactor with existing smoke validation.

## D-027: Extract Native Address Suggest Orchestration From ProfilePage

- Decision: moved native `ymaps.SuggestView` initialization/cleanup and geosuggest provider wiring from `ProfilePage.tsx` into:
  - `frontend/src/components/pages/profile.address-suggest.ts`
  - exported function: `mountNativeAddressSuggest(...)`.
- Integration mode:
  - `ProfilePage.tsx` now delegates suggest lifecycle to helper and passes callback for selected value handling.
  - preserved blur-timeout/reset flow, address application sequence, and suggest-enabled state updates.
  - no API/route contract changes.
- Why: suggest initialization block was infrastructure-heavy and large for a UI container file.
- Practice basis:
  - Side-effect extraction into focused helper modules.
  - Keep component body oriented around state orchestration.
  - Behavior-preserving refactor with scenario smoke verification.

## D-028: Extract Address Auto-Fill Effect Logic From ProfilePage

- Decision: moved full-address auto-fill effect body (house-like input detection, timed geocode enrichment, postal/coords update merge) into:
  - `frontend/src/components/pages/profile.address-autofill.ts`
  - exported function: `scheduleAddressAutofill(...)`.
- Integration mode:
  - `ProfilePage.tsx` keeps effect trigger conditions (`addressModalOpen`, `addressForm.fullAddress`) and delegates execution/cleanup to helper.
  - merged field update semantics are preserved (`region/city/street/house/postal/lat/lon` updates only on real change).
  - no API/route/payload changes.
- Why: this effect was one of the heaviest logic sections still inside the UI container.
- Practice basis:
  - Move deterministic domain logic out of components.
  - Keep React effects thin and orchestration-only.
  - Incremental refactor with regression checks.

## D-029: Extract Profile Address Creation/Map Mapping Flow From ProfilePage

- Decision: moved address creation payload preparation, map-selection merge logic, map-center query derivation, and empty-form factory from `ProfilePage.tsx` into:
  - `frontend/src/components/pages/profile.address-flow.ts`
- Integration mode:
  - `ProfilePage.tsx` now delegates address create pre-validation/payload build to `prepareCreateAddressPayload(...)`.
  - map pick handler now uses `mergeAddressFromMap(...)` + `resolveMapCenterQuery(...)`.
  - reset/init form paths now use shared `createEmptyAddressForm()`.
  - `ProfileAddressesTab` now reuses shared `AddressMapSelection` type from `profile.address-flow.ts`.
  - no backend API routes/payload contracts changed.
- Why: these blocks were still domain-heavy and inflated the UI container with parsing/normalization details.
- Practice basis:
  - Keep React container focused on orchestration and state transitions.
  - Move deterministic domain transformations into pure reusable helpers.
  - Centralize duplicated state shape factories to reduce drift risk.

## D-030: Extract Address Full-Input UI Handlers (Focus/Blur/Enter/Escape)

- Decision: moved full-address input UI handlers from `ProfilePage.tsx` JSX props into:
  - `frontend/src/components/pages/profile.address-input.handlers.ts`
  - exported factory: `createAddressInputHandlers(...)`.
- Integration mode:
  - `ProfilePage.tsx` now creates `addressFullInputHandlers` via `useMemo(...)` and passes stable callbacks to `ProfileAddressesTab`.
  - preserved existing blur-timeout semantics, suggestion-focus lock behavior, Enter geocode apply flow, and Escape reset behavior.
  - no API/route/payload contract changes.
- Why: inline handler blocks still added noise in the main page orchestrator and slowed scanning of primary page logic.
- Practice basis:
  - Keep container JSX declarative by extracting event-flow logic.
  - Isolate event-driven state transitions into dedicated helpers for easier review and future tests.
  - Behavior-preserving incremental refactor with post-change smoke checks.

## D-031: Extract Address Modal UI Handlers (Open/Close/Reset/FullAddressChange)

- Decision: moved address modal handler logic from `ProfilePage.tsx` into:
  - `frontend/src/components/pages/profile.address-modal.handlers.ts`
  - exported functions:
    - `handleAddressFullAddressChange(...)`
    - `resetAddressModalState(...)`
    - `openAddressCreateModal(...)`
    - `closeAddressCreateModal(...)`
- Integration mode:
  - `ProfilePage.tsx` now delegates modal reset/open/close flow and full-address input change flow to the helper module.
  - preserved modal initialization center computation, blur-timeout cleanup, and full-address typing behavior.
  - no API/route/payload contract changes.
- Why: modal lifecycle handlers were still mixed into page orchestration and made the container harder to scan.
- Practice basis:
  - Extract event/lifecycle state transitions into dedicated modules.
  - Keep container component focused on data loading and high-level wiring.
  - Behavior-preserving refactor with typecheck + smoke validation.

## D-032: Stage 6 Slice 1 — Normalize Nullable Semantics and Tighten Profile Contracts

- Decision:
  - normalized optional partnership request fields (`inn`, `geography`, `socialProfile`, `credibility`) to `null` when empty.
  - enforced first-address default invariant on address creation (`effectiveIsDefault` when no existing addresses).
  - replaced mojibake string literals in profile routes with valid UTF-8 user-facing messages.
  - tightened frontend `Address` model to match backend DTO stability and added explicit `ProfileUpdateResponse` type for `PATCH /profile/me`.
- Integration mode:
  - no route URL or payload key changes.
  - behavioral changes are data-quality/invariant hardening only.
  - all changes validated by strict TypeScript gates + smoke scenarios.
- Why:
  - stage 6 requires contract and data consistency across UI/API/DB; these fixes remove ambiguous nullable values, improve deterministic address state, and strengthen compile-time API guarantees.
- Practice basis:
  - TypeScript strict typing and explicit nullable semantics.
  - Prisma nullable field consistency.
  - Domain invariant enforcement in write paths.
  - Behavior-preserving incremental refactor with runtime verification.

## D-033: Stage 6 Slice 2 — Tighten Checkout Enum Contracts and Remove Partner Address DTO Drift

- Decision:
  - replaced broad `string` status fields in `frontend/src/components/checkout.models.ts` with explicit unions matching backend order/transaction/provider enums.
  - replaced local `ProfileAddressDto` declaration in `PartnerListingsPage.tsx` with shared model projection from `profile.models.ts`.
- Integration mode:
  - no API URL/payload key changes.
  - compile-time contract strictness only; runtime behavior unchanged.
- Why:
  - broad string typing in checkout payment polling masked potential API drift and weakened static verification.
  - local duplicate address DTO in partner page risked schema divergence from profile contract.
- Practice basis:
  - TypeScript strict finite unions for protocol-like fields.
  - Shared source-of-truth domain models for cross-feature consistency.
  - Incremental hardening with post-change smoke verification.

## D-034: Stage 6 Slice 3 — Tighten Admin Complaints API Contracts in Frontend

- Decision:
  - replaced broad complaint transport strings in `frontend/src/components/admin/ComplaintsPage.tsx` with backend-aligned unions for:
    - listing status (`active/inactive/moderation`)
    - moderation status (`approved/rejected/pending`)
    - seller status (`active/blocked`)
    - sanction level/status (`warning/temp_3_days/temp_30_days/permanent`, `active/completed`)
  - expanded `ComplaintListResponse` typing to full backend envelope (`sort`, `filters`, `options`) instead of partial shape.
  - made `ComplaintStatusUpdateResponse.cascade` explicit and introduced typed related-listing response model.
- Integration mode:
  - no URL/path/payload key changes.
  - compile-time contract tightening only; runtime behavior unchanged.
- Why:
  - admin complaints flow is operationally sensitive; broad `string` typing hid potential drift between backend DTO and UI assumptions.
  - full response-envelope typing increases change-detection fidelity during refactors.
- Practice basis:
  - TypeScript handbook guidance on literal unions for finite sets.
  - API contract hygiene: explicit client-side modeling of server response shape.
  - Incremental hardening with type-check and smoke gate.

## D-035: Stage 6 Slice 4 — Tighten Checkout/Order-History Response Shapes and Reuse Order Enums

- Decision:
  - tightened `frontend/src/components/checkout.models.ts` contracts:
    - `CreateOrdersResponse.payment` made required (backend always returns it on successful order creation).
    - `CreateOrdersResponse.payment.status` switched to `YooKassaPaymentStatus` alias (known statuses + forward-compatible string fallback).
    - `DeliveryPointsResponse.location`, `activeProvider`, `pagination` made explicit required fields (with nullable pagination), matching backend response envelope.
  - tightened consumer code in `CheckoutPage.tsx` to use required `response.activeProvider` and `response.payment.confirmationUrl`.
  - removed status enum duplication in `PartnerOrdersPage.tsx` by reusing shared `OrderStatusValue`; narrowed `tracking_provider` from broad `string | null` to known provider union.
- Integration mode:
  - no URL/path/payload key changes.
  - compile-time contract hardening only; runtime behavior preserved.
- Why:
  - checkout and order-history flows are critical paths; weak optional typing in response envelopes hides regressions and drift.
  - shared enum source prevents cross-page divergence in order status semantics.
- Practice basis:
  - TypeScript strict typing for API envelopes and finite transport fields.
  - DRY/shared contract models for consistency across features.
  - Incremental refactor with compile gates and smoke verification.

## D-036: Stage 6 Slice 5 — Tighten Admin Transactions Enums via Shared Contracts

- Decision:
  - in `frontend/src/components/admin/TransactionsPage.tsx` replaced broad transaction-facing fields with shared enum-derived types:
    - `orderStatus` -> `Lowercase<OrderStatusValue>`
    - `status` -> `Lowercase<TransactionStatusValue>`
    - `paymentProvider` -> `Lowercase<PaymentProviderValue>`
  - status filter type now reuses the same lower-cased transaction status union (`"all" | AdminTransactionStatus`).
- Integration mode:
  - no API URL/payload key changes.
  - compile-time typing hardening only; runtime behavior unchanged.
- Why:
  - admin financial views are sensitive to status semantics; broad `string` typing can silently hide backend contract drift.
  - deriving admin types from shared transport enums keeps domain terminology synchronized across checkout and admin reporting.
- Practice basis:
  - TypeScript finite-literal unions for protocol/status fields.
  - DRY/shared model reuse to prevent cross-module contract skew.
  - Incremental hardening with strict type gates.

## D-037: Stage 6 Slice 6 — Auth Session Boundary Hardening (Token Path + Legacy Compatibility)

- Decision:
  - introduced JWT (`HS256`) `sessionToken` lifecycle:
    - backend now issues `sessionToken` on `/auth/login` and `/auth/signup`.
    - backend session resolver verifies `Authorization: Bearer <token>` and uses it as primary identity source.
  - kept backward-compatible legacy identity path (`x-user-id` / `user_id`) behind `ALLOW_LEGACY_USER_ID` gate:
    - explicit `true/false` env override.
    - default allowed only outside production for safe migration.
  - frontend now persists auth token and automatically sends `Authorization: Bearer` on API calls; `x-user-id` is used only when no token exists.
- Integration mode:
  - no endpoint URL changes.
  - auth responses extended with additional field (`sessionToken`) without breaking existing consumers.
  - existing smoke scenarios remain valid through compatibility fallback.
- Why:
  - trusted user identity should not be accepted from spoofable transport headers in production systems.
  - phased rollout avoids breaking current clients/tests while moving toward safer session verification.
- Practice basis:
  - OWASP ASVS authentication/session management principles.
  - defense-in-depth with signed bearer JWT credentials and explicit claim validation.
  - incremental migration with compatibility flags and regression gates.

## D-038: Stage 6 Slice 7 — Token-Only Regression Baseline and Legacy Query Path Removal

- Decision:
  - removed query identity fallback (`user_id`) from backend session resolution.
  - tightened legacy behavior in `session.ts`:
    - in production, legacy user-id transport identity is always disabled.
    - outside production, legacy `x-user-id` can be explicitly enabled only via `ALLOW_LEGACY_USER_ID=true`; default is disabled.
  - migrated smoke regression to bearer auth:
    - all authenticated smoke calls now use `Authorization: Bearer <sessionToken>`.
    - step renamed to `auth: me via bearer token`.
- Integration mode:
  - no API route changes.
  - session boundary stricter by default while preserving optional non-production compatibility switch.
- Why:
  - query/header user-id identity is spoofable and should not be part of default auth path.
  - regression suite must validate the target architecture (token-first), not legacy transport shortcuts.
- Practice basis:
  - OWASP ASVS session/authentication controls.
  - secure-by-default configuration principle.
  - test strategy alignment with production auth model.
- Validation:
  - `node node_modules/typescript/bin/tsc -p backend/tsconfig.json --noEmit`: PASS
  - `node node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit`: PASS
  - `node scripts/e2e-smoke.mjs`: PASS (`12/12`, bearer-token auth path covered)

## D-039: Stage 6 Slice 8 — Production Secret Guardrails + Negative Token Regression

- Decision:
  - added production guardrails in `backend/src/lib/session-token.ts`:
    - require `SESSION_TOKEN_SECRET` in production.
    - enforce minimum secret length (`>= 32`) in production.
    - explicitly reject built-in development fallback secret in production.
  - added startup-time config assertion in `backend/src/server.ts` (`assertSessionTokenConfiguration`) so misconfiguration fails fast before traffic handling.
  - expanded smoke auth regression in `scripts/e2e-smoke.mjs` with negative bearer-token scenarios:
    - malformed token must return `401`.
    - expired token must return `401`.
- Integration mode:
  - no API route/payload changes.
  - stronger operational safety and auth regression depth without consumer-breaking contract changes.
- Why:
  - default/development secrets in production are a high-impact misconfiguration risk.
  - token architecture should be verified for both acceptance and rejection paths, not only happy-path auth.
- Practice basis:
  - OWASP ASVS authentication/session controls.
  - fail-fast configuration validation at startup for security-critical settings.
  - negative-path security regression testing.
- Validation:
  - `node node_modules/typescript/bin/tsc -p backend/tsconfig.json --noEmit`: PASS
  - `node node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit`: PASS
  - `node scripts/e2e-smoke.mjs`: PASS (`14/14`)

## D-040: Stage 6 Slice 9 — CI Preflight for Production Session Configuration

- Decision:
  - added dedicated preflight script `scripts/security-preflight.ts` for production session-token configuration validation.
  - introduced npm commands:
    - `security:preflight:session`
    - `ci:preflight:prod-auth` (`NODE_ENV=production` wrapper for CI/CD)
  - preflight checks are aligned with runtime session policy and fail fast on invalid auth-critical env setup before deployment/runtime startup.
- Integration mode:
  - no API route/payload changes.
  - operational pipeline hardening only.
- Why:
  - auth misconfiguration should be detected before deploy, not only at runtime startup.
  - CI preflight reduces rollback risk and shortens incident feedback loops.
- Practice basis:
  - OWASP ASVS operational/session configuration controls.
  - DevSecOps shift-left validation and fail-fast pipeline checks.
- Validation:
  - `node node_modules/typescript/bin/tsc -p backend/tsconfig.json --noEmit`: PASS
  - `node node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit`: PASS
  - `NODE_ENV=production SESSION_TOKEN_SECRET='0123456789abcdef0123456789abcdef' npm run security:preflight:session`: PASS
  - `NODE_ENV=production npm run security:preflight:session`: FAIL as expected (`SESSION_TOKEN_SECRET is required in production`)
  - `node scripts/e2e-smoke.mjs`: PASS (`14/14`)

## D-041: Stage 6 Slice 10 — Final Legacy Removal (Strict Token-Only Runtime)

- Decision:
  - removed remaining `x-user-id` identity fallback from backend session resolver (`backend/src/lib/session.ts`).
  - removed frontend API transport fallback that injected `x-user-id` when token was absent (`frontend/src/lib/api.ts`).
  - aligned app session bootstrap (`frontend/src/App.tsx`) to mark user authenticated only when both session user and session token exist; stale user-only state is cleared.
- Integration mode:
  - no API route/payload changes.
  - authentication transport is now strictly bearer token-based.
- Why:
  - dual-path identity transport (token + fallback header) keeps insecure paths alive and increases ambiguity during incident response/debugging.
  - strict single auth path is easier to reason about, test, and secure.
- Practice basis:
  - OWASP ASVS authentication/session controls (trusted identity must come from verifiable credentials).
  - secure-by-default architecture and attack-surface minimization.
- Validation:
  - `node node_modules/typescript/bin/tsc -p backend/tsconfig.json --noEmit`: PASS
  - `node node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit`: PASS
  - `node scripts/e2e-smoke.mjs`: PASS (`14/14`)

## D-042: Stage 8 — Expand Automated Scenario Coverage for P0/P1 Matrix

- Decision:
  - expanded `scripts/e2e-smoke.mjs` with additional contract/security/business scenarios:
    - auth failures (`wrong password`, `anonymous protected access`, `buyer->admin forbidden`)
    - profile update and default-address delete guard
    - catalog questions + complaint create flow
    - partner listing full update path
    - partner order status/tracking mutation path (deterministic synthetic order precondition)
    - partner cross-seller ownership enforcement path
    - admin idempotency-header enforcement and KYC review mutation path
  - updated `docs/audit/test-scenarios.csv` automation statuses for newly covered scenarios.
- Integration mode:
  - no API route/payload contract changes.
  - regression-depth increase only.
- Why:
  - stage-8 objective is end-to-end scenario validation breadth; relying on narrow smoke alone leaves critical authz/business paths unverified.
- Practice basis:
  - OWASP ASVS authz/error-path testing.
  - risk-based test prioritization (P0/P1 first).
  - deterministic test preconditions for stable CI behavior.
- Validation:
  - `node scripts/e2e-smoke.mjs`: PASS (`25/25`)
  - scenario matrix status after update:
    - total `50`
    - automated `42`
    - pending `8`
    - P0/P1 pending `0`

## D-043: Stage 9 — Query-Driven DB Index Optimization With Measured Before/After

- Decision:
  - added benchmark script `scripts/perf-stage9.mjs` for reproducible `EXPLAIN ANALYZE` before/after measurements on complaints-heavy queries.
  - introduced complaint composite indexes:
    - `Complaint_status_created_at_id_idx`
    - `Complaint_listing_status_created_at_id_idx`
  - persisted indexes in Prisma schema (`backend/prisma/schema.prisma`).
- Integration mode:
  - no API route/payload changes.
  - data-model indexing only.
- Why:
  - admin complaints queue path had avoidable sort/scan overhead under larger complaint volumes.
  - indexing should follow actual filter+sort patterns, validated by planner output.
- Practice basis:
  - PostgreSQL `EXPLAIN ANALYZE` driven tuning.
  - read-path-first indexing strategy.
  - measured optimization with explicit deltas.
- Validation:
  - `npm run perf:stage9`: PASS
  - queue query benchmark: execution `0.668 ms -> 0.049 ms` (`-92.7%`)
  - `npm run db:push`: PASS (`database in sync`)

## D-044: Stage 10 — Second Audit Pass and Explicit QA Gate

- Decision:
  - executed second audit pass across:
    - scenario matrix state
    - regression gates
    - performance findings
  - published explicit gate artifact: `docs/audit/qa-gate.md`.
- Integration mode:
  - audit/quality-governance artifact only.
- Why:
  - stage-10 requires an explicit ready/not-ready decision with residual risk visibility, not implicit confidence.
- Practice basis:
  - release-governance best practice with formal quality gates.
  - transparent risk register before production promotion.
- Validation:
  - gate verdict: `NOT READY` (pending: P2 race/perf/compatibility scenarios)
  - supporting checks:
    - `node scripts/e2e-smoke.mjs`: PASS (`25/25`)
    - `tsc backend/frontend`: PASS

## D-045: Stage 8 — Close Remaining Race/Compatibility Scenarios in Automated Smoke

- Decision:
  - extended `scripts/e2e-smoke.mjs` with deterministic coverage for pending race/compatibility paths:
    - `SCN-042` webhook replay idempotency (`/api/profile/payments/yookassa/webhook`)
    - `SCN-043` concurrent complaint status update consistency (`/api/admin/complaints/:id/status`)
    - `SCN-044` concurrent default address switch invariant
    - `SCN-045` concurrent partner order status mutation boundedness
    - `SCN-050` legacy complaint mutation route compatibility (`/api/admin/complaints/:publicId`)
  - updated `docs/audit/test-scenarios.csv` statuses for covered scenarios.
- Integration mode:
  - no API contract changes.
  - regression-depth increase only.
- Why:
  - stage-8 target is full scenario matrix coverage with deterministic system assertions for critical race/compatibility paths.
- Practice basis:
  - OWASP ASVS retry/idempotency safety and access-control regression discipline.
  - deterministic concurrency harnessing (parallel requests + invariant checks).
- Validation:
  - `node scripts/e2e-smoke.mjs`: PASS (`30/30`)
  - matrix after update:
    - automated `49/50`
    - pending `1/50` (`SCN-048`)

## D-046: Stage 9 — Extend Perf Coverage to Catalog Read Path Under Large Dataset

- Decision:
  - expanded `scripts/perf-stage9.mjs`:
    - synthetic `12000` listing insertion for load profile.
    - `EXPLAIN ANALYZE` before/after for catalog list query pattern.
  - added listing composite index:
    - `MarketplaceListing_type_status_moderation_created_id_idx`.
  - persisted index in Prisma schema.
- Integration mode:
  - DB index optimization only, no API payload changes.
- Why:
  - catalog list under large-cardinality datasets needs query-shape-aligned indexing to reduce sort/scan work.
- Practice basis:
  - PostgreSQL index-by-query-pattern tuning with measured planner evidence.
- Validation:
  - `npm run perf:stage9`: PASS
  - catalog benchmark execution: `0.070 ms -> 0.046 ms` (`-34.3%`)
  - `npm run db:push`: PASS

## D-047: Stage 10 — QA Gate Refresh After Stage 8/9 Completion

- Decision:
  - refreshed `docs/audit/qa-gate.md` and supporting artifacts using new stage-8/9 results.
  - preserved conservative final gate verdict until remaining frontend render-stress scenario (`SCN-048`) is automated.
- Integration mode:
  - governance artifact update only.
- Why:
  - gate must reflect current verified state and residual risk, not stale pending counts.
- Practice basis:
  - explicit release governance with transparent residual-risk accounting.
- Validation:
  - `node scripts/e2e-smoke.mjs`: PASS (`30/30`)
  - `npm run perf:stage9`: PASS
  - coverage snapshot: automated `49/50`, pending `1/50`

## D-048: Stage 10 — Automate SCN-048 Frontend Render-Stress

- Decision:
  - added `scripts/profile-render-stress.ts` to automate `SCN-048` with measurable thresholds:
    - load stabilization time
    - commit durations (`max`, `p95`, `avg`)
    - commit density (`commits per tab switch`)
  - payload scale is intentionally large to stress `ProfilePage` state tree.
  - added npm script: `perf:profile-render-stress`.
- Integration mode:
  - no API contract changes.
  - quality/performance automation only.
- Why:
  - final pending matrix item required deterministic frontend performance signal rather than manual observation.
- Practice basis:
  - React profiling model (commit duration + render frequency).
  - repeatable threshold-based performance gates.
- Validation:
  - `npm run perf:profile-render-stress`: PASS
  - `SCN-048` moved to `automated` (`docs/audit/test-scenarios.csv`)

## D-049: Stage 10 — Add Endpoint-Level P95 Gate and Close QA

- Decision:
  - added endpoint latency gate script `scripts/http-latency-stage10.mjs` and npm script `perf:http-p95:stage10`.
  - measured p95 for:
    - `/api/catalog/listings`
    - `/api/admin/complaints` (filtered read path)
  - updated `docs/audit/qa-gate.md` to final verdict `READY`.
- Integration mode:
  - no API payload changes.
  - verification/operability enhancement only.
- Why:
  - release gate needed endpoint-level latency evidence in addition to DB plan-level metrics.
- Practice basis:
  - SLO-oriented API latency verification (p95 percentile focus).
  - defense-in-depth: DB-level + endpoint-level + UI-level performance checks.
- Validation:
  - `npm run perf:http-p95:stage10`: PASS
  - `node scripts/e2e-smoke.mjs`: PASS (`30/30`)
  - matrix snapshot: automated `50/50`, pending `0/50`
