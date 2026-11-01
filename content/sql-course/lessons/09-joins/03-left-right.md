---
title: LEFT и RIGHT JOIN
slug: sql-joins-left-right
minutes: 25
description: Внешние соединения, сохраняющие строки без пары: поиск отделов без сотрудников, различие ON и WHERE, COUNT по столбцу правой таблицы и RIGHT JOIN.
tasks: sql-joins-left-department-counts, sql-joins-left-employee-department, sql-joins-left-empty-departments, sql-joins-left-customers-no-orders, sql-joins-left-product-category-label, sql-joins-left-authors-no-books, sql-joins-left-books-no-author, sql-joins-left-right-categories, sql-joins-left-on-vs-where
---
Внутреннее соединение теряет строки, у которых нет пары. Часто это нужно, но бывает и наоборот: показать все отделы, даже пустые, или все товары, даже не проданные. Для этого служит внешнее соединение. LEFT JOIN сохраняет все строки левой таблицы, то есть той, что записана до слова JOIN.

## LEFT JOIN

Выведем всех сотрудников с отделами, не теряя стажёра без отдела:

```sql run=company
SELECT e.full_name, d.name AS department
FROM employees e
LEFT JOIN departments d ON d.id = e.department_id
ORDER BY e.id;
```

Строк теперь двенадцать, по одной на каждого сотрудника. Для Виктора Зайцева пара не нашлась, и все столбцы правой таблицы в его строке равны NULL. Левая таблица в LEFT JOIN главная: из неё строки не теряются никогда. Если у строки левой таблицы нашлось несколько пар, она встретится несколько раз, как и при обычном соединении. Полное название, LEFT OUTER JOIN, означает то же, слово OUTER можно не писать.

Чтобы пустые значения выглядели понятно, их заменяют через COALESCE:

```sql run=company
SELECT e.full_name, COALESCE(d.name, 'Без отдела') AS department
FROM employees e
LEFT JOIN departments d ON d.id = e.department_id
WHERE e.id >= 10
ORDER BY e.id;
```

## Поиск строк без пары

Чтобы найти строки левой таблицы, у которых нет пары, добавляют проверку IS NULL по столбцу правой таблицы:

```sql run=company
SELECT d.name
FROM departments d
LEFT JOIN employees e ON e.department_id = d.id
WHERE e.id IS NULL;
```

Логика такая: пока пара есть, `e.id` заполнен, потому что первичный ключ не бывает пустым. Если пары нет, весь блок `e` состоит из NULL. Проверять нужно именно ключ или другой столбец с ограничением NOT NULL. Если проверить обычный необязательный столбец, например `e.email`, вы получите вместе с настоящими «без пары» и сотрудников, у которых почта просто не указана. Тот же приём найдёт покупателей без заказов, товары без категории, авторов без книг.

```sql run=library
SELECT a.full_name
FROM authors a
LEFT JOIN books b ON b.author_id = a.id
WHERE b.id IS NULL;
```

## Где ставить условие: ON или WHERE

Во внутреннем соединении безразлично, где условие. Во внешнем это два разных запроса. Нужно посчитать заказы покупателей, не считая отменённых, но оставить и тех, у кого заказов нет. Сравним два варианта. Условие в WHERE:

```sql run=shop
SELECT c.full_name, COUNT(o.id) AS orders_count
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.status <> 'cancelled'
GROUP BY c.id, c.full_name
ORDER BY c.id;
```

Полина Гусева, у которой нет заказов, исчезла из результата. Причина в порядке работы: сначала LEFT JOIN добавляет для неё строку, где `o.status` равен NULL, а потом WHERE проверяет `NULL <> 'cancelled'`. Результат сравнения с NULL не истина и не ложь, а неизвестность, и строка отбрасывается. Левое соединение этим WHERE превратилось во внутреннее.

Условие в ON:

```sql run=shop
SELECT c.full_name, COUNT(o.id) AS orders_count
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id AND o.status <> 'cancelled'
GROUP BY c.id, c.full_name
ORDER BY c.id;
```

Теперь отменённые заказы просто не считаются парой, а Полина остаётся с нулём. Правило такое: условие на правую таблицу, которое не должно удалять левые строки, пишется в ON. Условие на левую таблицу в WHERE безопасно.

## COUNT по столбцу правой таблицы

Подсчёт при LEFT JOIN несёт ловушку. Посчитаем сотрудников по отделам двумя способами:

```sql run=company
SELECT d.name, COUNT(*) AS with_star, COUNT(e.id) AS with_column
FROM departments d
LEFT JOIN employees e ON e.department_id = d.id
GROUP BY d.id, d.name
ORDER BY d.id;
```

У отдела «Аналитика» нет сотрудников, но COUNT(*) насчитал единицу: строка с пустой правой частью всё равно строка. COUNT(e.id) считает только непустые значения и честно показывает ноль. Поэтому при LEFT JOIN считайте по столбцу правой таблицы, лучше по её ключу. Остальные агрегаты ведут себя так же: SUM и AVG по группе из одних NULL возвращают NULL, и тут помогает COALESCE.

## RIGHT JOIN

RIGHT JOIN зеркален: сохраняются все строки правой таблицы.

```sql run=shop
SELECT c.title AS category, p.title AS product
FROM products p
RIGHT JOIN categories c ON c.id = p.category_id
ORDER BY c.id, p.id;
```

Категория «Книги» осталась с пустым товаром, хотя товаров в ней нет. Тот же результат даёт `categories c LEFT JOIN products p`, и на практике почти всегда используют LEFT JOIN, а таблицы меняют местами. Запрос читается слева направо: сначала главная таблица, потом то, что к ней присоединяется. RIGHT JOIN стоит знать, потому что вы встретите его в чужом коде, но писать его самому нужно редко. Среди нескольких соединений подряд смесь LEFT и RIGHT читать особенно трудно.

## Книги без автора

В базе библиотеки есть книга, у которой автор неизвестен: `author_id` пуст. Найти её можно так:

```sql run=library
SELECT b.title
FROM books b
LEFT JOIN authors a ON a.id = b.author_id
WHERE a.id IS NULL;
```

Книга ищется среди строк левой таблицы без пары. Проверять `b.author_id IS NULL` проще, но оно найдёт только книги с пустой ссылкой. Соединение найдёт ещё и книги, где ссылка есть, но ведёт в никуда, - при внешнем ключе это невозможно, но в базах без ограничений бывает.
