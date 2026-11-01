---
title: HAVING: фильтр по группам
slug: sql-grouping-having
minutes: 20
description: Как отбирать группы по значению агрегата, чем HAVING отличается от WHERE и как использовать оба условия в одном запросе.
tasks: sql-grouping-having-big-departments, sql-grouping-having-avg-salary, sql-grouping-having-genres, sql-grouping-having-repeat-customers, sql-grouping-having-stock-value, sql-grouping-having-big-orders, sql-grouping-having-authors-pages, sql-grouping-having-positions
---
После GROUP BY нередко нужно оставить не все группы, а только подходящие: отделы с больше чем двумя сотрудниками, жанры с несколькими книгами, заказы дороже заданной суммы. Условие на значение агрегата пишут в HAVING.

## Условие на группу

Отделы, в которых больше двух сотрудников:

```sql run=company
SELECT department_id, COUNT(*) AS employees_count
FROM employees
GROUP BY department_id
HAVING COUNT(*) > 2
ORDER BY department_id;
```

HAVING стоит после GROUP BY и перед ORDER BY. База сначала считает группы, потом выбрасывает те, для которых условие ложно. Из пяти групп (четыре отдела и сотрудники без отдела) остались две.

Попытка написать то же условие в WHERE закончится ошибкой, потому что на этапе WHERE групп ещё нет:

```sql run=company error
SELECT department_id, COUNT(*) AS employees_count
FROM employees
WHERE COUNT(*) > 2
GROUP BY department_id;
```

## WHERE и HAVING: в чём разница

Оба предложения что-то фильтруют, но на разных этапах и разные объекты.

WHERE отбирает строки таблицы до группировки. В его условии стоят столбцы строки: цена, дата, статус. Агрегаты в WHERE запрещены.

HAVING отбирает готовые группы после подсчёта. В его условии стоят агрегаты и столбцы из GROUP BY.

Практическое правило: если условие можно сформулировать про отдельную строку, оно принадлежит WHERE. Так запрос работает быстрее, потому что в группировку попадает меньше строк. В HAVING оставляют только то, что без группы не проверить.

Сравните два запроса. Первый считает отделы, где работает больше двух сотрудников с зарплатой выше 100000. Условие на зарплату касается каждого сотрудника, поэтому оно в WHERE:

```sql run=company
SELECT department_id, COUNT(*) AS well_paid
FROM employees
WHERE salary > 100000
GROUP BY department_id
HAVING COUNT(*) > 2
ORDER BY department_id;
```

Второй запрос ищет отделы, где средняя зарплата выше 100000. Это условие о группе, оно в HAVING:

```sql run=company
SELECT department_id, ROUND(AVG(salary), 2) AS avg_salary
FROM employees
GROUP BY department_id
HAVING AVG(salary) > 100000
ORDER BY department_id;
```

Результаты отличаются по смыслу: в первом случае из отделов убирали людей до подсчёта, во втором убирали отделы после.

## Что можно писать в HAVING

В условии HAVING допустимы агрегаты, как те, что стоят в SELECT, так и другие. Отделы, где зарплаты различаются больше чем на 100000:

```sql run=company
SELECT department_id, MIN(salary) AS lowest, MAX(salary) AS highest
FROM employees
GROUP BY department_id
HAVING MAX(salary) - MIN(salary) > 100000
ORDER BY department_id;
```

Столбцы из GROUP BY тоже допустимы. Условие `HAVING department_id IS NOT NULL` сработает, но лучше перенести его в WHERE: отсеивать группу с NULL после того, как она уже посчитана, нет смысла.

Псевдоним агрегата из SELECT в HAVING использовать нельзя. Предложение HAVING выполняется до SELECT, и псевдонима там ещё нет:

```sql run=company error
SELECT department_id, COUNT(*) AS employees_count
FROM employees
GROUP BY department_id
HAVING employees_count > 2;
```

Нужно повторить выражение: `HAVING COUNT(*) > 2`. Это не вызывает двойной работы, база вычисляет одинаковые агрегаты один раз.

## WHERE и HAVING вместе

Покупатели с двумя и более заказами, не считая отменённых:

```sql run=shop
SELECT customer_id, COUNT(*) AS orders_count
FROM orders
WHERE status <> 'cancelled'
GROUP BY customer_id
HAVING COUNT(*) >= 2
ORDER BY customer_id;
```

Порядок выполнения такой: WHERE убирает отменённые заказы, GROUP BY собирает оставшиеся по покупателям, HAVING оставляет тех, у кого заказов не меньше двух, ORDER BY упорядочивает результат. Покупатель 1 сделал три заказа, один из них отменён, и в счёт вошли два. Если бы отменённые заказы убирались не в WHERE, а как-то позже, покупатель 1 попал бы в результат с тремя заказами.

Статус нельзя проверять в HAVING: в этом запросе он не входит ни в GROUP BY, ни в агрегат, и PostgreSQL не позволит его использовать.

## Сортировка и HAVING

Фильтр по группам часто сочетается с сортировкой по агрегату. Крупные заказы магазина, от самых дорогих:

```sql run=shop
SELECT order_id, SUM(quantity * price) AS order_total
FROM order_items
GROUP BY order_id
HAVING SUM(quantity * price) > 50000
ORDER BY order_total DESC, order_id;
```

Выражение в HAVING повторено целиком. В ORDER BY можно написать псевдоним, потому что сортировка выполняется после SELECT.

## HAVING без GROUP BY

HAVING можно написать и без GROUP BY. Тогда вся таблица считается одной группой, и условие либо оставляет единственную строку, либо убирает её:

```sql run=library
SELECT COUNT(*) AS books_count FROM books HAVING COUNT(*) > 100;
```

Книг меньше ста, поэтому результат пуст. Приём встречается редко, но полезно знать, что запрос не обязан падать.

## Типичные ошибки

Агрегат в WHERE, как в начале урока, - самая частая. Вторая по частоте - перенос обычного условия в HAVING вместо WHERE: запрос работает, но тратит силы на группы, которые заведомо выбросит. Третья - сравнение округлённого среднего. Если вы пишете HAVING ROUND(AVG(salary), 0) > 100000, группа со средним 100000,4 не пройдёт, хотя её среднее выше порога. Сравнивайте неокруглённое значение, а округляйте только то, что выводите.
