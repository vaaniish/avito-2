#!/bin/bash
# Этот скрипт отменяет секционирование для таблицы AuditLog, возвращая ее к исходному состоянию.

# Имя контейнера Docker с базой данных PostgreSQL
CONTAINER_NAME="avito-2-db-1"

# Проверка, запущен ли контейнер
if [ ! "$(docker ps -q -f name=$CONTAINER_NAME)" ]; then
    echo "Ошибка: Контейнер '$CONTAINER_NAME' не запущен."
    echo "Пожалуйста, запустите базу данных с помощью 'docker-compose up -d'"
    exit 1
fi

echo "Отмена секционирования для таблицы AuditLog..."

# Выполнение SQL-скрипта внутри контейнера
docker exec -i "$CONTAINER_NAME" psql -U user -d avito-db < "$(dirname "$0")/partition_teardown.sql"

echo "Секционирование успешно отменено. Таблица 'AuditLog' восстановлена в исходное состояние."
