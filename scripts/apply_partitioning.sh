#!/bin/bash
# Этот скрипт применяет секционирование к таблице AuditLog.

# Имя контейнера Docker с базой данных PostgreSQL
CONTAINER_NAME="avito-2-db-1"

# Проверка, запущен ли контейнер
if [ ! "$(docker ps -q -f name=$CONTAINER_NAME)" ]; then
    echo "Ошибка: Контейнер '$CONTAINER_NAME' не запущен."
    echo "Пожалуйста, запустите базу данных с помощью 'docker-compose up -d'"
    exit 1
fi

echo "Применение секционирования к таблице AuditLog..."

# Выполнение SQL-скрипта внутри контейнера
docker exec -i "$CONTAINER_NAME" psql -U user -d avito-db < "$(dirname "$0")/partition_setup.sql"

echo "Секционирование успешно применено."
echo "ВАЖНО: Основной ключ таблицы 'AuditLog' был изменен на ('id', 'timestamp'), что может повлиять на работу Prisma."
