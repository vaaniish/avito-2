# Текущие hotspots

Дата: `2026-05-10 23:05:05 MSK`

## Самые крупные файлы фронтенда

1. `frontend/src/pages/partner-listings/partner-listings.components.tsx` — `1311` строк
2. `frontend/src/pages/admin/catalog-suggestions/catalog-suggestions.modals.tsx` — `930`
3. `frontend/src/pages/static/partnership/PartnershipPage.tsx` — `854`
4. `frontend/src/pages/product-detail/product-detail.sections.tsx` — `786`
5. `frontend/src/pages/admin/transactions/TransactionsPage.tsx` — `738`
6. `frontend/src/pages/admin/catalog-suggestions/catalog-suggestions.hooks.ts` — `731`
7. `frontend/src/pages/partner-listings/PartnerListingsPage.tsx` — `699`
8. `frontend/src/pages/profile/PartnerFinancePage.tsx` — `684`
9. `frontend/src/pages/checkout/checkout.hooks.ts` — `667`
10. `frontend/src/pages/partner-listings/partner-listings.create-flow.tsx` — `664`

## Самые крупные файлы бэкенда

1. `backend/src/modules/partner/partner.listings.routes.ts` — `3340` строк
2. `backend/src/modules/admin/admin.complaints.routes.ts` — `2069`
3. `backend/src/modules/catalog/catalog.routes.ts` — `1617`
4. `backend/src/modules/profile/profile.orders.routes.ts` — `1614`
5. `backend/src/modules/profile/profile.delivery.points.ts` — `1369`
6. `backend/src/modules/admin/admin.catalog.routes.ts` — `1020`
7. `backend/src/modules/catalog/catalog-reference.service.ts` — `915`
8. `backend/src/modules/profile/profile.engagement.routes.ts` — `780`
9. `backend/src/modules/partner/order-delivery.ts` — `759`
10. `backend/src/modules/admin/admin.partnership.routes.ts` — `714`

## Что это значит

- На фронтенде структура уже выпрямлена, но некоторые feature-блоки остаются тяжёлыми по объёму.
- На бэкенде главный следующий кандидат на декомпозицию — `partner.listings.routes.ts`.
- Эти файлы не обязательно срочно разбивать, но они дают наибольшую стоимость следующего рефакторинга.
