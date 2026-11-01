---
title: ALTER TABLE: изменение таблицы
slug: sql-ddl-alter-table
minutes: 25
description: Как добавить, удалить и переименовать столбец, сменить тип, поставить или снять значение по умолчанию и NOT NULL, добавить и удалить ограничение у готовой таблицы.
tasks: sql-ddl-alter-add-column, sql-ddl-alter-drop-column, sql-ddl-alter-rename-column, sql-ddl-alter-type, sql-ddl-alter-default-not-null, sql-ddl-alter-add-constraints, sql-ddl-alter-swap-pk
---
Таблицы редко остаются неизменными: появляются новые поля, меняются требования. Команда ALTER TABLE меняет структуру готовой таблицы вместе с данными. Одна команда может содержать несколько действий через запятую, и тогда PostgreSQL выполнит их вместе.

## Добавить столбец

```sql run=shop
ALTER TABLE products ADD COLUMN discount_percent integer NOT NULL DEFAULT 0;
UPDATE products SET discount_percent = 15 WHERE stock = 0;
SELECT id, title, stock, discount_percent FROM products ORDER BY id;
```

Новый столбец встаёт в конец таблицы: поставить его в середину нельзя. Если таблица уже содержит строки, то для каждой из них нужно какое-то значение. Без DEFAULT там окажется NULL, а столбец с NOT NULL без DEFAULT добавить не получится: PostgreSQL не знает, что записать в старые строки. С DEFAULT все существующие строки получают это значение.

Если столбец может быть пустым, ничего добавлять не нужно:

```sql run=company
ALTER TABLE departments ADD COLUMN head_name text;
SELECT id, name, head_name FROM departments ORDER BY id;
```

Вычисляемый столбец, значение которого база считает сама из других столбцов, описывают так:

```sql run=shop
ALTER TABLE order_items ADD COLUMN line_total numeric(12, 2) GENERATED ALWAYS AS (quantity * price) STORED;
SELECT order_id, product_id, line_total FROM order_items ORDER BY order_id, product_id LIMIT 4;
```

Записать значение в такой столбец вручную нельзя, оно всегда следует за исходными.

## Удалить столбец

```sql run=shop
ALTER TABLE customers DROP COLUMN email;
SELECT column_name FROM information_schema.columns WHERE table_name = 'customers' ORDER BY ordinal_position;
```

Данные столбца пропадают безвозвратно. Индексы и ограничения самой таблицы, в которых участвовал столбец, удаляются вместе с ним. Если же на столбец ссылается внешний ключ другой таблицы или представление, PostgreSQL откажется, пока вы не добавите CASCADE. Слова `IF EXISTS` после DROP COLUMN подавляют ошибку, если столбца нет.

## Переименовать

```sql run=library
ALTER TABLE authors RENAME COLUMN birth_year TO born_year;
SELECT full_name, born_year FROM authors ORDER BY id LIMIT 3;
```

Данные не двигаются, но каждый запрос и каждая программа, которые обращались к старому имени, перестанут работать. Поэтому переименование согласуют с кодом приложения.

## Сменить тип

Тип столбца меняют так:

```sql run=company
ALTER TABLE employees ALTER COLUMN salary TYPE integer USING round(salary)::integer;
SELECT id, salary, pg_typeof(salary)::text AS salary_type FROM employees ORDER BY id LIMIT 3;
```

Слово USING объясняет, как получить новое значение из старого. Если PostgreSQL умеет приводить тип сам (например, из integer в bigint, из varchar в text или из numeric в integer), USING можно не писать. Если автоматического приведения нет, оно обязательно, например при переводе текста в число: `ALTER COLUMN code TYPE integer USING code::integer`. В MySQL для этого служила команда `MODIFY COLUMN`; в PostgreSQL она разбита на отдельные действия с ALTER COLUMN.

Смена типа обычно перезаписывает всю таблицу, и на больших таблицах это долго и блокирует работу. Уменьшение длины varchar или смена типа с потерей данных (например, из numeric в integer) может завершиться ошибкой или тихо потерять дробную часть, поэтому результат всегда проверяют.

## DEFAULT и NOT NULL

Значение по умолчанию ставят и снимают отдельными командами. Они влияют только на будущие вставки: старые строки остаются как были.

```sql run=company
ALTER TABLE departments ALTER COLUMN city SET DEFAULT 'не указан';
UPDATE departments SET city = 'не указан' WHERE city IS NULL;
ALTER TABLE departments ALTER COLUMN city SET NOT NULL;
SELECT id, name, city FROM departments ORDER BY id;
```

Для NOT NULL порядок важен: SET NOT NULL просматривает всю таблицу и падает, если пустые значения остались. Поэтому сначала заменяют их через UPDATE. Обратные команды: `DROP DEFAULT` и `DROP NOT NULL`.

## Добавить и удалить ограничение

Ограничение добавляют через ADD CONSTRAINT, и PostgreSQL проверяет уже лежащие строки:

```sql run=company
ALTER TABLE employees ADD CONSTRAINT employees_email_unique UNIQUE (email);
ALTER TABLE employees ADD CONSTRAINT employees_salary_positive CHECK (salary > 0);
SELECT conname, contype::text AS kind
FROM pg_constraint
WHERE conrelid = 'employees'::regclass AND contype IN ('u', 'c')
ORDER BY conname;
```

Если хоть одна строка нарушает условие, команда падает, и ограничение не появляется. Первичный и внешний ключи добавляют так же: `ADD PRIMARY KEY (id)` и `ADD FOREIGN KEY (author_id) REFERENCES authors (id)`.

Удаляют ограничение по имени. Имя по умолчанию строится как таблица, столбец и вид ограничения: для первичного ключа это `таблица_pkey`, для внешнего `таблица_столбец_fkey`, для UNIQUE `таблица_столбец_key`, для CHECK `таблица_столбец_check`. Узнать имя можно в pg_constraint, как в запросе выше.

```sql run=shop
ALTER TABLE order_items DROP CONSTRAINT order_items_pkey;
ALTER TABLE order_items ADD PRIMARY KEY (product_id, order_id);
SELECT pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'order_items'::regclass AND contype = 'p';
```

У таблицы может быть только один первичный ключ, поэтому старый приходится удалить до добавления нового. Заменить ключ не получится без короткого периода, когда его нет: на рабочей базе это делают в транзакции, чтобы другие сеансы не заметили промежутка.

## Несколько действий сразу

Несколько изменений одной таблицы можно записать одной командой через запятую. Для базы это один проход по таблице вместо двух:

```sql run=library
ALTER TABLE books
  ADD COLUMN isbn text,
  ALTER COLUMN title SET NOT NULL,
  DROP COLUMN genre;
SELECT column_name FROM information_schema.columns WHERE table_name = 'books' ORDER BY ordinal_position;
```

## Что запомнить

ALTER TABLE работает с данными на месте. Опасные действия: DROP COLUMN, смена типа и добавление ограничения к таблице с данными, которая может их нарушить. Перед ними проверяйте таблицу запросом: например, `SELECT count(*) FROM employees WHERE salary <= 0` покажет, пройдёт ли CHECK (salary > 0).
