---
title: Группировка по выражению, ROLLUP и FILTER
slug: sql-grouping-group-expressions
minutes: 25
description: Как группировать по части даты, первой букве и диапазону через CASE, как добавить итоговую строку через ROLLUP и считать несколько условных итогов в одной строке.
tasks: sql-grouping-expr-hire-year, sql-grouping-expr-orders-month, sql-grouping-expr-title-letter, sql-grouping-expr-salary-band, sql-grouping-expr-price-class, sql-grouping-expr-decade, sql-grouping-expr-year-department, sql-grouping-expr-rollup, sql-grouping-expr-status-pivot
---
GROUP BY не обязан работать со столбцом как есть. Иногда группировать нужно по тому, чего в таблице нет: по году из даты, по первой букве названия, по ценовому диапазону. Для этого в GROUP BY пишут выражение.

## Часть даты

Сколько сотрудников принято в каждом году? Год хранится внутри даты, и достать его помогает EXTRACT:

```sql run=company
SELECT EXTRACT(YEAR FROM hire_date)::int AS hire_year, COUNT(*) AS hired
FROM employees
GROUP BY hire_year
ORDER BY hire_year;
```

В GROUP BY здесь стоит псевдоним из SELECT. PostgreSQL разрешает это, но в других системах псевдоним в GROUP BY может не работать, и тогда выражение приходится повторять. Приведение `::int` превращает год в целое число, иначе EXTRACT вернул бы тип numeric.

Для месяцев удобен to_char, он превращает дату в текст нужного формата:

```sql run=shop
SELECT to_char(ordered_at, 'YYYY-MM') AS month, COUNT(*) AS orders_count
FROM orders
GROUP BY month
ORDER BY month;
```

Формат `YYYY-MM` хорошо сортируется как текст. Формат вида `MM.YYYY` отсортировался бы сначала по месяцам, а не по годам.

Альтернатива - date_trunc, она оставляет дату и обнуляет всё мельче заданной единицы: `date_trunc('month', ordered_at)` вернёт первый день месяца. Оба способа годятся, выбирайте по тому, что нужно получить: текст или дату.

## Часть строки

Группировать можно и по куску строки. Сколько книг начинается на каждую букву:

```sql run=library
SELECT left(title, 1) AS letter, COUNT(*) AS books_count
FROM books
GROUP BY letter
ORDER BY books_count DESC, letter;
```

Функция left(строка, n) возвращает первые n символов. Две книги на букву "С" и по одной на остальные: порядок среди одиночных букв задаёт второй ключ сортировки.

## Диапазоны через CASE

Чтобы разбить значения на диапазоны, используют CASE. Он вычисляется для каждой строки и возвращает название диапазона, а по нему уже группируют:

```sql run=company
SELECT
  CASE
    WHEN salary < 100000 THEN 'низкая'
    WHEN salary < 200000 THEN 'средняя'
    ELSE 'высокая'
  END AS band,
  COUNT(*) AS employees_count
FROM employees
GROUP BY band
ORDER BY MIN(salary);
```

Условия проверяются сверху вниз, поэтому во второй ветке достаточно "меньше 200000": всё, что меньше 100000, уже забрала первая. Сортировка по названию группы здесь не подходит: по алфавиту "высокая" идёт перед "низкой". Сортировка по MIN(salary) ставит диапазоны в порядке роста, и это допустимо, потому что после группировки в ORDER BY можно использовать любые агрегаты.

Диапазоны одинаковой ширины проще получить арифметикой. Деление целых отбрасывает остаток, поэтому год можно округлить вниз до десятилетия:

```sql run=library
SELECT
  published_year / 10 * 10 AS decade,
  COUNT(*) AS books_count,
  ROUND(AVG(price), 2) AS avg_price
FROM books
GROUP BY decade
ORDER BY decade;
```

Выражение 1869 / 10 даёт 186, умножение на 10 возвращает 1860. Эта запись работает только для целых чисел. Для столбца numeric вместо неё используют `FLOOR(x / 10) * 10`.

## Группировка по нескольким выражениям

В GROUP BY можно сочетать выражения и обычные столбцы. Сколько сотрудников принято в каждом году в каждом отделе:

```sql run=company
SELECT
  EXTRACT(YEAR FROM hire_date)::int AS hire_year,
  department_id,
  COUNT(*) AS hired
FROM employees
GROUP BY hire_year, department_id
ORDER BY hire_year, department_id;
```

Группа - уникальная пара значений. Строки без отдела встречаются в конце списка внутри своего года.

## Итоги через ROLLUP

Часто в конце таблицы нужна итоговая строка: сколько всего. В PostgreSQL её добавляет ROLLUP:

```sql run=library
SELECT genre, COUNT(*) AS books_count
FROM books
GROUP BY ROLLUP (genre)
ORDER BY genre NULLS LAST;
```

К группам по жанрам добавилась строка, в которой `genre` равен NULL, а число книг посчитано по всей таблице. Итоговую строку можно узнать по NULL, но если в данных тоже бывают пустые жанры, ловить её по значению ненадёжно: для этого есть функция GROUPING(genre), которая возвращает 1 в итоговой строке и 0 в обычных.

При нескольких столбцах ROLLUP строит промежуточные итоги. `ROLLUP (a, b)` даёт группы по паре (a, b), по одному a и общий итог. Так строят отчёты с подытогами по группам.

```sql run=company
SELECT department_id, COUNT(*) AS employees_count,
  GROUPING(department_id) AS is_total
FROM employees
GROUP BY ROLLUP (department_id)
ORDER BY is_total, department_id;
```

Строка без отдела и итоговая строка обе показывают NULL, но различаются значением `is_total`.

## Несколько условных итогов в одной строке

Пусть нужно, чтобы по каждому покупателю были отдельные столбцы с числом отправленных и новых заказов. Если фильтровать статус в WHERE, часть покупателей пропадёт из результата. FILTER решает задачу без потерь:

```sql run=shop
SELECT
  customer_id,
  COUNT(*) FILTER (WHERE status = 'shipped') AS shipped_count,
  COUNT(*) FILTER (WHERE status = 'new') AS new_count
FROM orders
GROUP BY customer_id
ORDER BY customer_id;
```

У покупателей без таких заказов в столбцах стоит 0, но сами покупатели остаются в результате. Такая раскладка значений группы по столбцам называется сводной таблицей. Та же запись через `SUM(CASE WHEN ... THEN 1 ELSE 0 END)` работает в любой СУБД, FILTER короче, но есть только в PostgreSQL и нескольких других системах.

## Выражение в SELECT и в GROUP BY

Самое частое неудобство: в SELECT выражение написано одним способом, в GROUP BY другим, и PostgreSQL считает их разными. Например, `GROUP BY EXTRACT(YEAR FROM hire_date)` и `SELECT EXTRACT(YEAR FROM hire_date)::int` - разные выражения из-за приведения. Если база жалуется, что столбец должен быть в GROUP BY, проверьте, что выражения совпадают, или используйте псевдоним, как в примерах выше.
