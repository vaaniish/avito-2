# Матрица тестирования по рискам

Эта карта фиксирует, какие зоны проекта считаются критичными, на каком слое они ловятся, кто отвечает за них и в какой gate они входят.

## Ворота

- `pr` — encoding, auth/session preflight, build, unit, integration, API critical e2e
- `main` — всё из `pr` + UI smoke + visual smoke + perf/security critical
- `pre-release` — полный critical regression + выбранный широкий smoke + ручной чеклист

## Матрица покрытия

| Фича / домен | Основной риск | Главный слой | Поддерживающие слои | Владелец | Gate |
| --- | --- | --- | --- | --- | --- |
| Auth / session / roles | захват аккаунта, сломанная матрица доступа | unit, integration, api e2e | ui smoke, security | backend | `pr`, `main`, `pre-release` |
| Catalog / product / seller storefront | мёртвые маршруты, broken deeplink, потеря точек входа в покупку | api e2e, ui smoke | visual smoke | frontend + backend | `pr`, `main`, `pre-release` |
| Cart / checkout / order lifecycle | потеря выручки, невалидные заказы, зависшие статусы | unit, integration, api e2e | ui critical, perf | backend | `pr`, `main`, `pre-release` |
| Partner listing lifecycle | невалидная публикация, потеря moderation state | unit, integration, api e2e | ui critical, visual smoke | backend + frontend | `pr`, `main`, `pre-release` |
| Moderation / complaints / sanctions | потеря доверия, непоследовательное применение санкций | unit, integration, api e2e | ui critical | backend | `pr`, `main`, `pre-release` |
| Notifications / realtime / target URLs | потерянные события, битая навигация | unit, integration | ui smoke | backend + frontend | `pr`, `main`, `pre-release` |
| Partnership / payout / policy acceptance | рассинхрон доступа, блокировка выплат, compliance-пробелы | unit, integration, api e2e | ui critical | backend | `pr`, `main`, `pre-release` |
| Profile / account tabs | пустые экраны, мёртвая навигация, сломанные состояния | ui smoke | visual smoke | frontend | `main`, `pre-release` |
| Admin panel critical flows | паралич модерации, скрытые регрессии | integration, api e2e | ui critical, visual smoke | backend + frontend | `pr`, `main`, `pre-release` |
| UX / responsive shells | сломанные CTA, overflow, trap в модалках | ui smoke, visual smoke | ручной чеклист | frontend | `main`, `pre-release` |
| Performance budgets | медленный критичный путь, деградация UX | perf | ui smoke | platform | `main`, `pre-release` |
| Security / abuse / idempotency | escalation, bypass, дубли действий | security, api e2e | integration | backend | `main`, `pre-release` |

## Правила по слоям

- `unit` — только чистая бизнес-логика; быстро и детально по edge cases
- `integration` — route + DB + audit + notification persistence + policy enforcement
- `e2e api` — полные бизнес-цепочки по HTTP с проверкой постусловий
- `e2e ui` — критичные пользовательские, партнёрские и админские browser flows
- `visual smoke` — ключевые экраны и явные layout-регрессии
- `non-functional` — latency budgets, безопасность auth/session, retries/idempotency, degraded dependency behavior

## Волны приоритетов

- Волна 1 — P0 backend/API + notifications + moderation + checkout chain + PR gate hardening
- Волна 2 — UI smoke/critical для user, admin и partner flows + responsive и visual smoke
- Волна 3 — расширенные negative paths + perf budgets + борьба с flaky + формальный pre-release checklist
