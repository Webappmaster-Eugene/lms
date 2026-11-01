---
title: DELETE и TRUNCATE: удаление строк
slug: sql-dml-delete
minutes: 30
description: Как удалить строки по условию, по подзапросу и через DELETE ... USING, чем TRUNCATE отличается от DELETE и что происходит при удалении строк, на которые ссылаются другие таблицы.
tasks: sql-dml-delete-condition, sql-dml-delete-subquery, sql-dml-delete-using, sql-dml-delete-returning, sql-dml-delete-move, sql-dml-truncate-rebuild
---
DELETE удаляет строки, подходящие под условие WHERE. Как и в UPDATE, без WHERE удаляются все строки таблицы, и подтверждения никто не спросит. Перед удалением проверьте условие запросом SELECT с тем же WHERE.

```sql run=library
DELETE FROM books WHERE published_year < 1850;

SELECT id, title, published_year FROM books ORDER BY id;
```

Структура таблицы не меняется: удаляются только данные.

## Удаление по подзапросу

Условие может опираться на другую таблицу. Позиции отменённых заказов выбираются подзапросом:

```sql run=shop
DELETE FROM order_items
WHERE order_id IN (SELECT id FROM orders WHERE status = 'cancelled');

SELECT order_id, product_id FROM order_items ORDER BY order_id, product_id;
```

Заказ 3 отменён, поэтому его позиции пропали, а сам заказ остался в таблице `orders`.

## DELETE ... USING

Если для условия нужно соединить несколько таблиц, используйте USING. Это особенность PostgreSQL, она работает как FROM в UPDATE:

```sql run=shop
DELETE FROM order_items oi
USING orders o, customers c
WHERE o.id = oi.order_id
  AND c.id = o.customer_id
  AND c.city = 'Москва';

SELECT order_id, product_id FROM order_items ORDER BY order_id, product_id;
```

В MySQL то же пишется с JOIN: `DELETE oi FROM order_items oi JOIN orders o ON ... WHERE ...`. Результат тот же, запрос с IN тоже подойдёт в обоих СУБД, он просто длиннее при нескольких условиях.

## Внешние ключи при удалении

Внешний ключ защищает от «висячих» ссылок. Нельзя удалить строку, на которую ссылаются другие:

```sql run=library error
DELETE FROM authors WHERE id = 1;
```

У автора 1 есть книги, и PostgreSQL отказывает. Выходов три. Удалить сначала зависимые строки, затем главную. Перевести зависимые строки на другого автора или поставить им NULL. Либо заранее объявить внешний ключ с действием ON DELETE: CASCADE удаляет зависимые строки вместе с главной, SET NULL обнуляет ссылку. Каскад удобен и опасен: одно удаление может незаметно стереть много данных. Подробности о внешних ключах будут в разделе о структуре таблиц.

Правильная последовательность выглядит так:

```sql run=library
DELETE FROM books WHERE author_id = 5;
DELETE FROM authors WHERE id = 5;

SELECT id, full_name FROM authors ORDER BY id;
```

## RETURNING

Удалённые строки можно получить обратно, например чтобы записать их в журнал. Сортировку, как и в UPDATE, задают внешним запросом:

```sql run=company
WITH gone AS (
  DELETE FROM employees
  WHERE id = 12
  RETURNING id, full_name, salary
)
SELECT * FROM gone;
```

## Перенос строк одним запросом

Сочетание DELETE ... RETURNING и INSERT ... SELECT внутри WITH переносит строки между таблицами без промежутка, когда они уже удалены, но ещё не записаны:

```sql run=empty
CREATE TABLE queue (id integer PRIMARY KEY, payload text);
CREATE TABLE archive (id integer PRIMARY KEY, payload text);
INSERT INTO queue VALUES (1, 'a'), (2, 'b'), (3, 'c');

WITH moved AS (
  DELETE FROM queue WHERE id <= 2 RETURNING id, payload
)
INSERT INTO archive SELECT id, payload FROM moved;

SELECT 'queue' AS source, id, payload FROM queue
UNION ALL
SELECT 'archive', id, payload FROM archive
ORDER BY source, id;
```

## TRUNCATE

Команда TRUNCATE очищает таблицу целиком:

```sql run=empty
CREATE TABLE log (id integer PRIMARY KEY, message text);
INSERT INTO log VALUES (1, 'a'), (2, 'b'), (3, 'c');

TRUNCATE log;

SELECT count(*) AS rows_left FROM log;
```

TRUNCATE отличается от DELETE без WHERE так:

- Работает быстро даже на миллионах строк: файлы таблицы освобождаются целиком, а не строка за строкой.
- Не принимает WHERE: только вся таблица.
- Не запускает триггеры уровня строки.
- Может сбросить счётчики: с добавкой `RESTART IDENTITY` счётчик начнётся заново, по умолчанию он продолжает прежнюю нумерацию.
- Не работает, если на таблицу ссылаются внешние ключи других таблиц. Можно очистить связанные таблицы одной командой `TRUNCATE a, b` или добавить `CASCADE`, но он очищает и все ссылающиеся таблицы, поэтому используйте осторожно.

В PostgreSQL TRUNCATE выполняется внутри транзакции и откатывается, в отличие от MySQL, где эта команда фиксируется сразу и откатить её нельзя. О транзакциях рассказывает отдельный раздел курса.

Типичный сценарий: сводная таблица пересобирается целиком, поэтому её очищают TRUNCATE и заполняют заново через INSERT ... SELECT.

```sql run=empty
CREATE TABLE stats (day integer PRIMARY KEY, visits integer);
INSERT INTO stats VALUES (1, 100), (2, 150);

TRUNCATE stats;
INSERT INTO stats SELECT d, d * 10 FROM generate_series(1, 3) AS d;

SELECT * FROM stats ORDER BY day;
```
