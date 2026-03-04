
# My product Gamification

This is a code bundle for My product Gamification. The original project is available at:
https://www.figma.com/design/KYlFzTyuyCYWUjG87GhT8H/My-product-Gamification

## Project structure

- `frontend/` - Vite + React client
- `backend/` - Express + Prisma API

## Running the code

1. Install dependencies:
   `npm i`
2. Sync schema and seed demo data:
   `npm run db:push && npm run db:seed`
3. Run frontend + backend in parallel:
   `npm run dev`

Optional frontend env (`frontend/.env`):

- `VITE_API_BASE_URL` (default: `http://localhost:3001/api`)
- `VITE_YANDEX_MAPS_API_KEY` (enables real Yandex map picker)

Optional backend env (`.env`):

- `YOOKASSA_SHOP_ID` - YooKassa shop id (test)
- `YOOKASSA_SECRET_KEY` - YooKassa secret key (test)
- `YOOKASSA_RETURN_URL` - return URL after payment (default: `http://127.0.0.1:3000`)
- `YOOKASSA_API_URL` - API base URL (default: `https://api.yookassa.ru/v3`)

Useful scripts:

- `npm run dev:frontend` - run only frontend
- `npm run dev:backend` - run only backend
- `npm run build` - build backend and frontend
- `npm run db:generate` / `npm run db:migrate` / `npm run db:seed` / `npm run db:push`

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
