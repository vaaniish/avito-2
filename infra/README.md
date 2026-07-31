# Бесплатная production-like подготовка

Эти файлы не выполняют production-развёртывание. Compose доступен только на
`127.0.0.1`, PostgreSQL не публикует порт, а backend работает из собранного кода.

## Локальная проверка

Задайте уникальные тестовые значения, затем запустите отдельный стек:

```bash
LOCAL_POSTGRES_USER=avito_local \
LOCAL_POSTGRES_PASSWORD='replace-with-a-unique-local-password' \
LOCAL_POSTGRES_DB=avito_prodlike_test \
docker compose -f compose.production.local.yml up --build
```

Проверка: `curl -fsS http://127.0.0.1:8080/health/ready`. Остановка не удаляет
volume: `docker compose -f compose.production.local.yml down`.

Полностью автоматизированный одноразовый smoke с отдельным project/volume:

```bash
npm run infra:validate
npm run infra:smoke
```

`infra:smoke` проверяет readiness через Nginx, непривилегированный UID backend и
отсутствие host-port у PostgreSQL, после чего удаляет только свой временный
`avito-release-smoke` volume.

## Миграции, backup и восстановление

Перед будущим обновлением сначала создаётся backup, затем запускается one-shot
migration target. Миграции аддитивны; откат означает возврат предыдущего образа
приложения, а не автоматический `down` schema migration.

```bash
npm run db:backup
npm run db:migrate:deploy
```

Тест восстановления разрешён только в локальную БД с `test`/`restore` в имени:

```bash
RESTORE_CONFIRM=RECREATE_LOCAL_TEST_DATABASE \
RESTORE_DATABASE_URL='postgresql://user:password@127.0.0.1:5432/avito_restore_test' \
npm run db:restore:test
```

Команда проверяет SHA-256, применяет отсутствующие миграции и запускает API
smoke. `DATABASE_URL` в stdout не выводится.

## Будущий сервер

- создать отдельного системного пользователя без shell-доступа к чужим данным;
- открыть firewall только для SSH, HTTP и HTTPS; PostgreSQL оставить во внутренней сети;
- скопировать unit из `infra/systemd`, заменить локальный Compose на итоговый deployment-файл;
- хранить `.env.production` с правами `0600`, не добавлять его в Git;
- перед запуском выполнить backup, затем migration job; откат кода не должен откатывать уже применённую аддитивную миграцию;
- TLS добавить после выбора домена через автоматически обновляемый сертификат;
- при остановке дать backend не менее `SHUTDOWN_TIMEOUT_MS`, затем проверить событие `shutdown_complete`.

Шаблон `infra/systemd/avito-2.service` — только инструкция. Перед будущим
использованием нужно заменить локальные имена/пути, проверить `systemd-analyze
verify`, выполнить `daemon-reload` и только затем вручную включать unit.

Пример будущего firewall для Ubuntu приводится только как инструкция и здесь не
исполняется: deny incoming, allow outgoing, allow OpenSSH, 80/tcp и 443/tcp.
