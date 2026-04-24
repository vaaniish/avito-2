# Tests Structure

## Categories
- `unit`: проверка отдельных функций без БД/HTTP.
- `integration`: проверка связки модулей с БД/инфраструктурой.
- `e2e`: сквозные бизнес-цепочки через HTTP API.

## Tutorials
- `scripts/tests/e2e/TUTORIAL.md`: как запускать e2e и как смотреть те же цепочки через UI (с таймингами в DevTools).
- `scripts/tests/integration/TUTORIAL.md`: как запускать и анализировать integration-тесты.
- `scripts/tests/unit/TUTORIAL.md`: как запускать и анализировать unit-тесты.

## Naming Rules
- `*.unit.test.ts` для unit.
- `*.integration.test.ts` для integration.
- `*.e2e.mjs` для e2e сценариев.

## Execution
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:e2e:smoke`
- `npm run test:e2e:critical`
- `npm run test:e2e:phasea`
- `npm run qa:phasea`
