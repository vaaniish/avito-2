# Scripts Map

## Active Test Suites
- `scripts/tests/unit/*.unit.test.ts`: быстрые модульные проверки доменной логики.
- `scripts/tests/integration/*.integration.test.ts`: проверки интеграции с БД и инфраструктурными слоями.
- `scripts/tests/e2e/smoke-regression.e2e.mjs`: широкий smoke-регресс API.
- `scripts/tests/e2e/critical-regression.e2e.mjs`: критичные регрессы антифрода/заказов.
- `scripts/tests/e2e/phase-a-critical-flows.e2e.mjs`: 3 MVP-цепочки (checkout policy, partnership approve, payout verify).
- `scripts/tests/README.md`: обзор структуры тестов и запусков.
- `scripts/tests/e2e/TUTORIAL.md`: как смотреть e2e через UI и анализировать тайминги.
- `scripts/tests/unit/TUTORIAL.md`: как читать unit-тесты и разбирать падения.
- `scripts/tests/integration/TUTORIAL.md`: как запускать/анализировать integration с БД.

## Active QA / Quality
- `scripts/qa/phase-a.qa.mjs`: полный Phase A прогон (db migrate + seed + unit + integration + preflight + build + e2e).
- `scripts/quality/security-preflight.session.ts`: проверка production-конфига session token.
- `scripts/quality/encoding-no-bom.mjs`: проверка/исправление BOM в текстовых файлах.

## Active Performance
- `scripts/perf/stage9-db.perf.mjs`: DB-производительность и explain-бенчмарки.
- `scripts/perf/stage10-http.perf.mjs`: HTTP latency gate.
- `scripts/perf/profile-render-stress.perf.ts`: стресс-тест рендера Profile UI.

## Legacy Utility Scripts
- `scripts/*.py` (например `fix_section_3_1.py`): утилиты под старые задачи редактирования документации, не входят в QA-цепочку и CI.
