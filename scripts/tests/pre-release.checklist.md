# Чеклист перед релизом

## Автоматические наборы

- `npm run test:unit`
- `npm run test:integration`
- `npm run test:e2e:api:critical`
- `npm run test:e2e:ui:critical`
- `npm run test:visual:smoke`
- `npm run test:perf:critical`
- `npm run test:security:critical`

## Ручной signoff

- Проверен happy path покупки на desktop web
- Проверен happy path покупки на mobile web viewport
- Проверены admin moderation и complaints review в браузере
- Проверена реакция seller на `approve / reject / pending moderation`
- Проверена панель уведомлений и переходы по критичным уведомлениям
- Проверены degraded-сценарии без внешних ключей `YANDEX_MAPS_*` и `DADATA_*`
- Зафиксированы известные исключения, временные skip и flaky-тесты
- Подтверждено, что visual artifacts просмотрены на key screens
- Подтверждено, что deleted/missing entity paths не дают `500` на базовых user actions
