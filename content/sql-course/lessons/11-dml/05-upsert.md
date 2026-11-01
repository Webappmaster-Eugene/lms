---
title: ON CONFLICT: вставка или обновление
slug: sql-dml-upsert
minutes: 30
description: Как вставить строку, если ключа ещё нет, и обновить её, если он есть: DO NOTHING, DO UPDATE, EXCLUDED, составной ключ и условие обновления.
tasks: sql-dml-upsert-skip, sql-dml-upsert-replace, sql-dml-upsert-add, sql-dml-upsert-composite, sql-dml-upsert-where
---
Обычный INSERT с уже существующим ключом завершается ошибкой. Но часто нужна другая логика: добавить строку, если такой ещё нет, а если есть, то ничего не делать или обновить её. Эту операцию называют upsert, от слов update и insert. В PostgreSQL она записывается как INSERT ... ON CONFLICT.

Для конфликта нужен уникальный ключ: первичный ключ или любое ограничение UNIQUE. Именно по нему база решает, что строка уже существует. В наших примерах это `id` в таблицах и пара `order_id, product_id` в `order_items`.

## DO NOTHING

Самый простой вариант: если строка с таким ключом есть, пропустить её без ошибки.

```sql run=library
INSERT INTO authors (id, full_name, country, birth_year)
VALUES (1, 'Другой Толстой', 'Россия', 1900), (7, 'Иван Бунин', 'Россия', 1870)
ON CONFLICT (id) DO NOTHING;

SELECT * FROM authors ORDER BY id;
```

Строка с `id` 1 уже существует, поэтому она осталась прежней, а строка с `id` 7 добавилась. Ошибки нет. В скобках после ON CONFLICT указывают столбец или столбцы ключа. Для DO NOTHING скобки можно опустить, тогда пропускается любой конфликт уникальности.

В MySQL то же делает `INSERT IGNORE`. Он опаснее: игнорирует и другие ошибки, например слишком длинный текст, превращая их в предупреждения. ON CONFLICT реагирует только на конфликт ключа.

## DO UPDATE и EXCLUDED

Чтобы при конфликте обновить существующую строку, используйте DO UPDATE SET. Значения новой строки, которую пытались вставить, доступны через псевдоним EXCLUDED:

```sql run=empty
CREATE TABLE inventory (
  sku text PRIMARY KEY,
  title text NOT NULL,
  qty integer NOT NULL
);
INSERT INTO inventory VALUES ('A-100', 'Кабель HDMI', 10), ('A-200', 'Кабель USB', 4);

INSERT INTO inventory (sku, title, qty)
VALUES ('A-200', 'Кабель USB-C', 12), ('C-300', 'Переходник', 7)
ON CONFLICT (sku) DO UPDATE
SET title = EXCLUDED.title, qty = EXCLUDED.qty;

SELECT * FROM inventory ORDER BY sku;
```

Строка `A-200` обновилась, а `C-300` вставилась. В MySQL это называется ON DUPLICATE KEY UPDATE, а новые значения берутся функцией `VALUES(столбец)` или в новых версиях через псевдоним строки.

Если писать в SET имя таблицы, оно означает старую строку. Поэтому можно сложить старое значение с новым:

```sql run=empty
CREATE TABLE inventory (
  sku text PRIMARY KEY,
  title text NOT NULL,
  qty integer NOT NULL
);
INSERT INTO inventory VALUES ('B-100', 'Адаптер питания', 0);

INSERT INTO inventory (sku, title, qty)
VALUES ('B-100', 'Адаптер питания', 20), ('E-500', 'Лампа', 15)
ON CONFLICT (sku) DO UPDATE
SET qty = inventory.qty + EXCLUDED.qty;

SELECT * FROM inventory ORDER BY sku;
```

Так оформляют приход товара: новый артикул заводится, а у существующего растёт остаток. Если написать `qty = EXCLUDED.qty`, старое количество потеряется.

## Составной ключ

Когда ключ состоит из двух столбцов, в скобках перечисляют оба:

```sql run=shop
INSERT INTO order_items (order_id, product_id, quantity, price)
VALUES (1, 5, 1, 990)
ON CONFLICT (order_id, product_id) DO UPDATE
SET quantity = order_items.quantity + EXCLUDED.quantity;

SELECT order_id, product_id, quantity, price
FROM order_items
WHERE order_id = 1
ORDER BY product_id;
```

В заказе 1 товар 5 уже был в количестве 2 штук. Теперь их 3, а цена прежняя: в SET её нет.

Если нужно сослаться на ограничение по имени, пишут `ON CONFLICT ON CONSTRAINT имя_ограничения`. Без указания цели DO UPDATE не работает: база должна знать, какой ключ считать конфликтом.

## Условие в DO UPDATE

После SET можно поставить WHERE, и обновление произойдёт только если условие истинно. Если оно ложно, строка остаётся прежней, и ошибки нет:

```sql run=shop
INSERT INTO products (id, title, category_id, price, stock, added_on)
VALUES
  (1, 'Ноутбук Air 13', 1, 79990, 7, '2025-11-02'),
  (3, 'Смартфон Lite', 2, 21990, 25, '2025-08-14'),
  (11, 'Мини-колонка', 3, 3490, 14, '2026-05-01')
ON CONFLICT (id) DO UPDATE
SET price = EXCLUDED.price
WHERE EXCLUDED.price < products.price;

SELECT id, title, price FROM products WHERE id IN (1, 3, 11) ORDER BY id;
```

Цена товара 1 снизилась с 89990 до 79990 и обновилась. Цена товара 3 выросла, поэтому осталась старой. Товар 11 новый, он вставился.

## RETURNING у upsert

RETURNING работает и здесь. Он отдаёт вставленные и обновлённые строки, но не пропущенные из-за DO NOTHING или из-за ложного условия WHERE:

```sql run=empty
CREATE TABLE counters (name text PRIMARY KEY, hits integer NOT NULL);

INSERT INTO counters VALUES ('home', 1);

INSERT INTO counters (name, hits) VALUES ('home', 1), ('about', 1)
ON CONFLICT (name) DO UPDATE SET hits = counters.hits + 1
RETURNING name, hits;
```

## Ограничения

Одну и ту же строку нельзя затронуть дважды в одном запросе. Если в VALUES два раза встречается один и тот же ключ, DO UPDATE закончится ошибкой, потому что база не знает, какое значение считать итоговым. Заранее объедините такие строки группировкой.

Конфликт определяется только по тому ключу, который вы указали. Если у таблицы есть другое ограничение UNIQUE и новая строка нарушит его, запрос завершится ошибкой, как обычный INSERT.

## Другие способы

В MySQL есть ещё REPLACE: он удаляет старую строку и вставляет новую. Это меняет внутренний номер строки и может задеть связанные таблицы. В PostgreSQL REPLACE нет, и это хорошо: DO UPDATE меняет строку на месте. Начиная с PostgreSQL 15 есть и стандартная команда MERGE, но для типичных случаев ON CONFLICT проще и надёжнее.
