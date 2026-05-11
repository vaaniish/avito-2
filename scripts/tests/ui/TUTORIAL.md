# Руководство по UI и visual-тестам

## Наборы

- `npm run test:e2e:ui:smoke` — открытие ключевых маршрутов и базовая навигация
- `npm run test:e2e:ui:critical` — критичные пользовательские, партнёрские и админские browser flows
- `npm run test:visual:smoke` — screenshots и layout-assertions на ключевых экранах

## Требования

- Backend и frontend поднимаются через `playwright.config.ts`
- Для локального прогона нужна seeded local database
- Для CI нужен `npx playwright install --with-deps chromium`

## Что здесь проверяется

- отсутствие blank screen и `pageerror`
- отсутствие критичных console/runtime ошибок
- открытие ключевых маршрутов на desktop и mobile viewport
- перевод UI primary CTA в ожидаемое состояние
- отсутствие явного overflow и сломанного layout на критичных страницах

## Важно помнить

- UI-слой не заменяет API e2e
- P0-инварианты должны оставаться в `unit`, `integration` и `api e2e`
- `visual smoke` заточен под smoke-артефакты и очевидные layout-regression checks, а не под полный snapshot baseline всех страниц
