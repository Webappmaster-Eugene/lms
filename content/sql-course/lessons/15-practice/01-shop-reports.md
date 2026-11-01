---
title: Отчёты по магазину
slug: sql-practice-shop-reports
minutes: 40
description: Как разобрать условие отчёта, с какой таблицы начать, как проверять промежуточный результат и не потерять строки при соединениях и группировке.
tasks: sql-practice-shop-customer-totals, sql-practice-shop-not-bought-in-march, sql-practice-shop-category-revenue, sql-practice-shop-orders-above-average, sql-practice-shop-above-category-average, sql-practice-shop-active-months, sql-practice-shop-order-composition, sql-practice-shop-days-to-first-order, sql-practice-shop-cancelled-share, sql-practice-shop-city-report
---
Настоящие задачи редко звучат как «примените LEFT JOIN». Их формулируют на языке бизнеса: сумма и число заказов по каждому покупателю, товары без продаж в марте, заказы крупнее среднего. Выбрать нужные средства из прошлых разделов приходится самому. Этот урок показывает порядок работы на таких отчётах и три ошибки, которые встречаются чаще всего.

## Как читать условие

Начните с вопроса: что будет одной строкой результата? В отчёте «по каждому покупателю» это покупатель, в отчёте «по каждому заказу» это заказ. От этого зависит, по чему делать GROUP BY и с какой таблицы начинать FROM. Таблица, чьи строки составляют результат, идёт первой, остальные присоединяются к ней.

Затем выпишите, откуда берётся каждый столбец. Имя покупателя лежит в `customers`, число заказов в `orders`, сумма в `order_items`. Если столбцы живут в разных таблицах, нужны соединения. Если в условии есть слова «в том числе без заказов» или «даже если», нужен LEFT JOIN от главной таблицы.

Наконец, найдите в условии фильтры и решите, к чему они относятся: к отбору строк до группировки (WHERE), к отбору групп (HAVING) или к условию соединения (ON).

## Проверяйте промежуточный результат

Не пишите весь запрос сразу. Соберите соединения без группировки и посмотрите на строки глазами. Например, для покупателя 1 заказы вместе с позициями выглядят так:

```sql run=shop
SELECT o.id AS order_id, o.status, oi.product_id, oi.quantity * oi.price AS amount
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.customer_id = 1
ORDER BY o.id, oi.product_id;
```

Видно, что у заказа 1 две строки: в нём два товара. Это первая ловушка.

## Размножение строк

После присоединения позиций заказ повторяется столько раз, сколько в нём позиций. Если теперь посчитать заказы через COUNT(*), получится число позиций:

```sql run=shop
SELECT c.full_name,
       COUNT(*) AS wrong_count,
       COUNT(DISTINCT o.id) AS orders_count
FROM customers c
JOIN orders o ON o.customer_id = c.id
JOIN order_items oi ON oi.order_id = o.id
GROUP BY c.id, c.full_name
ORDER BY c.full_name;
```

Столбец `wrong_count` завышен у каждого, у кого в заказах несколько позиций. Правило простое: если после присоединения таблицы «многие» единица верхнего уровня повторяется, считайте её через COUNT(DISTINCT ...). Сумма при этом не страдает, потому что каждая позиция входит в сумму один раз.

## Потерянные строки и NULL

Вторая ловушка в том, куда поставить условие при LEFT JOIN. Сравните два запроса. В первом статус проверяется в WHERE, во втором в ON:

```sql run=shop
SELECT c.full_name, COUNT(o.id) AS orders_count
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.status <> 'cancelled'
GROUP BY c.id, c.full_name
ORDER BY c.full_name;
```

```sql run=shop
SELECT c.full_name, COUNT(o.id) AS orders_count
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id AND o.status <> 'cancelled'
GROUP BY c.id, c.full_name
ORDER BY c.full_name;
```

В первом результате нет Полины Гусевой. У неё нет заказов, значит, после LEFT JOIN в `o.status` стоит NULL, сравнение с NULL не истинно, и WHERE выбрасывает строку. Условие в ON действует только на присоединяемые строки и покупателей не трогает. Запомните: фильтр по правой таблице левого соединения живёт в ON, иначе соединение превращается во внутреннее.

## Разбор: сумма и число заказов по каждому покупателю

Единица строки - покупатель, поэтому FROM начинается с `customers`. Заказы присоединяем слева, позиции тоже слева. Отменённые заказы исключаем условием в ON. Число заказов считаем через DISTINCT, сумму через SUM, а NULL у покупателя без заказов заменяем нулём:

```sql run=shop
SELECT c.full_name,
       COUNT(DISTINCT o.id) AS orders_count,
       COALESCE(SUM(oi.quantity * oi.price), 0) AS total_spent
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id AND o.status <> 'cancelled'
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY c.id, c.full_name
ORDER BY total_spent DESC, c.full_name;
```

В GROUP BY стоит и `c.id`, и `c.full_name`: имена могут совпасть у разных людей, а ключ различает их надёжно.

## Разбор: товары, которых не покупали в марте

Фраза «которых не было» почти всегда означает NOT EXISTS. Подзапрос ищет хотя бы одну позицию заказа за март для текущего товара, а внешний запрос оставляет товары, для которых таких позиций нет:

```sql run=shop
SELECT p.id, p.title
FROM products p
WHERE NOT EXISTS (
  SELECT 1
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.product_id = p.id
    AND o.ordered_at >= DATE '2026-03-01'
    AND o.ordered_at < DATE '2026-04-01'
)
ORDER BY p.id;
```

Месяц задан полуинтервалом: не раньше первого марта и строго раньше первого апреля. Так в него попадают заказы последнего дня с любым временем, чего не гарантирует BETWEEN с датой 31 марта.

## Разбор: заказы крупнее среднего

Среднее по заказам нельзя получить прямо из таблицы позиций: AVG от позиций даст среднюю позицию. Сначала нужна таблица с одной строкой на заказ, потом среднее по ней. Это удобно записать через WITH:

```sql run=shop
WITH totals AS (
  SELECT o.id AS order_id, SUM(oi.quantity * oi.price) AS total
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.status <> 'cancelled'
  GROUP BY o.id
)
SELECT order_id, total
FROM totals
WHERE total > (SELECT AVG(total) FROM totals)
ORDER BY total DESC, order_id;
```

Одна и та же временная таблица `totals` используется дважды: для списка и для среднего. Условие про отменённые заказы стоит внутри, чтобы и список, и среднее считались по одним и тем же заказам.

## Ничьи

Если отчёт требует «лучшего» или «первых трёх», сразу спросите себя: что будет при равных значениях? Условие задач в этом разделе называет второй ключ сортировки, обычно `id`, и вы должны добавлять его в ORDER BY. Без него LIMIT выдаёт любую из равных строк, а проверка на скрытых данных это заметит.

## Перед решением

Перед каждым запросом назовите вслух единицу строки результата и решите, где поставить фильтры. Если результат не сошёлся, уберите группировку и посмотрите на строки соединения.
