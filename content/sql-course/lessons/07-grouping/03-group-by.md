---
title: GROUP BY: группировка строк
slug: sql-grouping-group-by
minutes: 25
description: Как посчитать агрегат отдельно для каждой группы строк, какие столбцы можно выводить, как группировать по нескольким полям и сортировать по агрегату.
tasks: sql-grouping-by-department-count, sql-grouping-by-department-payroll, sql-grouping-by-category-avg-price, sql-grouping-by-genre-count, sql-grouping-by-status-count, sql-grouping-by-department-position, sql-grouping-by-genre-price-range, sql-grouping-by-department-recent-avg, sql-grouping-top-orders
---
Агрегат без группировки сворачивает всю таблицу в одну строку. Чаще нужно другое: не общая сумма зарплат, а сумма по каждому отделу; не число заказов вообще, а число заказов с каждым статусом. Для этого есть GROUP BY. Он делит строки на группы по значению столбца, и агрегат считается отдельно в каждой группе.

## Первая группировка

Сколько сотрудников в каждом отделе:

```sql run=company
SELECT department_id, COUNT(*) AS employees_count
FROM employees
GROUP BY department_id
ORDER BY department_id;
```

База взяла двенадцать строк и разложила их по значению `department_id`: четыре сотрудника в отделе 1, двое в отделе 2 и так далее. Для каждой кучки отдельно выполнила COUNT(*). Каждая группа превратилась в одну строку результата.

Последняя строка особая. У стажёра отдел не указан, `department_id` у него NULL. GROUP BY считает все NULL одинаковыми и собирает их в отдельную группу. Это исключение: обычное сравнение `NULL = NULL` не истинно, а при группировке (как и в DISTINCT) два NULL считаются одинаковыми.

Агрегатов в запросе может быть сколько угодно, они считаются для одних и тех же групп:

```sql run=company
SELECT
  department_id,
  COUNT(*) AS employees_count,
  SUM(salary) AS total_salary,
  MAX(salary) AS top_salary
FROM employees
GROUP BY department_id
ORDER BY department_id;
```

## Что можно выводить в SELECT

Главное правило группировки: в SELECT можно писать только столбцы из GROUP BY и агрегатные функции. Остальное не имеет смысла. Что показать в группе "отдел 1" в столбце `full_name`, если там четыре разных имени? База не угадывает и сообщает об ошибке:

```sql run=company error
SELECT department_id, full_name, COUNT(*)
FROM employees
GROUP BY department_id;
```

Исправить можно двумя способами. Если имя нужно в результате, добавьте его в GROUP BY, но тогда группы станут мельче: по одной на каждое имя. Если нужен какой-то итог по именам, примените к ним агрегат, например MIN(full_name) или string_agg, о котором будет отдельный урок.

Обратное верно не всегда: столбец из GROUP BY можно не выводить. Запрос ниже считает то же самое, но без номера отдела, и по такому результату уже не понять, к какому отделу относится строка:

```sql run=company
SELECT COUNT(*) AS employees_count FROM employees GROUP BY department_id ORDER BY department_id;
```

## Группировка по нескольким столбцам

Если в GROUP BY несколько столбцов, группа - это уникальная комбинация их значений. Сколько человек работает на каждой должности внутри каждого отдела:

```sql run=company
SELECT department_id, position, COUNT(*) AS employees_count
FROM employees
GROUP BY department_id, position
ORDER BY department_id, position;
```

В отделе 3 две группы: "Руководитель продаж" с одним сотрудником и "Менеджер по продажам" с двумя. Порядок столбцов в GROUP BY на результат не влияет, а на порядок строк - только если вы задали ORDER BY.

## Порядок выполнения запроса

Когда в запросе есть все части, они выполняются не в том порядке, в каком записаны:

1. FROM - откуда брать строки.
2. WHERE - какие строки оставить.
3. GROUP BY - разложить оставшиеся строки по группам.
4. Агрегаты считаются в каждой группе. Здесь же работает HAVING, следующий урок.
5. SELECT - вычислить итоговые столбцы и псевдонимы.
6. ORDER BY - отсортировать результат.
7. LIMIT - обрезать результат.

Из этого порядка вытекает всё остальное. WHERE видит отдельные строки, а не группы, поэтому не может ссылаться на агрегаты. ORDER BY работает после SELECT, поэтому видит псевдонимы. Посчитаем среднюю зарплату по отделам только для сотрудников, принятых начиная с 2021 года:

```sql run=company
SELECT department_id, ROUND(AVG(salary), 2) AS avg_salary
FROM employees
WHERE hire_date >= DATE '2021-01-01'
GROUP BY department_id
ORDER BY department_id;
```

Сначала WHERE оставил семерых из двенадцати, потом они были разложены по отделам. В отделе 2 теперь только Сергей Лебедев: Анна Волкова принята в 2018 году и в расчёт не вошла. Отдел без подходящих сотрудников исчез бы из результата целиком.

## Сортировка по агрегату

Результат группировки часто сортируют по вычисленному значению. В ORDER BY работают и псевдоним, и сама функция:

```sql run=library
SELECT genre, COUNT(*) AS books_count
FROM books
GROUP BY genre
ORDER BY books_count DESC, genre;
```

Второй ключ `genre` нужен для однозначности: у жанров "повесть" и "поэма" по одной книге, и без него порядок этих двух строк мог бы меняться от запуска к запуску.

Чтобы получить только самые крупные группы, добавляют LIMIT. Три заказа магазина с наибольшей суммой:

```sql run=shop
SELECT order_id, SUM(quantity * price) AS order_total
FROM order_items
GROUP BY order_id
ORDER BY order_total DESC, order_id
LIMIT 3;
```

## Номера столбцов и псевдонимы в GROUP BY

В PostgreSQL в GROUP BY можно написать псевдоним из SELECT или номер столбца в списке. Это сокращения для коротких запросов, а не стандарт SQL: псевдоним в GROUP BY разрешён далеко не везде.

```sql run=library
SELECT genre AS kind, COUNT(*) AS books_count
FROM books
GROUP BY kind
ORDER BY 2 DESC, 1;
```

Номера в ORDER BY (здесь 2 и 1) ломаются, как только вы добавите или переставите столбец. В рабочем коде надёжнее писать имена.

## DISTINCT и GROUP BY

Запрос `SELECT genre FROM books GROUP BY genre` вернёт те же строки, что `SELECT DISTINCT genre FROM books`. Группировка без агрегатов - это просто способ получить уникальные значения. Выбирать удобнее то, что яснее читается, и обычно это DISTINCT.

## Группы и пустые таблицы

Если в таблице нет ни одной строки или WHERE отсёк все, группировка вернёт ноль строк. Это отличается от агрегата без группировки, который всегда возвращает ровно одну строку, пусть и с NULL. Сравните:

```sql run=company
SELECT department_id, COUNT(*) AS n FROM employees WHERE salary > 1000000 GROUP BY department_id;
```

Результат пустой: групп нет, считать нечего.
