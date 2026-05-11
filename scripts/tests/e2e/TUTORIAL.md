# Руководство по E2E

## Что здесь есть

- `smoke-regression.e2e.mjs` — широкий сквозной smoke по API
- `critical-regression.e2e.mjs` — критичные регрессии
- `phase-a-critical-flows.e2e.mjs` — ключевые MVP-цепочки фазы A

## Быстрый запуск

```bash
npm run db:migrate:deploy
npm run db:seed
npm run test:e2e:smoke
npm run test:e2e:critical
npm run test:e2e:phasea
```

## Как смотреть те же цепочки через UI

Важно: текущие e2e-скрипты ориентированы на API. UI-режим ниже нужен для визуального анализа и таймингов тех же сценариев.

### 1. Поднять окружение

```bash
docker compose up -d db
npm run db:migrate:deploy
npm run db:seed
```

Терминал 1:

```bash
npm run dev:backend
```

Терминал 2:

```bash
npm run dev:frontend
```

### 2. Открыть UI и включить измерения

- Открыть `http://127.0.0.1:3000`
- Открыть `DevTools -> Network`
- Включить `Preserve log`
- Включить `Disable cache`
- Добавить колонки `Status`, `Waterfall`, `Duration`
- В фильтре ввести `api/`

### 3. Сценарий A: Checkout

- Залогиниться под buyer
- Добавить товар в корзину
- Перейти в checkout
- Завершить заказ

Ожидаемые запросы:

- `GET /api/public/policy/current?scope=checkout` -> `200`
- `POST /api/profile/orders` -> `201`

### 4. Сценарий B: Partnership -> Admin Approve -> Seller Access

- Отправить партнёрскую заявку
- Залогиниться в админку и одобрить её
- Вернуться под тем же пользователем и проверить seller-доступ

Ожидаемые запросы:

- `GET /api/public/policy/current?scope=partnership` -> `200`
- `POST /api/profile/policy-acceptance` -> `201`
- `POST /api/profile/partnership-requests` -> `201`
- `PATCH /api/admin/partnership-requests/:id` -> `200`
- `GET /api/partner/payout-profile` -> `200`

### 5. Сценарий C: Payout Profile Submit -> Admin Verify

- Залогиниться под seller и заполнить payout profile
- Залогиниться под admin и подтвердить payout profile
- Снова зайти под seller и проверить статус `verified`

Ожидаемые запросы:

- `PUT /api/partner/payout-profile` -> `200`
- `PATCH /api/admin/payout-profiles/:id` -> `200`
- `GET /api/partner/payout-profile` -> `200`

## Как анализировать тайминги

- Сортировать по `Duration`
- Смотреть `Waterfall` для понимания последовательности
- Проверять, нет ли повторных запросов из-за UI re-render
- Проверять, нет ли лишних сетевых вызовов до действия пользователя

## Что считать тревожным

- `4xx/5xx` на happy-path шагах
- Повторные `POST` без причины
- Стабильное время ответа критичных шагов выше `~1-1.5s` локально

## Что удобно прикладывать к отчёту

- HAR-файл из Network
- список самых медленных запросов по `Duration`
