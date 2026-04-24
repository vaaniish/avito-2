# Stage 9 Performance Report

Date: 2026-04-20  
Scope: complaints-heavy read paths + catalog list read path (`admin complaints queue`, related open complaints, catalog list under load)

## Method

- Benchmark script: `scripts/perf-stage9.mjs`
- DB: local PostgreSQL (`DATABASE_URL` from project env)
- Setup:
  - inserts `6000` synthetic complaint rows (`complaint_type=perf_stage9_benchmark`)
  - inserts `12000` synthetic marketplace listings (`title=perf_stage9_listing_benchmark`)
  - runs `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` before/after index changes
  - cleans synthetic rows after run
- Indexes introduced:
  - `Complaint_status_created_at_id_idx` on `(status, created_at DESC, id DESC)`
  - `Complaint_listing_status_created_at_id_idx` on `(listing_id, status, created_at DESC, id DESC)`
  - `MarketplaceListing_type_status_moderation_created_id_idx` on `(type, status, moderation_status, created_at DESC, id DESC)`

## Results (Before vs After)

| Query | Before Plan | After Plan | Exec Time Before | Exec Time After | Delta |
|---|---|---|---:|---:|---:|
| `status='NEW' ORDER BY created_at DESC, id DESC LIMIT 50` | `Bitmap Index Scan (Complaint_status_idx)` + sort | `Index Scan (Complaint_status_created_at_id_idx)` | `0.571 ms` | `0.042 ms` | `-92.6%` |
| `listing_id=:id AND status IN ('NEW','PENDING') ORDER BY created_at ASC, id ASC` | `Bitmap Index Scan (Complaint_listing_id_idx)` + sort | same planner choice | `0.226 ms` | `0.246 ms` | `+8.8%` |
| `type='PRODUCT' AND status='ACTIVE' AND moderation_status='APPROVED' ORDER BY created_at DESC, id DESC LIMIT 100` | `Index Scan (MarketplaceListing_status_moderation_status_created_at_idx)` + incremental sort | `Index Scan (MarketplaceListing_type_status_moderation_created_id_idx)` | `0.070 ms` | `0.046 ms` | `-34.3%` |

Raw benchmark output is produced by:

```bash
npm run perf:stage9
```

## Interpretation

- The new composite complaint status/order index materially improves queue-style complaint reads where sort+limit is dominant.
- Listing-scoped open complaints remain neutral on this data shape; planner still prefers existing listing filter path.
- Catalog list path under high listing cardinality now uses the new composite listing index and removes incremental sort overhead.
- Net: measurable improvement on two high-read paths with no API contract change.

## Practice Basis

- PostgreSQL docs: multicolumn index behavior and planner choices via `EXPLAIN ANALYZE`.
- Read-path-driven indexing (index by query pattern) from standard DB performance practice.
- Incremental optimization with measured before/after deltas (SRE/operability principle).

## Stage 10 Verification (Endpoint + UI)

- Endpoint P95 benchmark script: `scripts/http-latency-stage10.mjs`
  - command: `npm run perf:http-p95:stage10`
  - samples: `40` (plus warmup `5`)
  - SLO thresholds:
    - catalog p95 <= `200 ms`
    - admin complaints p95 <= `350 ms`
  - measured:
    - catalog p95: `10.399 ms` (PASS)
    - admin complaints p95: `8.828 ms` (PASS)

- Frontend render-stress script (`SCN-048`): `scripts/profile-render-stress.ts`
  - command: `npm run perf:profile-render-stress`
  - synthetic payload:
    - addresses: `180`
    - orders: `320` (`1280` order items)
    - wishlist: `900`
  - measured:
    - load elapsed: `44.649 ms`
    - tab-switch stress elapsed (`160` switches): `4599.732 ms`
    - p95 commit duration: `25.491 ms`
    - max commit duration: `124.826 ms`
    - commits per switch: `1.994`
  - threshold result: PASS

## Next Performance Actions

1. Rework admin complaints list path to avoid full in-memory sort/paginate for `createdAt` mode (push pagination deeper into SQL path).
2. Add CI scheduling for `perf:http-p95:stage10` and `perf:profile-render-stress` (nightly/per-merge baseline tracking).
3. Calibrate performance thresholds using production-like hardware profile and concurrent load.
