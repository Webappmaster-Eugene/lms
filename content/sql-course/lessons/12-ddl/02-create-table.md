---
title: CREATE TABLE и типы данных
slug: sql-ddl-create-table
minutes: 25
description: Как создать таблицу с нужными столбцами и типами, чем отличаются text, varchar, numeric, date, timestamp и jsonb, и как создать таблицу из запроса или по образцу другой.
tasks: sql-ddl-create-reading-list, sql-ddl-create-types, sql-ddl-create-timestamps, sql-ddl-create-as-select, sql-ddl-create-like
---
Таблицу создаёт команда CREATE TABLE: имя таблицы и в скобках список столбцов, у каждого имя и тип. Столбцы перечисляют через запятую, а порядок, в котором вы их написали, станет порядком столбцов в таблице.

```sql run=empty
CREATE TABLE teachers (
  id integer,
  full_name text,
  hired_on date
);
INSERT INTO teachers VALUES (1, 'Нина Орлова', '2024-09-01');
SELECT * FROM teachers;
```

В MySQL к таблице добавляют `ENGINE=InnoDB` и кодировку. В PostgreSQL ничего подобного писать не нужно: хранилище одно, кодировка задана на уровне базы.

## Основные типы

Тип определяет, какие значения можно хранить и как с ними работать. Для начала хватает нескольких.

Целые числа: `integer` (до двух миллиардов с небольшим) и `bigint` (до девяти квинтильонов). Счётчикам и идентификаторам, которых может стать очень много, дают bigint, остальным хватает integer.

Дробные числа. Для денег и всего, что нужно считать точно, берут `numeric(10, 2)`: всего десять цифр, из них две после запятой. Типы с плавающей точкой (`real`, `double precision`) быстрее, но дают погрешность: сумма `0.1 + 0.2` в них не равна `0.3`, и сравнение ниже это показывает.

```sql run=empty
SELECT (0.1::double precision + 0.2::double precision) = 0.3::double precision AS float_equal,
       (0.1::numeric + 0.2::numeric) = 0.3::numeric AS exact_equal;
```

Строки. Тип `text` хранит строку любой длины. Тип `varchar(n)` ограничивает длину: строку длиннее n символов PostgreSQL не примет. По скорости они не отличаются, поэтому varchar(n) берут, только когда ограничение длины нужно по смыслу, например для кода из двух букв. Тип `char(n)` дополняет строку пробелами, и им почти не пользуются.

Логический тип `boolean` принимает `true`, `false` и NULL.

Даты и время. `date` хранит день, `timestamp` - день и время без часового пояса, `timestamptz` (полное имя `timestamp with time zone`) - момент времени. Внутри timestamptz хранит время в UTC, а при показе переводит его в часовой пояс сеанса. Для событий, которые случились в определённый момент, почти всегда берут timestamptz: тогда пользователи из разных городов видят правильное для себя время. Тип `timestamp` годится для значения «в 9:00 по местным часам», где пояс не важен.

Тип `jsonb` хранит документ JSON в разобранном виде. Он удобен для данных, у которых нет постоянной структуры. Если вы часто ищете по одному и тому же полю документа, это поле лучше вынести в обычный столбец.

```sql run=empty
CREATE TABLE events (
  id integer,
  happened_at timestamptz,
  details jsonb
);
INSERT INTO events VALUES (1, '2026-02-03 10:15:00+00', '{"kind": "login", "ok": true}');
SELECT id, happened_at, details ->> 'kind' AS kind FROM events;
```

## Какие типы получились

Что вы создали, показывает `information_schema.columns`. Это аналог DESCRIBE из MySQL и команды `\d` в psql:

```sql run=empty
CREATE TABLE price_list (
  sku varchar(20),
  title text,
  price numeric(10, 2),
  in_stock boolean,
  added_on date
);
SELECT column_name, data_type, character_maximum_length, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_name = 'price_list'
ORDER BY ordinal_position;
```

В `data_type` стоит имя типа, длину varchar показывает `character_maximum_length`, а точность numeric - `numeric_precision` и `numeric_scale`. Порядок столбцов определяет `ordinal_position`.

## IF NOT EXISTS и временные таблицы

Повторный CREATE TABLE с тем же именем завершается ошибкой. Слова `IF NOT EXISTS` делают команду безопасной для повторного запуска: если таблица есть, PostgreSQL ничего не делает:

```sql run=empty
CREATE TABLE tags (id integer, name text);
CREATE TABLE IF NOT EXISTS tags (id integer, name text);
SELECT count(*) AS tags_tables FROM information_schema.tables WHERE table_name = 'tags';
```

IF NOT EXISTS не сравнивает структуру. Если таблица `tags` была создана с другими столбцами, команда этого не заметит.

Временная таблица `CREATE TEMP TABLE` живёт до конца сеанса и видна только ему. Её используют для промежуточных расчётов, когда не хочется оставлять следов в схеме.

## Таблица из запроса

Часто нужна таблица, которую можно сразу заполнить результатом запроса. Для этого есть CREATE TABLE ... AS:

```sql run=shop
CREATE TABLE expensive_products AS
SELECT id, title, price FROM products WHERE price >= 50000;
SELECT * FROM expensive_products ORDER BY id;
```

Столбцы и их типы новая таблица берёт из запроса. Первичного ключа, ограничений и индексов исходной таблицы она не получает: это только снимок данных. В MySQL тот же приём писали как `CREATE TABLE ... SELECT`, а команда `SELECT INTO` в PostgreSQL тоже создаёт таблицу, а не вставляет в существующую, поэтому её лучше не использовать.

Чтобы получить структуру другой таблицы без данных, пишут `LIKE`:

```sql run=company
CREATE TABLE departments_copy (LIKE departments INCLUDING ALL);
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'departments_copy'
ORDER BY ordinal_position;
```

Без INCLUDING ALL скопируются только столбцы и их типы. С ним добавятся ещё значения по умолчанию, ограничения NOT NULL, CHECK, первичный ключ и индексы. Внешние ключи не копируются ни в каком случае. Таблица `departments_copy` пуста: строки в неё добавляет отдельный INSERT ... SELECT.

## Частые ошибки

Тип с неудачной точностью: `numeric(4, 2)` вмещает значения до 99.99, и вставка 150.5 завершится ошибкой «numeric field overflow». Деньги в `real`: накапливается погрешность. Даты в `text`: строки сортируются по буквам, а не по календарю, и проверить корректность даты база уже не может.
