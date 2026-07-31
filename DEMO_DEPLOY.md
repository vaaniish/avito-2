# Локальный release-контур

Публичное развёртывание на этом этапе запрещено: документ не требует VPS,
домена, TLS, S3, платёжного договора или юридической модели. Демонстрационные
логины и пароли здесь намеренно не публикуются.

## Быстрая проверка

```bash
npm ci
npm run db:migrate:deploy
DEMO_SEED_CONFIRM=DELETE_LOCAL_DEMO_DATA npm run db:seed:demo
npm run test:release:local
```

`test:release:local` формирует `artifacts/release/local-release-report.json` и
последовательно проверяет сборку, security preflight, unit/integration/API,
чистые миграции, backup/restore, storage audit, Docker, Playwright и ручной
1000-VU профиль. Артефакты не попадают в Git.

Если в конкретной среде нет браузерного окна, Docker или времени для полного
perf-профиля, отдельный диагностический запуск можно выполнить с
`RELEASE_SKIP_UI=1`, `RELEASE_SKIP_DOCKER=1` или `RELEASE_SKIP_PERF=1`.
Такой отчёт содержит `SKIP` и не заменяет полный release gate.

## Production-like Compose

```bash
LOCAL_POSTGRES_USER=avito_local \
LOCAL_POSTGRES_PASSWORD='unique-local-password' \
LOCAL_POSTGRES_DB=avito_prodlike_test \
docker compose -f compose.production.local.yml up --build
```

Доступен только `http://127.0.0.1:8080`; PostgreSQL наружу не публикуется.
Остановка без удаления volume:

```bash
docker compose -f compose.production.local.yml down
```

Это локальная проверка образов, Nginx и миграций, а не production deployment.
