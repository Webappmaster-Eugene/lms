---
title: DROP TABLE, TRUNCATE и переименование
slug: sql-ddl-drop-rename
minutes: 20
description: Как удалить таблицу и все её зависимости, очистить таблицу командой TRUNCATE со сбросом счётчика и переименовать таблицу, ограничение или индекс.
tasks: sql-ddl-drop-if-exists, sql-ddl-drop-cascade, sql-ddl-rename-table, sql-ddl-truncate-restart
---
Последние операции со структурой: убрать лишнее и дать вещам правильные имена. Они короткие, но опасные: ошибка в одной команде удалит таблицу целиком.

## DROP TABLE

```sql run=empty
CREATE TABLE scratch (id integer);
DROP TABLE scratch;
SELECT count(*) AS tables_left FROM information_schema.tables WHERE table_name = 'scratch';
```

DROP TABLE удаляет таблицу вместе с данными, индексами и ограничениями. Вернуть её можно только из резервной копии. Если таблицы нет, команда завершается ошибкой, и повторный запуск скрипта падает. Слова `IF EXISTS` делают команду безопасной:

```sql run=empty
DROP TABLE IF EXISTS no_such_table;
SELECT 'ошибки нет' AS result;
```

PostgreSQL в этом случае выводит замечание о том, что таблицы нет, и спокойно идёт дальше. Удалить несколько таблиц можно одной командой, перечислив их через запятую: `DROP TABLE IF EXISTS a, b, c`.

## Зависимые объекты и CASCADE

Если на таблицу ссылаются внешние ключи или представления, PostgreSQL откажется её удалять, чтобы не сломать зависимые объекты:

```sql run=library error
DROP TABLE authors;
```

Сообщение называет, что мешает. Есть два пути: сначала удалить зависимое самому, или добавить CASCADE.

```sql run=library
DROP TABLE authors CASCADE;
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'authors') AS authors_tables,
  (SELECT count(*) FROM books) AS books_count,
  (SELECT count(*) FROM pg_constraint WHERE conrelid = 'books'::regclass AND contype = 'f') AS foreign_keys;
```

CASCADE удалил таблицу `authors` и внешний ключ в `books`, но сами книги остались. Он удаляет зависимые ограничения и представления, а не таблицы с данными. Прежде чем писать CASCADE, прочитайте сообщение об ошибке без него: оно перечисляет всё, что будет затронуто. Противоположное слово - `RESTRICT` - значит отказ при наличии зависимостей, и это поведение по умолчанию.

## TRUNCATE

Если из таблицы нужно убрать все строки, а саму таблицу оставить, обычно думают о `DELETE FROM таблица`. Но есть команда быстрее:

```sql run=shop
CREATE TABLE temp_orders AS SELECT * FROM orders;
TRUNCATE temp_orders;
SELECT count(*) AS rows_left FROM temp_orders;
```

TRUNCATE не просматривает строки по одной, а освобождает таблицу сразу, поэтому на больших таблицах она на порядки быстрее DELETE. Взамен у неё ограничения: нет условия WHERE, а таблицы, на которые ссылаются внешние ключи, нельзя очистить без `CASCADE`. В MySQL TRUNCATE сбрасывал счётчик автоматически. В PostgreSQL по умолчанию он продолжает счёт, а сбросить его нужно явно:

```sql run=shop
CREATE TABLE waitlist (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer text NOT NULL
);
INSERT INTO waitlist (customer) SELECT full_name FROM customers ORDER BY id;
TRUNCATE waitlist RESTART IDENTITY;
INSERT INTO waitlist (customer) SELECT full_name FROM customers WHERE city = 'Москва' ORDER BY id;
SELECT * FROM waitlist ORDER BY id;
```

Номера начинаются с единицы. Без `RESTART IDENTITY` они продолжились бы с седьмого. Ещё одно отличие от DELETE: в PostgreSQL TRUNCATE можно откатить внутри транзакции, но он берёт блокировку всей таблицы, поэтому на загруженной базе его запускают осторожно.

## Переименование таблицы

```sql run=library
ALTER TABLE books RENAME TO publications;
SELECT id, title FROM publications ORDER BY id LIMIT 3;
```

В MySQL есть отдельная команда `RENAME TABLE`. В PostgreSQL используется ALTER TABLE ... RENAME TO. Данные остаются на месте, а внешние ключи и индексы продолжают работать: они привязаны к таблице, а не к имени. Правда, имена индексов и ограничений, построенные из старого названия, не меняются сами. После переименования `books` в `publications` ключ так и останется называться `books_pkey`. Его можно переименовать отдельно:

```sql run=library
ALTER TABLE books RENAME TO publications;
ALTER TABLE publications RENAME CONSTRAINT books_pkey TO publications_pkey;
SELECT conname FROM pg_constraint WHERE conrelid = 'publications'::regclass AND contype = 'p';
```

Индекс переименовывают командой `ALTER INDEX старое RENAME TO новое`, схему - `ALTER SCHEMA старая RENAME TO новая`, столбец - `ALTER TABLE ... RENAME COLUMN`. Перенести таблицу в другую схему можно командой `ALTER TABLE имя SET SCHEMA другая_схема`.

## Что запомнить

DROP TABLE IF EXISTS безопасен для повторного запуска. CASCADE убирает зависимые ограничения, но не данные соседних таблиц. TRUNCATE очищает таблицу целиком и быстро, а счётчик сбрасывается только с RESTART IDENTITY. Переименование меняет имя, но не имена индексов и ограничений.
