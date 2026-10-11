# Diploma / Avito-2

Маркетплейс: React + Vite, Express + Prisma, PostgreSQL.

## Восстановление после скачивания из Git

Нужен установленный и запущенный Docker Desktop (или Docker Engine с Compose).
Локальные Node.js, npm, PostgreSQL и реальные API-ключи не нужны.
Для первоначального импорта полного каталога выделить Docker не менее 6 ГБ RAM.

```bash
git clone https://github.com/vaaniish/avito-2.git
cd avito-2
./start-demo.sh
```

Открыть **http://localhost:8080**. Первый запуск скачивает зависимости и создаёт
демо-базу; наполнение большого каталога может занять несколько минут.

Скрипт использует `compose.demo.yml` и `infra/demo.env`, не читает личный `.env`.
PostgreSQL демо изолирован от остальных баз. Повторный запуск сохраняет
наполненную базу. Точные версии Docker-образов закреплены по SHA-256,
npm-зависимости — в `package-lock.json`.

Демо-аккаунты:

| Роль | Логин | Пароль |
| --- | --- | --- |
| Покупатель | `buyer1@ecomm.local` | `DemoBuyer2026!` |
| Партнёр | `seller1@ecomm.local` | `DemoSeller2026!` |
| Администратор | `admin@ecomm.local` | `DemoAdmin2026!` |

Каталог сохранён целиком в сжатом архиве в Git и восстанавливается с проверкой
контрольных сумм. Пользователи, объявления и заказы создаются демо-сценарием.
Платежи работают через локальную тестовую реализацию. Карты Яндекса и реальные
API оплаты/доставки требуют собственных действующих ключей; базовое приложение
и ручной ввод адреса работают без них. Этот сценарий предназначен для локальной
демонстрации.

Остановить, сохранив данные:

```bash
docker compose --env-file infra/demo.env -f compose.demo.yml down
```

Подробности восстановления, автономный архив и проверки: [RESTORE.md](RESTORE.md).

## Локальная разработка

Node.js 22.23.3 указан в `.nvmrc`. Следующие команды предназначены для новой
локальной development-базы; demo-seed очищает выбранную базу.

```bash
cp .env.example .env
npm ci
docker compose up -d
npm run catalog:restore
npm run db:migrate:deploy
DEMO_SEED_CONFIRM=DELETE_LOCAL_DEMO_DATA npm run db:seed:demo
npm run dev
```

Фронтенд: http://127.0.0.1:3000, API: http://127.0.0.1:3001.
Не перезаписывать существующий `.env` и не запускать demo-seed на базе,
содержимое которой нужно сохранить.

## Структура и команды

- `frontend/` — интерфейс.
- `backend/` — API, Prisma-схема, миграции и демо-сценарий.
- `data/archive/` — сохранённый каталог и его контрольные суммы.
- `scripts/` — проверки и служебные сценарии.
- `npm run build` — сборка интерфейса и API.
- `npm run test:fast` — unit/integration-проверки.
- `npm run test:e2e:api:critical` — основные сценарии API на отдельной тестовой базе.
- `npm run test:demo:ui` — браузерные smoke-проверки запущенного Docker-демо.
- `npm run ci:verify` — статические проверки и сборка.

Конфигурация внешних интеграций: `.env.example`. Шаблон production-настроек:
`infra/production.env.example`. Дополнительные инфраструктурные проверки:
[DEMO_DEPLOY.md](DEMO_DEPLOY.md).
