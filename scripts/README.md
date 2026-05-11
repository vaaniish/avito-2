# Карта сценариев `scripts/`

## Основные группы

- `scripts/tests/` — unit, integration, e2e и UI/visual проверки
- `scripts/qa/` — агрегирующие QA-прогоны
- `scripts/perf/` — замеры производительности
- `scripts/quality/` — служебные проверки качества
- `scripts/catalog/` — сценарии каталога и импорта справочных данных

## Тестовые сценарии

- `scripts/tests/unit/*.test.ts` — быстрые модульные проверки доменной логики
- `scripts/tests/integration/*.test.ts` — интеграционные проверки API, БД и ключевых связок
- `scripts/tests/e2e/*.mjs` — API e2e-регрессы
- `scripts/tests/ui/*.spec.ts` — Playwright UI и visual smoke

## QA и качество

- `scripts/qa/phase-a.qa.mjs` — агрегирующий сценарий Phase A
- `scripts/quality/security-preflight.session.ts` — проверка production-конфига session token
- `scripts/quality/encoding-no-bom.mjs` — проверка и исправление BOM

## Производительность

- `scripts/perf/stage9-db.perf.mjs` — DB/perf сценарии
- `scripts/perf/stage10-http.perf.mjs` — HTTP latency gate
- `scripts/perf/profile-render-stress.perf.ts` — стресс-рендер Profile UI

## Правило для документации

Если добавляется новый важный сценарий, он должен быть либо:

- встроен в существующую структуру `scripts/tests|qa|perf|quality`, либо
- отдельно описан здесь короткой строкой с назначением.
