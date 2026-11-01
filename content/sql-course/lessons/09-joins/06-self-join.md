---
title: Самосоединение
slug: sql-joins-self
minutes: 20
description: Соединение таблицы с самой собой: руководитель и подчинённый, пары строк по условию, поиск строк без подчинённых и защита от зеркальных пар.
tasks: sql-joins-self-employee-manager, sql-joins-self-earns-more, sql-joins-self-report-counts, sql-joins-self-same-position, sql-joins-self-no-reports, sql-joins-self-price-pairs
---
Иногда строки таблицы связаны с другими строками этой же таблицы. В `employees` столбец `manager_id` хранит номер руководителя, а руководитель - такой же сотрудник, его строка лежит в той же таблице. Чтобы получить имя руководителя рядом с именем сотрудника, таблицу соединяют сама с собой. Это самосоединение.

## Две роли одной таблицы

Особого синтаксиса для самосоединения нет. Нужен обычный JOIN, только одна таблица указана дважды, и без псевдонимов не обойтись: иначе непонятно, о какой из двух копий речь.

```sql run=company
SELECT e.full_name AS employee, m.full_name AS manager
FROM employees e
JOIN employees m ON m.id = e.manager_id
ORDER BY e.id;
```

Таблица `e` играет роль сотрудников, таблица `m` - роль руководителей. Условие связывает внешний ключ `e.manager_id` с первичным ключом `m.id`. Физически таблица одна, но запрос обращается к ней как к двум независимым наборам строк.

В результате семь строк из двенадцати. Пять сотрудников не нашли пары: у четырёх руководителей нет начальника, а пятый - стажёр Виктор Зайцев. Чтобы увидеть всех, соединение делают левым:

```sql run=company
SELECT e.full_name AS employee, m.full_name AS manager
FROM employees e
LEFT JOIN employees m ON m.id = e.manager_id
ORDER BY e.id;
```

У тех, кто руководителя не имеет, в столбце `manager` пустое значение.

## Сравнение со своим руководителем

Раз обе роли доступны в одном запросе, можно сравнивать их значения. Найдём тех, кто получает больше своего руководителя:

```sql run=company
SELECT e.full_name AS employee, e.salary, m.full_name AS manager, m.salary AS manager_salary
FROM employees e
JOIN employees m ON m.id = e.manager_id
WHERE e.salary > m.salary
ORDER BY e.id;
```

Наталья Кузнецова зарабатывает чуть больше Алексея Попова. Без самосоединения такое сравнение выразить трудно: пришлось бы вложенными подзапросами искать руководителя для каждой строки.

## Подчинённые и группировка

Число подчинённых у каждого руководителя считается группировкой по руководителю:

```sql run=company
SELECT m.full_name AS manager, COUNT(*) AS reports
FROM employees e
JOIN employees m ON m.id = e.manager_id
GROUP BY m.id, m.full_name
ORDER BY reports DESC, m.id;
```

Группируют по руководителю (`m`), считают строки подчинённых (`e`). Тех, у кого подчинённых нет, в таком результате нет вовсе. Чтобы их показать, роли переставляют: главной становится таблица руководителей, а подчинённые присоединяются левым соединением.

```sql run=company
SELECT m.full_name AS manager, COUNT(r.id) AS reports
FROM employees m
LEFT JOIN employees r ON r.manager_id = m.id
WHERE m.id IN (1, 2, 5, 12)
GROUP BY m.id, m.full_name
ORDER BY m.id;
```

Игорь Петров и Виктор Зайцев получили ноль. Здесь COUNT(r.id), а не COUNT(*): причина разобрана в уроке про LEFT и RIGHT JOIN.

## Сотрудники без подчинённых

Поиск строк без пары работает и внутри одной таблицы:

```sql run=company
SELECT e.full_name
FROM employees e
LEFT JOIN employees r ON r.manager_id = e.id
WHERE r.id IS NULL
ORDER BY e.id;
```

Здесь `r` - возможные подчинённые сотрудника `e`. Если ни одной строки `r` нет, значит, никто на него не ссылается как на руководителя.

## Пары строк одной таблицы

Самосоединение нужно не только для иерархий. Им находят пары строк, которые чем-то схожи. Допустим, нужно найти сотрудников с одинаковой должностью. Наивный запрос ошибочен:

```sql run=company
SELECT a.full_name AS first_employee, b.full_name AS second_employee, a.position
FROM employees a
JOIN employees b ON b.position = a.position
WHERE a.position = 'Менеджер по продажам'
ORDER BY a.id, b.id;
```

Получилось четыре строки вместо одной пары. Каждый сотрудник оказался в паре с самим собой, а настоящая пара Павел - Татьяна встретилась дважды: в прямом и обратном порядке. Лечится одним условием в ON:

```sql run=company
SELECT a.full_name AS first_employee, b.full_name AS second_employee, a.position
FROM employees a
JOIN employees b ON b.position = a.position AND a.id < b.id
ORDER BY a.id, b.id;
```

Строгое неравенство `a.id < b.id` убирает пары сотрудника с самим собой, а из двух зеркальных пар оставляет одну: ту, где первым идёт сотрудник с меньшим номером. Это стандартный приём. Запись `a.id <> b.id` убрала бы только пары с самим собой, зеркальные остались бы.

Условие в ON может быть и сложнее равенства. Вот пары товаров из одной категории, цены которых различаются меньше чем на тысячу:

```sql run=shop
SELECT a.title AS first_product, b.title AS second_product, ABS(a.price - b.price) AS price_diff
FROM products a
JOIN products b ON b.category_id = a.category_id AND a.id < b.id
WHERE ABS(a.price - b.price) < 1000
ORDER BY a.id, b.id;
```

Товары без категории пар не образуют: `NULL = NULL` не истина, поэтому соединение по `category_id` их не связывает.

## Цепочки руководителей

Самосоединением можно поднимать иерархию на несколько уровней: ещё один JOIN той же таблицы даст руководителя руководителя. Глубина фиксирована числом соединений. Для иерархии произвольной глубины в PostgreSQL есть рекурсивные запросы (`WITH RECURSIVE`), но это отдельная тема за рамками раздела. В учебных данных иерархия двухуровневая, и одного самосоединения хватает.
