
# My product Gamification

This is a code bundle for My product Gamification. The original project is available at:
https://www.figma.com/design/KYlFzTyuyCYWUjG87GhT8H/My-product-Gamification

## Project structure

- `frontend/` - Vite + React client
- `backend/` - Express + Prisma API

## Running the code

1. Install dependencies:
   `npm i`
2. Start PostgreSQL in Docker:
   `docker compose up -d`
3. Sync schema and seed demo data:
   `npm run db:push && npm run db:seed`
4. Run frontend + backend in parallel:
   `npm run dev`

Optional frontend env (`frontend/.env`):

- `VITE_API_BASE_URL` (default: `http://localhost:3001/api`)
- `VITE_YANDEX_MAPS_API_KEY` (enables real Yandex map picker)

Optional backend env (`.env`):

- `DATABASE_URL` (default in this repo: `postgresql://user:password@localhost:5433/avito-db?schema=public`)
- `YOOKASSA_SHOP_ID` - YooKassa shop id (test)
- `YOOKASSA_SECRET_KEY` - YooKassa secret key (test)
- `YOOKASSA_RETURN_URL` - return URL after payment (default: `http://127.0.0.1:3000`)
- `YOOKASSA_API_URL` - API base URL (default: `https://api.yookassa.ru/v3`)
- `MODERATION_AI_PROVIDER` - `ollama` or `none` (default in this repo: `ollama`)
- `MODERATION_AI_BASE_URL` - Ollama URL (default: `http://127.0.0.1:11434`)
- `MODERATION_AI_TEXT_MODEL` - text moderation model (default: `qwen2.5:3b-instruct`)
- `MODERATION_AI_VISION_MODEL` - image moderation model (default: `llava:7b`)
- `MODERATION_AI_IMAGE_ENABLED` - enable/disable image AI check (`true` / `false`)
- `MODERATION_AI_MAX_IMAGE_BYTES` - max downloaded image size for moderation (bytes)
- `MODERATION_AI_FLAG_RISK_THRESHOLD` - AI risk threshold (0..100) to auto-flag into manual moderation (default: `60`)
- `RUSSIAN_POST_API_BASE_URL` - base URL Почты России API (default: `https://www.pochta.ru`)
- `RUSSIAN_POST_API_PATH` - path to tracking endpoint (default: `/tracking-api/v1/trackings/by-barcodes`)
- `RUSSIAN_POST_ACCESS_TOKEN` - AccessToken for Почта России API
- `RUSSIAN_POST_USER_AUTH` - base64 login:password for header `X-User-Authorization`
- `RUSSIAN_POST_API_TIMEOUT_MS` - timeout for calls to Почта России API (default: `8000`)

Useful scripts:

- `npm run dev:frontend` - run only frontend
- `npm run dev:backend` - run only backend
- `npm run build` - build backend and frontend
- `npm run db:generate` / `npm run db:migrate` / `npm run db:seed` / `npm run db:push`

Legacy DB migration to normalized 3NF:

- runbook: `backend/prisma/MIGRATION_3NF.md`
- backfill SQL: `scripts/migrate_legacy_to_3nf.sql`
- verification SQL: `scripts/verify_3nf.sql`

## Demo accounts

- Regular user: `demo@ecomm.ru / demo123`
- Partner: `partner@ecomm.ru / partner123`
- Admin: `admin@ecomm.ru / admin123`

## Backend modules

- `auth` - login/signup/session user
- `catalog` - listings/categories/search suggestions/product Q&A
- `profile` - profile/addresses/orders/wishlist/partnership requests
- `partner` - seller listings/orders/questions management
- `admin` - transactions/complaints/KYC/listings/users/commission tiers/audit logs
- `gamification` - partner XP sandbox (`/api/gamification/*`)

## YooMoney / YooKassa (test mode)

1. Create/get a YooKassa test shop in your YooKassa account.
2. Put credentials into `.env`:
   - `YOOKASSA_SHOP_ID=<your_test_shop_id>`
   - `YOOKASSA_SECRET_KEY=<your_test_secret_key>`
3. Restart backend (`npm run dev:backend` or `npm run dev`).
4. In checkout choose `Оплата картой` and click `Перейти к оплате YooMoney`.
5. Use a test card on YooKassa page, for example:
   - Card: `5555 5555 5555 4477`
   - Expiry: `01/30`
   - CVC: `123`

## Free AI moderation (local, no paid API)

This project uses a hybrid moderation pipeline for partner listings:
- strict rule-based checks (always on),
- optional free AI moderation via local Ollama (text + image).

Setup:
1. Start services (DB + Ollama): `docker compose up -d`
2. Pull models once (if not already pulled): `docker compose run --rm ollama-init`
3. Start backend/frontend: `npm run dev`

If Ollama is unavailable, moderation automatically falls back to rule-based checks.

## Delivery tracking (Russian Post)

Partner order flow supports tracking via Почта России:
- when seller applies a valid tracking number, order status becomes `Отправлен` automatically;
- further status updates (`Доставлен` / `Выдан`) are synchronized from tracking API.

If Russian Post credentials are not configured or API is unavailable, the backend uses fallback validation for Russian Post-like tracking numbers and keeps synchronization on best-effort basis.
