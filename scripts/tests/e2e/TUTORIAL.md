# E2E Tutorial

## Что здесь сейчас есть
- `smoke-regression.e2e.mjs`: широкий сквозной smoke по API (auth, catalog, profile, partner, admin, concurrency).
- `critical-regression.e2e.mjs`: критичные регрессии (антифрод, инварианты checkout, блокировки активации, finance fields).
- `phase-a-critical-flows.e2e.mjs`: ключевые MVP-цепочки фазы A:
  - checkout + acceptance policy
  - partnership request -> admin approve -> seller access
  - payout profile submit -> admin verify

## Быстрый запуск e2e
```bash
npm run db:migrate:deploy
npm run db:seed
npm run test:e2e:smoke
npm run test:e2e:critical
npm run test:e2e:phasea
```

## Как смотреть e2e через UI
Важно: текущие e2e-скрипты API-ориентированные. UI-режим ниже нужен для визуального анализа и таймингов тех же бизнес-цепочек.

### 1) Поднять окружение
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

### 2) Открыть UI и включить измерения
- Открой `http://127.0.0.1:3000`.
- Открой DevTools -> `Network`.
- Включи `Preserve log`.
- Включи `Disable cache`.
- В таблице Network включи колонки `Status`, `Waterfall`, `Duration`.
- В фильтре введи `api/`, чтобы видеть только API.

### 3) Сценарий A: Checkout + Policy Acceptance
- Залогинься под buyer (`buyer1@ecomm.local / buyer123`).
- Добавь товар в корзину и перейди в checkout.
- На этапе policy acceptance отметь чекбокс политики.
- Заверши заказ.

Ожидаемые запросы:
- `GET /api/public/policy/current?scope=checkout` -> `200`
- `POST /api/profile/policy-acceptance` -> `201`
- `POST /api/profile/orders` -> `201`

### 4) Сценарий B: Partnership -> Admin Approve -> Seller Access
- Зайди как buyer и отправь партнерскую заявку.
- Перелогинься в админку, одобри заявку.
- Перелогинься тем же пользователем, проверь доступ к seller-функциям.

Ожидаемые запросы:
- `GET /api/public/policy/current?scope=partnership` -> `200`
- `POST /api/profile/policy-acceptance` -> `201`
- `POST /api/profile/partnership-requests` -> `201`
- `PATCH /api/admin/partnership-requests/:id` -> `200`
- `GET /api/partner/payout-profile` -> `200`

### 5) Сценарий C: Payout Profile Submit -> Admin Verify
- Залогинься под seller, заполни payout profile.
- Залогинься под admin, проверь/подтверди payout profile.
- Снова зайди под seller и проверь статус `verified`.

Ожидаемые запросы:
- `PUT /api/partner/payout-profile` -> `200` (status `pending`)
- `PATCH /api/admin/payout-profiles/:id` -> `200` (status `verified`)
- `GET /api/partner/payout-profile` -> `200` (status `verified`)

## Как анализировать тайминги
- Сортируй по `Duration` (самые медленные сверху).
- Смотри `Waterfall` для понимания последовательности.
- Если есть long tail, проверь:
  - это backend latency или сетевой/браузерный шум
  - есть ли повторные запросы из-за UI re-render
  - есть ли лишние запросы до действия пользователя

## Что считать тревожным
- `4xx/5xx` на happy-path шагах.
- Повторные `POST` без необходимости.
- Время ответа критичных шагов стабильно выше ~1-1.5s локально.

## Полезно для отчета
- В Network: `Save all as HAR with content`.
- Приложи HAR + список “медленных top-10 запросов” по Duration.
