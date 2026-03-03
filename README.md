
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
