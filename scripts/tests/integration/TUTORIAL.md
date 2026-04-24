# Integration Tests Tutorial

## Что здесь сейчас есть
- `policy-acceptance.integration.test.ts`: жизненный цикл acceptance политики в связке `service + DB`:
  - отсутствие acceptance
  - rejection при policy mismatch
  - успешный acceptance
  - проверка записей в БД (accepted_ip / accepted_ua)

## Когда запускать
- После изменений в БД-схеме и policy-логике.
- Перед e2e, чтобы убедиться, что слой `модуль + БД` не сломан.

## Как запускать
```bash
npm run db:migrate:deploy
npm run db:seed
npm run test:integration
```

## Как анализировать
- Integration не “кликаются” через UI, это проверка реального взаимодействия с БД.
- Если тест падает:
  - проверь сиды и миграции
  - проверь, что тест идёт в локальную/безопасную БД
  - проверь ограничения и уникальные индексы, связанные с тестовым кейсом

## Практика в Agile
- Integration-тесты должны проверять только важные связки.
- Для каждой критичной БД-логики держи отдельный тест-кейс “happy + rejection”.
