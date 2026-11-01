---
title: COUNT: подсчёт строк и значений
slug: sql-grouping-count
minutes: 20
description: Чем различаются COUNT(*), COUNT(столбец) и COUNT(DISTINCT столбец), как считать строки по условию через FILTER и как получить долю.
tasks: sql-grouping-count-employees, sql-grouping-count-email, sql-grouping-count-genres, sql-grouping-count-cities, sql-grouping-count-shipped, sql-grouping-count-old-books, sql-grouping-count-departments-used, sql-grouping-share-without-email
---
COUNT отвечает на вопрос "сколько". У него три разных записи, и каждая считает своё. Путаница между ними - одна из самых частых ошибок в отчётах, поэтому разберём их на одних и тех же данных.

## Три записи COUNT

Сначала все три рядом, на таблице сотрудников:

```sql run=company
SELECT
  COUNT(*) AS all_rows,
  COUNT(email) AS with_email,
  COUNT(DISTINCT department_id) AS departments
FROM employees;
```

COUNT(*) считает строки. Ему всё равно, что в них лежит, поэтому NULL не влияют на результат: сотрудников двенадцать.

COUNT(столбец) считает строки, в которых этот столбец не NULL. Почта указана у девяти сотрудников из двенадцати, пустых значений три.

COUNT(DISTINCT столбец) считает разные значения столбца, пропуская NULL. В таблице есть сотрудники четырёх отделов, а стажёр без отдела в счёт не попал. Повторы тоже убираются: в отделе 1 четверо сотрудников, но отдел засчитан один раз.

Разность двух первых вариантов даёт число пустых значений:

```sql run=company
SELECT COUNT(*) - COUNT(email) AS without_email FROM employees;
```

## COUNT(1) и COUNT(*)

Иногда пишут COUNT(1). Это то же самое, что COUNT(*): константа никогда не бывает NULL, поэтому считаются все строки. Разницы в скорости в PostgreSQL нет, а запись со звёздочкой читается понятнее.

## Условие внутри подсчёта

Допустим, нужно получить одной строкой общее число заказов и число отправленных. Если поставить условие в WHERE, общее число потеряется. Для этого у агрегатов в PostgreSQL есть предложение FILTER:

```sql run=shop
SELECT
  COUNT(*) AS total_orders,
  COUNT(*) FILTER (WHERE status = 'shipped') AS shipped_orders,
  COUNT(*) FILTER (WHERE status IN ('new', 'paid')) AS in_progress
FROM orders;
```

FILTER (WHERE ...) действует только на тот агрегат, после которого стоит. Каждый столбец результата получает своё условие, а общий WHERE остаётся для строк, которые не нужны ни одному из них. FILTER работает не только с COUNT, но и с SUM, AVG и любыми другими агрегатами.

В MySQL FILTER нет. Там то же самое пишут через CASE, и такая запись работает и в PostgreSQL:

```sql run=shop
SELECT
  COUNT(*) AS total_orders,
  COUNT(CASE WHEN status = 'shipped' THEN 1 END) AS shipped_orders,
  SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) AS shipped_again
FROM orders;
```

Выражение CASE без ELSE возвращает NULL для остальных строк, а COUNT NULL пропускает. Поэтому COUNT(CASE WHEN ... THEN 1 END) считает только подходящие строки. Вариант с SUM складывает единицы и нули и даёт то же число. Запись с FILTER короче и яснее, её стоит предпочесть.

## Подсчёт после WHERE

Обычный WHERE работает как всегда: сначала отбор строк, потом подсчёт.

```sql run=library
SELECT COUNT(*) AS old_books FROM books WHERE published_year < 1900;
```

## Когда ничего не найдено

COUNT отличается от остальных агрегатов тем, что по пустому набору возвращает 0, а не NULL:

```sql run=library
SELECT COUNT(*) AS n, SUM(pages) AS pages FROM books WHERE published_year > 2100;
```

Так что COALESCE вокруг COUNT не нужен. Он нужен вокруг SUM, AVG, MIN и MAX.

## Доля от общего числа

Сколько процентов сотрудников не указали почту? Нужно разделить число пустых значений на общее число строк:

```sql run=company
SELECT ROUND(100.0 * (COUNT(*) - COUNT(email)) / COUNT(*), 1) AS percent_without_email
FROM employees;
```

Число 100.0 с точкой не случайно. Если написать 100 без точки, то в выражении окажутся одни целые числа, и PostgreSQL выполнит целочисленное деление, отбросив дробную часть. Достаточно, чтобы хотя бы один множитель был дробным. Сравните:

```sql run=company
SELECT
  100 * 1 / 12 AS integer_division,
  100.0 * 1 / 12 AS decimal_division;
```

## Что считать нельзя

COUNT нельзя сравнивать в WHERE, потому что на этом этапе подсчёта ещё нет:

```sql run=company error
SELECT COUNT(*) FROM employees WHERE COUNT(*) > 5;
```

Условия на результаты агрегатов пишутся в HAVING, об этом урок через один.

## Сколько разных значений

COUNT(DISTINCT) полезен, когда нужно узнать разнообразие данных. Сколько разных городов у покупателей и у скольких из них город указан вообще?

```sql run=shop
SELECT
  COUNT(*) AS customers,
  COUNT(city) AS with_city,
  COUNT(DISTINCT city) AS distinct_cities
FROM customers;
```

Всегда выполняется неравенство: COUNT(*) не меньше COUNT(столбец), а COUNT(столбец) не меньше COUNT(DISTINCT столбец). Если результат ему противоречит, ищите ошибку в запросе.

Запись SELECT DISTINCT COUNT(city) не делает того же: она сначала считает все города, а потом убирает повторы среди строк результата. Результат один, и DISTINCT ничего не отбирает. Для подсчёта разных значений DISTINCT должен стоять внутри скобок COUNT.
