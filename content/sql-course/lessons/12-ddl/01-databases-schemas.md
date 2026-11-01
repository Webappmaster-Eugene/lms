---
title: Базы данных и схемы
slug: sql-ddl-databases-schemas
minutes: 20
description: Как создают и удаляют базы данных, чем схема отличается от базы, как PostgreSQL ищет таблицы по search_path и что в нём заменяет USE, SHOW DATABASES и SHOW TABLES.
tasks: sql-ddl-schema-archive, sql-ddl-search-path, sql-ddl-schema-drop, sql-ddl-two-schemas
---
До сих пор мы читали и меняли данные в готовых таблицах. Команды, которые создают и меняют сами таблицы, называют DDL (data definition language, язык описания данных). Сюда входят CREATE, ALTER и DROP. Начнём с самого верхнего уровня: базы данных и схемы.

## База данных

Один сервер PostgreSQL может хранить много баз данных. База - это отдельный мир: свои схемы, таблицы и настройки. Запрос в одной базе не видит таблицы другой. Создают и удаляют базы так:

```sql
CREATE DATABASE shop_dev;
DROP DATABASE shop_dev;
DROP DATABASE IF EXISTS shop_dev;
```

В тренажёре эти команды выполнить нельзя: у каждой задачи одна готовая база, и создать рядом вторую не получится. Поэтому в уроке они показаны без запуска. На своём компьютере они работают как написано. Удалить базу, к которой вы сейчас подключены, нельзя: сначала переключитесь на другую.

В MySQL после CREATE DATABASE выполняют `USE имя`, и дальше запросы идут в эту базу. В PostgreSQL такой команды нет: база выбирается при подключении. В клиенте psql переключиться можно командой `\c имя`. Остальные привычные команды MySQL тоже заменяются командами psql или запросами:

```text
SHOW DATABASES       ->  \l
USE shop_dev         ->  \c shop_dev
SHOW TABLES          ->  \dt
DESCRIBE products    ->  \d products
SHOW COLUMNS FROM t  ->  \d t
```

Команды с обратной косой чертой понимает только psql, это не SQL. Сервер их не получает, поэтому из приложения их не вызвать. Для приложения есть обычные запросы к каталогу information_schema, им посвящён отдельный раздел. Кое-что можно увидеть и сейчас:

```sql run=company
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

## Схема

Внутри базы таблицы раскладывают по схемам. Схема - это пространство имён: папка, в которой лежат таблицы, индексы и другие объекты. В MySQL слова «схема» и «база данных» означают одно и то же, в PostgreSQL это разные уровни: сервер, база, схема, таблица.

Любая новая база содержит схему `public`. Все таблицы курса лежат в ней. Полное имя таблицы состоит из схемы и таблицы через точку, и запрос `SELECT * FROM public.departments` значит то же, что `SELECT * FROM departments`.

Создать схему и положить в неё таблицу можно так:

```sql run=company
CREATE SCHEMA archive;
CREATE TABLE archive.old_departments AS
SELECT id, name FROM departments WHERE budget < 500000;
SELECT * FROM archive.old_departments ORDER BY id;
```

Схемы нужны, чтобы не смешивать объекты. Одно приложение может держать рабочие таблицы в `public`, отчёты в `reports`, а временные выгрузки в `staging`. Одно и то же имя таблицы допустимо в разных схемах: `y2025.orders` и `y2026.orders` - две разные таблицы.

Посмотреть список схем базы можно в `information_schema.schemata`:

```sql run=empty
CREATE SCHEMA reports;
SELECT schema_name
FROM information_schema.schemata
WHERE schema_name IN ('public', 'reports')
ORDER BY schema_name;
```

## Как PostgreSQL ищет таблицу

Если имя таблицы написано без схемы, PostgreSQL просматривает схемы по списку `search_path` и берёт первую, где нашёл такое имя. Новые объекты без указания схемы создаются в первой существующей схеме этого списка. Список можно посмотреть:

```sql run=empty
SHOW search_path;
```

На обычном сервере по умолчанию там стоит `"$user", public`: сначала схема с именем текущего пользователя, если такая есть, потом `public`. В тренажёре список состоит из одной схемы `public`. Список меняют командой SET, и действует она до конца сеанса:

```sql run=company
CREATE SCHEMA reports;
SET search_path TO reports, public;
CREATE TABLE city_list AS SELECT DISTINCT city FROM departments WHERE city IS NOT NULL;
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_name IN ('city_list', 'departments')
ORDER BY table_name;
```

Таблица `city_list` создана без имени схемы и попала в `reports`, потому что это первая схема в списке. А `departments` по-прежнему находится: поиск идёт дальше, в `public`. Если в двух схемах из списка есть таблица с одним именем, выигрывает та, что стоит раньше. Поэтому в рабочем коде надёжнее писать схему явно, а search_path настраивать осознанно.

## Удаление схемы

Пустую схему удаляет `DROP SCHEMA имя`. Если в схеме есть объекты, PostgreSQL откажется, чтобы вы не потеряли данные случайно:

```sql run=empty error
CREATE SCHEMA temp_area;
CREATE TABLE temp_area.notes (id integer);
DROP SCHEMA temp_area;
```

Чтобы удалить схему вместе с содержимым, добавляют CASCADE:

```sql run=empty
CREATE SCHEMA temp_area;
CREATE TABLE temp_area.notes (id integer);
DROP SCHEMA temp_area CASCADE;
SELECT count(*) AS schemas_left FROM information_schema.schemata WHERE schema_name = 'temp_area';
```

CASCADE удаляет всё, что лежит в схеме, без вопросов. Это удобно для временных схем и опасно для рабочих, поэтому перед такой командой стоит убедиться, что вы подключены к нужной базе. Слова `IF EXISTS` (`DROP SCHEMA IF EXISTS temp_area CASCADE`) делают команду безопасной для повторного запуска: если схемы нет, ошибки не будет.

## Что запомнить

База выбирается при подключении, схема - внутри базы. CREATE DATABASE и DROP DATABASE работают только вне тренажёра. Схемы создаёт CREATE SCHEMA, а ссылаются на их объекты через точку или через search_path. DROP SCHEMA без CASCADE не удалит непустую схему.
