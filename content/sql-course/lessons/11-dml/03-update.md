---
title: UPDATE: изменение строк
slug: sql-dml-update
minutes: 30
description: Как изменить значения в существующих строках: условие WHERE, выражения, подзапросы, UPDATE ... FROM, CASE и RETURNING, а также чем опасен UPDATE без WHERE.
tasks: sql-dml-update-one, sql-dml-update-expression, sql-dml-update-columns, sql-dml-update-null, sql-dml-update-subquery, sql-dml-update-from, sql-dml-update-returning, sql-dml-update-case
---
UPDATE меняет значения столбцов в уже существующих строках. После UPDATE идёт имя таблицы, после SET присваивания через запятую, после WHERE условие отбора строк.

```sql run=company
UPDATE employees
SET salary = 130000
WHERE id = 4;

SELECT id, full_name, salary FROM employees WHERE id IN (3, 4, 5) ORDER BY id;
```

Условие работает как в SELECT: подойдут сравнения, AND, OR, IN, BETWEEN, LIKE, IS NULL и подзапросы. Менять первичный ключ не запрещено, но так делают редко.

## Опасность запроса без WHERE

Если WHERE не написать, изменятся все строки таблицы. PostgreSQL не спросит подтверждения и не предупредит:

```sql run=company
UPDATE employees SET salary = 1;

SELECT id, full_name, salary FROM employees ORDER BY id LIMIT 3;
```

Привычки, которые защищают от такой ошибки. Сначала напишите тот же WHERE в запросе SELECT и посмотрите, какие строки попадут под условие. Затем замените SELECT на UPDATE. В psql и других клиентах для рискованных изменений полезно открыть транзакцию, посмотреть результат и только потом зафиксировать: об этом ближе к концу курса. Так же ведёт себя DELETE без WHERE.

Бывают задачи, где изменить нужно действительно все строки, например пересчитать цены. Тогда отсутствие WHERE осознанно, и лучше сказать об этом в комментарии рядом с запросом.

## Выражения в SET

В правой части присваивания можно использовать текущие значения столбцов этой же строки:

```sql run=company
UPDATE employees
SET salary = salary * 1.1
WHERE department_id = 4;

SELECT id, full_name, salary FROM employees WHERE department_id = 4 ORDER BY id;
```

Старые значения читаются до начала изменения, поэтому в одном запросе можно поменять два столбца местами:

```sql run=empty
CREATE TABLE pair (id integer PRIMARY KEY, a integer, b integer);
INSERT INTO pair VALUES (1, 10, 20);

UPDATE pair SET a = b, b = a WHERE id = 1;

SELECT * FROM pair;
```

В MySQL присваивания выполняются слева направо и видят уже изменённые значения, поэтому такой запрос там поменял бы столбцы иначе. В PostgreSQL порядок присваиваний не влияет на результат.

## Несколько столбцов и NULL

Присваивания разделяются запятыми, слово AND здесь не нужно:

```sql run=library
UPDATE books
SET genre = 'классика', price = price - 100
WHERE published_year < 1900;

SELECT id, title, genre, price FROM books ORDER BY id;
```

Арифметика с NULL даёт NULL. Если цена книги не указана, выражение `price - 100` тоже даст NULL, и значение останется пустым. Пустые значения ищут через IS NULL:

```sql run=shop
UPDATE customers
SET city = 'не указан'
WHERE city IS NULL;

SELECT id, full_name, city FROM customers ORDER BY id;
```

Условие `WHERE city = NULL` не сработает никогда: сравнение с NULL не истинно и не ложно, а неизвестно, и такие строки WHERE отбрасывает.

## Ветвление через CASE

Если разные строки нужно менять по-разному, используйте CASE внутри SET:

```sql run=company
UPDATE employees
SET salary = CASE
  WHEN salary < 100000 THEN salary * 1.2
  ELSE salary * 1.05
END;

SELECT id, full_name, salary FROM employees ORDER BY id;
```

Два отдельных запроса с условиями «меньше 100000» и «не меньше 100000» дали бы другой результат: после первого повышения у части сотрудников зарплата выросла бы выше порога, и второй запрос применился бы к ним повторно. CASE смотрит на исходное значение один раз.

## Подзапрос в SET и в WHERE

Новое значение может приходить из подзапроса. Если подзапрос ссылается на обновляемую строку, он считается для каждой строки отдельно:

```sql run=company
UPDATE departments d
SET budget = (
  SELECT sum(e.salary) * 12
  FROM employees e
  WHERE e.department_id = d.id
)
WHERE EXISTS (SELECT 1 FROM employees e WHERE e.department_id = d.id);

SELECT id, name, budget FROM departments ORDER BY id;
```

Условие EXISTS нужно для отделов без сотрудников. У отдела 5 сотрудников нет, поэтому сумма по пустому набору была бы NULL и затёрла бы прежний бюджет. С условием эта строка пропускается.

Подзапрос с несколькими строками в SET дал бы ошибку: значение должно быть одним.

## UPDATE ... FROM

Когда новые значения нужно взять из другой таблицы, подключайте её через FROM. Это особенность PostgreSQL, в стандартном SQL такой записи нет. Связь с обновляемой таблицей пишется в WHERE:

```sql run=shop
UPDATE order_items oi
SET price = round(p.price * 0.9, 2)
FROM orders o, products p
WHERE o.id = oi.order_id
  AND p.id = oi.product_id
  AND o.status = 'new';

SELECT order_id, product_id, price FROM order_items ORDER BY order_id, product_id;
```

Менялись только позиции заказов 5 и 8, у которых статус `new`. Если забыть строки со связью в WHERE, каждая позиция сочетается со всеми строками подключённых таблиц, и результат становится случайным: PostgreSQL берёт любую подходящую пару.

В MySQL то же делается через соединение прямо после UPDATE: `UPDATE order_items oi JOIN orders o ON ... SET oi.price = ...`.

## RETURNING

Как и в INSERT, в UPDATE есть RETURNING. Он отдаёт новые значения изменённых строк. Порядок этих строк не гарантирован, поэтому, если порядок важен, изменение оборачивают в WITH и сортируют внешним запросом:

```sql run=shop
WITH changed AS (
  UPDATE products SET stock = 10 WHERE stock = 0
  RETURNING id, title, stock
)
SELECT id, title, stock FROM changed ORDER BY id;
```

Такая конструкция называется data-modifying CTE. Внутри WITH выполняется UPDATE, а внешний SELECT читает то, что вернул RETURNING.

## Сколько строк изменилось

Клиент после UPDATE обычно показывает число затронутых строк, например `UPDATE 3`. Ноль не ошибка: условие просто ничего не нашло. Если вы ожидали изменить ровно одну строку, а видите `UPDATE 0`, проверьте условие.
