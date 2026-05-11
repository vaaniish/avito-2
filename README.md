# Avito-2

Монорепозиторий с фронтендом на `React + Vite` и бэкендом на `Express + Prisma`.

## Что находится в проекте

- `frontend/` — клиентское приложение.
- `backend/` — API, бизнес-логика и Prisma-схема.
- `scripts/` — тестовые, QA- и служебные сценарии.
- `docs/` — актуальная документация по структуре, аудиту и проверкам.

## Быстрый старт

1. Установить зависимости:
   `npm i`
2. Поднять PostgreSQL:
   `docker compose up -d`
3. Подготовить базу:
   `npm run db:push && npm run db:seed`
4. Запустить фронтенд и бэкенд:
   `npm run dev`

## Полезные команды
- `npm run dev:all` — запуск всего dev
- `npm run dev:frontend` — только фронтенд
- `npm run dev:backend` — только бэкенд
- `npm run build` — сборка фронтенда и бэкенда
- `npm run test:unit` — модульные тесты
- `npm run test:integration` — интеграционные тесты
- `npm run test:e2e:ui:smoke` — UI smoke на Playwright
- `npm run test:visual:smoke` — визуальный smoke
- `npm run db:generate` — генерация Prisma client
- `npm run db:migrate` — dev-миграции Prisma
- `npm run db:seed` — наполнение демо-данными
- `npm run db:push` — синхронизация схемы без миграции

## Переменные окружения

### Фронтенд

- `VITE_API_BASE_URL` — базовый URL API, по умолчанию `http://localhost:3001/api`
- `VITE_YANDEX_MAPS_API_KEY` — ключ для карт Яндекса

### Бэкенд

- `DATABASE_URL` — строка подключения к PostgreSQL
- `YOOKASSA_SHOP_ID` — тестовый магазин YooKassa
- `YOOKASSA_SECRET_KEY` — секрет YooKassa
- `YOOKASSA_RETURN_URL` — URL возврата после оплаты
- `YOOKASSA_API_URL` — URL API YooKassa
- `RUSSIAN_POST_API_BASE_URL` — базовый URL API Почты России
- `RUSSIAN_POST_API_PATH` — путь к tracking endpoint
- `RUSSIAN_POST_ACCESS_TOKEN` — токен Почты России
- `RUSSIAN_POST_USER_AUTH` — base64 `login:password` для `X-User-Authorization`
- `RUSSIAN_POST_API_TIMEOUT_MS` — таймаут запросов к Почте России

## Демо-аккаунты

- Обычный пользователь: `demo@ecomm.ru / demo123`
- Партнёр: `partner@ecomm.ru / partner123`
- Администратор: `admin@ecomm.ru / admin123`

## Актуальная документация

- [project.md](/Users/vanish/Documents/Study/avito-2/project.md) — краткая карта проекта
- [docs/architecture/frontend-structure.md](/Users/vanish/Documents/Study/avito-2/docs/architecture/frontend-structure.md) — правила структуры фронтенда
- [docs/audit/README.md](/Users/vanish/Documents/Study/avito-2/docs/audit/README.md) — актуальный набор audit-документов
