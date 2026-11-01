---
title: Соединения с группировкой
slug: sql-joins-group
minutes: 25
description: Агрегаты после соединения: суммы и счётчики по связанным таблицам, группы без строк, размножение строк при нескольких соединениях и HAVING.
tasks: sql-joins-group-department-salary, sql-joins-group-order-totals, sql-joins-group-customer-spent, sql-joins-group-fanout, sql-joins-group-category-prices, sql-joins-group-prolific-authors, sql-joins-group-top-revenue, sql-joins-group-category-revenue
---
Самые полезные отчёты получаются, когда соединение сочетается с группировкой: выручка по категориям, число заказов у каждого покупателя, фонд зарплаты по отделам. Порядок работы запроса при этом важно держать в голове: сначала FROM и JOIN собирают строки, потом WHERE их фильтрует, затем GROUP BY складывает их в группы, HAVING фильтрует группы, и только после этого вычисляются выражения SELECT и применяются ORDER BY и LIMIT.

## Агрегат по соединённым таблицам

Фонд зарплаты по отделам:

```sql run=company
SELECT d.name AS department, SUM(e.salary) AS total_salary
FROM departments d
JOIN employees e ON e.department_id = d.id
GROUP BY d.id, d.name
ORDER BY total_salary DESC, d.id;
```

Соединение даёт строку на каждого сотрудника с названием его отдела, группировка склеивает строки с одним отделом, SUM складывает зарплаты. В GROUP BY указан номер отдела вместе с названием. Название в SELECT должно быть либо в GROUP BY, либо внутри агрегата. Номер отдела добавляют на случай, если у двух отделов будет одинаковое название: группировка по одному названию слила бы их.

Сумма заказа - тоже соединение с группировкой. Цена и количество лежат в позициях, а заказ - отдельная таблица:

```sql run=shop
SELECT o.id AS order_id, SUM(oi.quantity * oi.price) AS total
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id
ORDER BY o.id;
```

Умножение количества на цену делается внутри SUM, построчно. Выражение SUM(quantity) * SUM(price) было бы ошибкой: сумма количеств, умноженная на сумму цен, ни к какой реальной величине не относится.

## HAVING после соединения

Условие на агрегат пишется в HAVING. Авторы с несколькими книгами:

```sql run=library
SELECT a.full_name, COUNT(*) AS books_count
FROM authors a
JOIN books b ON b.author_id = a.id
GROUP BY a.id, a.full_name
HAVING COUNT(*) > 1
ORDER BY books_count DESC, a.id;
```

WHERE здесь не подошёл бы: на момент его работы групп ещё нет, и считать нечего.

## Группы без строк

Внутреннее соединение теряет сущности без связанных строк. Отчёт «число сотрудников по отделам» не покажет пустой отдел. Чтобы показать, соединение делают левым, а считают по столбцу правой таблицы:

```sql run=shop
SELECT c.title AS category, COUNT(p.id) AS products, ROUND(AVG(p.price), 2) AS avg_price
FROM categories c
LEFT JOIN products p ON p.category_id = c.id
GROUP BY c.id, c.title
ORDER BY c.id;
```

У категории «Книги» товаров нет: COUNT(p.id) вернул ноль, а AVG - NULL. Для среднего ноль не годится: среднее от пустого набора не определено, и NULL честнее. А вот сумму пустого набора чаще хочется видеть нулём, и тогда помогает COALESCE:

```sql run=shop
SELECT c.full_name,
       COALESCE(SUM(oi.quantity * oi.price), 0) AS spent
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id AND o.status <> 'cancelled'
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY c.id, c.full_name
ORDER BY spent DESC, c.id;
```

Условие `o.status <> 'cancelled'` стоит в ON, чтобы отменённые заказы не считались, а покупатели без заказов остались. Если бы оно было в WHERE, Полина Гусева исчезла бы из отчёта.

## Ловушка: размножение строк

Самое неприятное в соединениях с группировкой - ошибки, при которых запрос выполняется и возвращает правдоподобные, но неверные числа. Они возникают из-за размножения строк.

Заказ 1 содержит две позиции. Посчитаем заказы покупателя Андрея Кравцова после соединения с позициями:

```sql run=shop
SELECT c.full_name, COUNT(o.id) AS naive_orders, COUNT(DISTINCT o.id) AS real_orders
FROM customers c
JOIN orders o ON o.customer_id = c.id
JOIN order_items oi ON oi.order_id = o.id
WHERE c.id = 1
GROUP BY c.id, c.full_name;
```

COUNT(o.id) насчитал пять заказов, хотя их три. Дело в том, что после соединения с позициями на каждый заказ приходится по строке на позицию: у заказов 1, 3 и 8 позиции две, одна и две, всего пять строк. COUNT(DISTINCT o.id) считает каждый заказ один раз и даёт верное число.

Ещё опаснее суммы. Если в одном запросе складывать значение из таблицы «одного» после соединения с таблицей «многих», значение умножится на число строк «многих». Вот сумма остатков на складе, которая к позициям не относится, но размножена ими:

```sql run=shop
SELECT SUM(p.stock) AS stock_after_join
FROM products p
JOIN order_items oi ON oi.product_id = p.id;
```

Остаток на складе посчитан по строкам позиций, а не по товарам, и каждый остаток вошёл в сумму столько раз, сколько товар продавался. Правильная сумма остатков:

```sql run=shop
SELECT SUM(stock) AS stock_total FROM products;
```

Общее правило: агрегируйте значения из той таблицы, чья гранулярность совпадает с гранулярностью строки после соединения. Если нужно сочетать агрегаты разных уровней, сначала вычисляют каждый отдельно (в подзапросе или CTE, этому посвящён отдельный раздел), и только потом соединяют результаты. Для счётчиков выручает COUNT(DISTINCT). Признак проблемы - результат больше, чем получается в самой таблице без соединения.

## Топ по агрегату

Три товара с наибольшей выручкой:

```sql run=shop
SELECT p.title AS product, SUM(oi.quantity * oi.price) AS revenue
FROM products p
JOIN order_items oi ON oi.product_id = p.id
GROUP BY p.id, p.title
ORDER BY revenue DESC, p.id
LIMIT 3;
```

Второй ключ сортировки, номер товара, нужен, чтобы при равной выручке граница тройки была определена однозначно.

## Выручка по категориям, включая пустые

Две левые связи подряд сохраняют категории, у которых нет проданных товаров:

```sql run=shop
SELECT c.title AS category, COALESCE(SUM(oi.quantity * oi.price), 0) AS revenue
FROM categories c
LEFT JOIN products p ON p.category_id = c.id
LEFT JOIN order_items oi ON oi.product_id = p.id
GROUP BY c.id, c.title
ORDER BY revenue DESC, c.title;
```

Категория «Книги» осталась с нулевой выручкой. Если бы второе соединение было обычным, она бы пропала.
