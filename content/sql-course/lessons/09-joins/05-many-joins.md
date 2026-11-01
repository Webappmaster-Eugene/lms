---
title: Соединение трёх и более таблиц
slug: sql-joins-many
minutes: 20
description: Цепочки из нескольких соединений: как читать такие запросы, как смешивать INNER и LEFT JOIN, как искать товары без заказов через промежуточную таблицу.
tasks: sql-joins-many-order-lines, sql-joins-many-cancelled-lines, sql-joins-many-with-category, sql-joins-many-accessory-buyers, sql-joins-many-unsold-products, sql-joins-many-customer-products, sql-joins-many-accessory-revenue
---
Данные, которые нужны запросу, часто разложены по трём-пяти таблицам. Название товара лежит в `products`, имя покупателя в `customers`, а связывают их `orders` и `order_items`. Соединения просто пишут одно за другим.

## Цепочка соединений

Выведем состав заказа с именем покупателя и названием товара:

```sql run=shop
SELECT o.id AS order_id, c.full_name AS customer, p.title AS product, oi.quantity
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN order_items oi ON oi.order_id = o.id
JOIN products p ON p.id = oi.product_id
WHERE o.id IN (1, 4)
ORDER BY o.id, p.id;
```

Читать такой запрос удобно по шагам. Берём заказ. К нему присоединяем покупателя по `customer_id`. Затем присоединяем позиции заказа по `order_id`. К каждой позиции присоединяем товар по `product_id`. Каждый следующий JOIN может ссылаться в ON на любую из уже подключённых таблиц. Последовательность в тексте задаёт порядок чтения, а не порядок, в котором база будет соединять: оптимизатор PostgreSQL переставит таблицы так, как считает выгодным, не меняя результата для внутренних соединений.

Когда таблиц много, помогает договорённость об именах и порядок написания. Начинайте с главной таблицы, то есть той, строки которой считаете, и двигайтесь по связям. Каждое условие ON пишите прямо под соответствующим JOIN. Тогда запрос читается как маршрут.

## Путь через промежуточную таблицу

Связь «многие ко многим» всегда проходит через промежуточную таблицу, и в запросе её нельзя пропустить. Товары и заказы напрямую не связаны, их соединяют `order_items`:

```sql run=shop
SELECT p.title AS product, o.id AS order_id, o.status
FROM products p
JOIN order_items oi ON oi.product_id = p.id
JOIN orders o ON o.id = oi.order_id
WHERE p.id = 5
ORDER BY o.id;
```

Чехол для смартфона встречается в двух заказах. Промежуточная таблица здесь работает как мост: один её ряд соответствует одной паре «заказ - товар».

## Категория проданного товара

Чем длиннее цепочка, тем важнее следить, не теряются ли строки. Вот позиции с категориями товаров:

```sql run=shop
SELECT oi.order_id, p.title AS product, c.title AS category
FROM order_items oi
JOIN products p ON p.id = oi.product_id
JOIN categories c ON c.id = p.category_id
ORDER BY oi.order_id, p.id;
```

Товар без категории выпал бы из такого результата. В учебных данных проданных товаров без категории нет, но в живой базе это обычная ситуация. Чтобы сохранить такие позиции, последнее соединение делают левым:

```sql run=shop
SELECT oi.order_id, p.title AS product, c.title AS category
FROM order_items oi
JOIN products p ON p.id = oi.product_id
LEFT JOIN categories c ON c.id = p.category_id
ORDER BY oi.order_id, p.id;
```

## Смешивание INNER и LEFT

Внешние соединения в цепочке нужно ставить осторожно. Если сначала LEFT JOIN, а после него обычный JOIN по столбцам правой таблицы, строки с NULL в этих столбцах не найдут пары и пропадут. Левое соединение окажется потерянным. Проверка простая: после LEFT JOIN все последующие соединения, которые зависят от правой таблицы, тоже должны быть левыми.

Покупатели с их товарами, включая тех, кто ничего не заказывал:

```sql run=shop
SELECT c.full_name AS customer, p.title AS product
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
LEFT JOIN order_items oi ON oi.order_id = o.id
LEFT JOIN products p ON p.id = oi.product_id
WHERE c.id >= 5
ORDER BY c.id, o.id, p.id;
```

Лев Комаров купил один смартфон, а Полина Гусева заказов не делала, и её строка осталась с пустым товаром. Если заменить любое из трёх соединений на обычное JOIN, Полина исчезнет.

## Фильтры по дальним таблицам

Условие в WHERE может ссылаться на любую таблицу цепочки. Выведем покупателей, которые покупали аксессуары:

```sql run=shop
SELECT DISTINCT cu.full_name
FROM customers cu
JOIN orders o ON o.customer_id = cu.id
JOIN order_items oi ON oi.order_id = o.id
JOIN products p ON p.id = oi.product_id
JOIN categories ca ON ca.id = p.category_id
WHERE ca.title = 'Аксессуары'
ORDER BY cu.full_name;
```

Пять таблиц, четыре соединения. Здесь псевдонимы особенно полезны: `cu` для покупателей и `ca` для категорий, чтобы не путать. DISTINCT нужен, потому что покупатель мог взять несколько аксессуаров, и каждый даёт свою строку.

## Поиск без пары через промежуточную таблицу

Товары, которых нет ни в одном заказе:

```sql run=shop
SELECT p.title
FROM products p
LEFT JOIN order_items oi ON oi.product_id = p.id
WHERE oi.order_id IS NULL
ORDER BY p.id;
```

Это всё тот же приём LEFT JOIN с IS NULL. Проверять нужно столбец промежуточной таблицы, который заведомо не пуст, например `order_id`. Таким же образом находят заказы без позиций или покупателей без отправленных заказов.

## Сколько строк получится в цепочке

Размер результата зависит от того, как множатся строки на каждом шаге. Заказ с тремя позициями даст три строки, а если к каждой позиции присоединить ещё и несколько связанных записей, строк станет больше. Прикидывать, сколько их получится, полезно заранее, особенно перед группировкой, о которой пойдёт речь в последнем уроке раздела.

Практический совет: пишите длинный запрос постепенно. Сначала два соединения и проверка результата, затем третье, затем четвёртое. Так сразу видно, на каком шаге строки пропали или размножились.
