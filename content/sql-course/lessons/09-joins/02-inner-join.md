---
title: INNER JOIN, ON и USING
slug: sql-joins-inner
minutes: 20
description: Внутреннее соединение подробно: условия в ON и WHERE, USING и NATURAL JOIN, соединение по неравенству и по диапазону, повторы строк после соединения.
tasks: sql-joins-inner-moscow-staff, sql-joins-inner-russian-books, sql-joins-inner-top-products, sql-joins-inner-shipped-customers, sql-joins-inner-line-totals, sql-joins-inner-active-moscow, sql-joins-inner-salary-grades
---
INNER JOIN оставляет в результате только те строки, для которых нашлась пара. Слово INNER можно не писать: `JOIN` и `INNER JOIN` означают одно и то же. Дальше речь о том, что можно писать в условии соединения, чем ON отличается от USING и почему NATURAL JOIN лучше не использовать.

## ON и WHERE

После соединения к результату применяются обычные WHERE, ORDER BY и LIMIT. Условия, которые относятся к одной из таблиц, пишут в WHERE:

```sql run=company
SELECT e.full_name, d.name AS department, e.salary
FROM employees e
JOIN departments d ON d.id = e.department_id
WHERE d.city = 'Москва' AND e.salary > 200000
ORDER BY e.id;
```

Для внутреннего соединения безразлично, где стоит условие, в ON или в WHERE: результат одинаков. Следующий запрос возвращает ровно то же самое:

```sql run=company
SELECT e.full_name, d.name AS department, e.salary
FROM employees e
JOIN departments d ON d.id = e.department_id AND d.city = 'Москва' AND e.salary > 200000
ORDER BY e.id;
```

Принято в ON писать то, что связывает таблицы, а в WHERE - то, что отбирает строки. Для LEFT JOIN это различие станет принципиальным, и привычка писать правильно сэкономит время.

## USING

Когда столбец, по которому соединяют, называется одинаково в обеих таблицах, запись можно сократить словом USING:

```sql run=empty
CREATE TABLE groups (group_id integer PRIMARY KEY, title text);
CREATE TABLE members (id integer PRIMARY KEY, name text, group_id integer REFERENCES groups (group_id));
INSERT INTO groups VALUES (1, 'Backend'), (2, 'Design');
INSERT INTO members VALUES (1, 'Аня', 1), (2, 'Боря', 1), (3, 'Вера', 2);

SELECT m.name, g.title, group_id
FROM members m
JOIN groups g USING (group_id)
ORDER BY m.id;
```

USING (group_id) означает то же, что `ON m.group_id = g.group_id`, но у результата появляется особенность: общий столбец в нём один, и в SELECT его пишут без префикса, как в примере выше. С префиксом (`m.group_id`) PostgreSQL тоже примет запись. Если имена различаются, как у `employees.department_id` и `departments.id`, USING не подходит, нужен ON. В MySQL USING работает так же.

Чтобы USING был применим, проектировщики часто называют внешний ключ так же, как первичный. Но в учебных базах курса принят другой стиль: первичный ключ везде просто `id`, а внешний называется по смыслу. Поэтому ON нужен чаще.

## NATURAL JOIN и почему его избегают

NATURAL JOIN сам выбирает столбцы для соединения: все, чьи имена совпадают в обеих таблицах. Звучит удобно, но смотрите, что получится у товаров и категорий:

```sql run=shop
SELECT *
FROM products
NATURAL JOIN categories;
```

В обеих таблицах есть `id` и `title`. NATURAL JOIN потребовал, чтобы совпадали оба: номер товара должен равняться номеру категории и название товара названию категории. Таких пар нет, и результат пуст. Настоящая связь, `products.category_id` с `categories.id`, в условие не попала вовсе, потому что имена различаются. Запрос не падает с ошибкой, а молча возвращает неверный ответ.

Опасность ещё и в будущем: если в одну из таблиц добавят столбец, совпавший по имени с чужим, условие соединения изменится само. Поэтому в рабочем коде пишут явный ON или USING.

## Соединение не только по равенству

Условие в ON - любое логическое выражение. Чаще всего это равенство ключей, но бывают и другие. Пусть есть таблица разрядов зарплаты, где у каждого разряда заданы границы:

```sql run=empty
CREATE TABLE staff (id integer PRIMARY KEY, full_name text, salary integer);
CREATE TABLE grades (label text PRIMARY KEY, min_salary integer, max_salary integer);
INSERT INTO staff VALUES (1, 'Анна', 70000), (2, 'Борис', 100000), (3, 'Вера', 150000), (4, 'Глеб', 200000);
INSERT INTO grades VALUES ('junior', 0, 99999), ('middle', 100000, 199999), ('senior', 200000, 999999);

SELECT s.full_name, s.salary, g.label
FROM staff s
JOIN grades g ON s.salary BETWEEN g.min_salary AND g.max_salary
ORDER BY s.id;
```

Общего ключа у таблиц нет: сотрудника с разрядом связывает вхождение зарплаты в диапазон. Это соединение по неравенству, и оно подходит для всего, что сопоставляется интервалами: тарифы по объёму, скидки по сумме заказа, возрастные группы. Границы диапазонов не должны пересекаться. Если зарплата попадёт в два разряда, сотрудник встретится в результате дважды.

## Повторы после соединения

Соединение приклеивает к строке все подходящие, и строк может стать больше, чем было. Вот покупатели, у которых есть неотменённые заказы:

```sql run=shop
SELECT c.full_name
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.status <> 'cancelled'
ORDER BY c.id;
```

Андрей Кравцов и Вера Тихонова встретились дважды, потому что у каждого по два таких заказа. Если нужен список покупателей без повторов, добавляется DISTINCT:

```sql run=shop
SELECT DISTINCT c.full_name
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.status <> 'cancelled'
ORDER BY c.full_name;
```

Здесь DISTINCT уместен. Но если повторы возникли неожиданно, а вы просто «лечите» их DISTINCT, значит, в соединении что-то не так: например, потеряно условие и строки множатся. Сначала разберитесь, откуда повторы.

## Несколько условий в ON

Условий в ON может быть сколько угодно, они соединяются через AND:

```sql run=shop
SELECT o.id AS order_id, c.full_name, o.status
FROM orders o
JOIN customers c ON c.id = o.customer_id AND c.city = 'Москва'
ORDER BY o.id;
```

Для внутреннего соединения здесь можно перенести условие по городу в WHERE. Для составных ключей, когда пара определяется двумя столбцами сразу, второе условие в ON обязательно.
