# Структура тестов

## Категории

- `unit` — проверка отдельных функций без БД и HTTP
- `integration` — проверка связки модулей с БД и инфраструктурой
- `e2e` — сквозные бизнес-цепочки через HTTP API
- `ui` — браузерные smoke и critical сценарии
- `visual` — smoke-проверки скриншотов и layout/regression на ключевых экранах
- `non-functional` — perf, security и reliability-прогоны отдельными quality gates

## Обучающие материалы

- `scripts/tests/e2e/TUTORIAL.md` — как запускать e2e и разбирать цепочки через UI
- `scripts/tests/integration/TUTORIAL.md` — как запускать и анализировать integration-тесты
- `scripts/tests/unit/TUTORIAL.md` — как запускать и анализировать unit-тесты
- `scripts/tests/ui/TUTORIAL.md` — как запускать browser UI и visual suites
- `scripts/tests/testing-matrix.md` — карта `feature -> risk -> layer -> owner -> gate`
- `scripts/tests/pre-release.checklist.md` — релизные ворота и ручной signoff

## Правила именования

- `*.unit.test.ts` — unit
- `*.integration.test.ts` — integration
- `*.e2e.mjs` — API e2e-сценарии
- `*.spec.ts` в `scripts/tests/ui` — Playwright UI и visual suites

## Основные команды

- `npm run test:unit`
- `npm run test:integration`
- `npm run test:e2e:api:smoke`
- `npm run test:e2e:api:critical`
- `npm run test:e2e:ui:smoke`
- `npm run test:e2e:ui:critical`
- `npm run test:visual:smoke`
- `npm run test:perf:critical`
- `npm run test:security:critical`
- `npm run test:pre-release`
- `npm run test:e2e:phasea`
- `npm run qa:phasea`
