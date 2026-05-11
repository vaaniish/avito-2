# Актуальный аудит структуры

Дата: `2026-05-10 23:05:05 MSK`

## Краткий вывод

Структура фронтенда переведена в предсказуемую feature-first модель. Основная проблема старого дерева — смешение страниц, page-private логики, общих UI-компонентов и feature-модулей в `frontend/src/components` — устранена.

## Что стало лучше

- Верхнеуровневая структура фронтенда разделена по ролям: `app`, `pages`, `widgets`, `entities`, `shared`.
- Все route/view entrypoints вынесены в `frontend/src/pages`.
- Page-private файлы co-located рядом со своей страницей.
- Общие UI-примитивы собраны в `frontend/src/shared/ui`.
- Общие runtime/helper-модули собраны в `frontend/src/shared/lib`.
- Документация `project.md` и `docs/architecture/frontend-structure.md` приведена в соответствие с текущим деревом.
- Мусорные артефакты и временные файлы удалены.

## Текущее устройство фронтенда

```text
frontend/src/
├── app/
├── pages/
│   ├── admin/
│   ├── auth/
│   ├── cart/
│   ├── checkout/
│   ├── home/
│   ├── order-complete/
│   ├── partner-listings/
│   ├── payment-return/
│   ├── product-detail/
│   ├── profile/
│   ├── seller-store/
│   └── static/
├── widgets/
├── entities/
└── shared/
```

## Количественные метрики

- TypeScript-файлов в `frontend/src` и `backend/src`: `207`
- TypeScript-файлов во фронтенде: `150`
- TypeScript-файлов в бэкенде: `57`

## Что ещё остаётся зоной внимания

- Во фронтенде всё ещё есть крупные feature-файлы:
  - `pages/partner-listings/partner-listings.components.tsx`
  - `pages/admin/catalog-suggestions/catalog-suggestions.modals.tsx`
  - `pages/static/partnership/PartnershipPage.tsx`
  - `pages/product-detail/product-detail.sections.tsx`
- На бэкенде сохраняются большие доменные роуты:
  - `backend/src/modules/partner/partner.listings.routes.ts`
  - `backend/src/modules/admin/admin.complaints.routes.ts`
  - `backend/src/modules/catalog/catalog.routes.ts`
  - `backend/src/modules/profile/profile.orders.routes.ts`

## Оценка результата

Рефакторинг решил главную задачу: структура стала предсказуемой. Теперь по пути к файлу можно понять его уровень ответственности без чтения содержимого. Следующие улучшения, если понадобятся, уже должны идти не в сторону нового глобального переноса, а в сторону локальной декомпозиции самых крупных feature-файлов.
