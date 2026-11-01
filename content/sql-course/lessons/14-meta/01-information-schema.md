---
title: information_schema и системный каталог
slug: sql-meta-information-schema
minutes: 25
description: Как запросами узнать, какие в базе таблицы, столбцы, ключи и индексы, и чем information_schema отличается от pg_catalog; замены SHOW TABLES, SHOW COLUMNS, SHOW INDEX и SHOW CREATE TABLE.
tasks: sql-meta-table-rows, sql-meta-null-columns, sql-meta-primary-keys, sql-meta-foreign-keys, sql-meta-date-columns, sql-meta-all-indexes
---
Описание самой базы хранится в самой базе, в таблицах и представлениях, которые можно читать обычным SELECT. Их называют метаданными: данные о данных. Благодаря им программа или человек может узнать, какие есть таблицы, из каких столбцов они состоят и как связаны, не заглядывая в код.

В MySQL для этого есть команды `SHOW TABLES`, `SHOW COLUMNS`, `SHOW INDEX`, `SHOW CREATE TABLE` и `DESCRIBE`. В PostgreSQL их нет. Вместо них работают запросы к двум источникам: схеме `information_schema` и системному каталогу `pg_catalog`. Кроме того, у клиента psql есть быстрые команды.

## information_schema

Схема `information_schema` создана по стандарту SQL, поэтому похожие запросы работают и в других базах. Её представления читаются как обычные таблицы. Главные из них: `tables`, `columns`, `table_constraints`, `key_column_usage`, `schemata`.

Список таблиц - замена SHOW TABLES:

```sql run=shop
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Условие `table_schema = 'public'` отсекает служебные таблицы самой базы, которые тоже лежат в information_schema. Столбец `table_type` различает обычные таблицы (`BASE TABLE`) и представления (`VIEW`).

Столбцы таблицы - замена SHOW COLUMNS и DESCRIBE:

```sql run=shop
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'products'
ORDER BY ordinal_position;
```

`ordinal_position` - номер столбца в таблице, по нему результат выстраивается в порядке объявления. `is_nullable` принимает значения `YES` и `NO`, а `column_default` содержит значение по умолчанию как текст.

## Ключи и ограничения

Ограничения лежат в `table_constraints`, а столбцы, к которым они относятся, в `key_column_usage`. Первичные ключи таблиц магазина:

```sql run=shop
SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
  AND kcu.table_schema = tc.table_schema
  AND kcu.table_name = tc.table_name
WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.ordinal_position;
```

Имя ограничения уникально только внутри таблицы, поэтому в соединении сравнивают не только его, но и схему с таблицей. Тип ограничения - `PRIMARY KEY`, `FOREIGN KEY`, `UNIQUE` или `CHECK`. Чтобы найти все внешние ключи, меняют условие на `FOREIGN KEY`. У order_items ключ составной: в результате два столбца с позициями 1 и 2.

## pg_catalog

Системный каталог `pg_catalog` - это внутренние таблицы PostgreSQL, из которых информация берётся в information_schema. Они работают быстрее, дают больше сведений, но названия и устройство специфичны для PostgreSQL. Самые полезные:

`pg_class` хранит таблицы, индексы и последовательности. `pg_attribute` - столбцы. `pg_constraint` - ограничения. `pg_indexes` - удобное представление индексов. `pg_namespace` - схемы.

Внешние ключи проще читать из `pg_constraint`, потому что там сразу видны и дочерняя, и родительская таблицы:

```sql run=shop
SELECT conrelid::regclass::text AS child_table,
       confrelid::regclass::text AS parent_table,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'f' AND connamespace = 'public'::regnamespace
ORDER BY child_table, definition;
```

Приведение `::regclass` превращает числовой идентификатор таблицы в её имя. Функция `pg_get_constraintdef` возвращает определение ограничения готовым текстом.

## Индексы и определение таблицы

Замена SHOW INDEX - представление `pg_indexes`:

```sql run=shop
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'order_items';
```

Полного аналога SHOW CREATE TABLE в виде запроса нет. Определение таблицы восстанавливают из метаданных или получают командой psql `\d+ имя_таблицы` либо утилитой `pg_dump --schema-only --table=имя`. Набор быстрых команд psql: `\dt` - список таблиц, `\d имя` - столбцы, ключи и индексы таблицы, `\di` - индексы, `\dn` - схемы, `\l` - базы. Они не SQL и работают только в psql, зато печатают всё сразу.

```text
\dt
\d products
\d+ products
\di
```

## Считаем строки в каждой таблице

Метаданные позволяют строить запросы по запросам. Чтобы узнать число строк во всех таблицах, нужно выполнить отдельный `SELECT count(*)` для каждой. Обычным SQL имя таблицы из столбца в FROM не подставить, но это умеет функция `query_to_xml`: она принимает текст запроса и возвращает результат в виде XML, а `xpath` достаёт из него значение. Текст запроса собирает `format`, где `%I` записывает имя как идентификатор:

```sql run=shop
SELECT table_name,
  (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I', table_name), false, true, '')))[1]::text::integer AS rows_count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

Тот же приём находит столбцы с пустыми значениями. Запрос обходит только столбцы, где NULL разрешён (`is_nullable = 'YES'`), и для каждого считает число пустых значений:

```sql run=company
SELECT column_name, nulls_count
FROM (
  SELECT column_name,
    (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I WHERE %I IS NULL', table_name, column_name), false, true, '')))[1]::text::integer AS nulls_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'employees' AND is_nullable = 'YES'
) t
ORDER BY column_name;
```

Внешний слой нужен, чтобы можно было дописать `WHERE nulls_count > 0`: псевдоним из списка SELECT в WHERE того же запроса использовать нельзя. Здесь `is_nullable` показывает, что столбец способен хранить NULL, а подсчёт - что он действительно его хранит.

## Что запомнить

Для переносимых запросов берите information_schema, для подробностей и скорости - pg_catalog. Всегда ограничивайте результат схемой `public` или нужной вам, иначе вы получите служебные объекты. Метаданные меняются командами DDL, а читаются обычным SELECT.
