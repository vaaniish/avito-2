# Stage 4 Quality Gate (MVP)

## What is covered

- Critical API/DB invariants for single-unit listings (`1 listing = 1 item`).
- Anti-circumvention enforcement in Q&A flows.
- Blocking re-activation of listings already linked to non-cancelled orders.
- Partner finance transparency in `/api/partner/orders`.
- Runtime observability baseline (`/health`, `/health/ready`, `/health/metrics`, request-id + latency logs).

## Local commands

```bash
npm run ci:verify
npm run test:critical:e2e
```

## CI pipeline

GitHub Actions workflow: `.github/workflows/ci.yml`

Jobs:

1. `quality`
- install dependencies
- encoding check
- production auth preflight
- backend+frontend build

2. `backend-critical`
- start Postgres service
- apply migrations
- seed database
- start backend
- wait for readiness probe
- run `critical-e2e`

## Notes

- `critical-e2e` script explicitly refuses to run against non-local DB URLs.
- External payment/logistics dependencies are intentionally excluded from this gate to keep CI deterministic.
