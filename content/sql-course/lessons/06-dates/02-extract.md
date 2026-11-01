---
title: Части даты: EXTRACT
slug: sql-dates-extract
minutes: 20
description: Как получить год, месяц, день, час, день недели, неделю и квартал из даты и как собрать из них условие.
tasks: sql-dates-extract-hire-year, sql-dates-extract-may-hires, sql-dates-extract-birthday-2026, sql-dates-extract-weekend-orders, sql-dates-extract-q1-products, sql-dates-extract-work-hours, sql-dates-extract-iso-week
---
Чтобы отделить от даты год, месяц, час или день недели, в PostgreSQL используют функцию EXTRACT. Она принимает название нужной части и значение и возвращает число:

```sql run=company
SELECT
  full_name,
  hire_date,
  EXTRACT(year FROM hire_date) AS y,
  EXTRACT(month FROM hire_date) AS m,
  EXTRACT(day FROM hire_date) AS d
FROM employees
WHERE id <= 3;
```

Название части идёт без кавычек, затем слово FROM и само значение. Результат имеет тип numeric, поэтому его часто приводят к целому: `EXTRACT(year FROM hire_date)::int`. Это не обязательно для сравнения, но ровнее выглядит в результате и нужно там, где функция ждёт целое число, например в make_date.

Похожая функция date_part('year', hire_date) делает то же самое, но название части в ней идёт строкой. В новых запросах пишут EXTRACT: так принято в стандарте SQL.

## Какие бывают части

Для даты и времени доступны: year, month, day, hour, minute, second, quarter (квартал, от 1 до 4), week (номер недели по ISO), doy (день года), dow и isodow (день недели), epoch (секунды с 1 января 1970).

```sql run=shop
SELECT
  id,
  ordered_at,
  EXTRACT(hour FROM ordered_at) AS hr,
  EXTRACT(minute FROM ordered_at) AS mn,
  EXTRACT(quarter FROM ordered_at) AS q,
  EXTRACT(doy FROM ordered_at) AS day_of_year
FROM orders
WHERE id <= 4;
```

Часы, минуты и секунды есть только у timestamp и time. Если попросить hour у значения типа date, PostgreSQL вернёт ошибку: у даты нет такой части.

```sql run=company error
SELECT EXTRACT(hour FROM hire_date) FROM employees;
```

## День недели: dow и isodow

День недели можно получить двумя способами. Поле dow нумерует дни с воскресенья как 0 до субботы как 6. Поле isodow нумерует их с понедельника как 1 до воскресенья как 7. Для рабочей недели удобнее isodow:

```sql run=empty
SELECT
  d,
  EXTRACT(dow FROM d) AS dow,
  EXTRACT(isodow FROM d) AS isodow
FROM generate_series(DATE '2026-04-12', DATE '2026-04-15', INTERVAL '1 day') AS d;
```

Здесь 12 апреля 2026 года - воскресенье: dow даёт 0, isodow - 7. Остальные функции MySQL соответствуют так: WEEKDAY(d) равна `EXTRACT(isodow FROM d) - 1`, DAYOFWEEK(d) равна `EXTRACT(dow FROM d) + 1`. Если вы переносите условие «по субботам и воскресеньям» из MySQL, цифры нужно пересчитать.

## Неделя и год

Поле week считает номера недель по стандарту ISO: неделя начинается с понедельника, а неделя номер 1 - та, в которой есть первый четверг года. Поэтому 1 января может принадлежать 52-й или 53-й неделе прошлого года, а 31 декабря - первой неделе следующего. Если брать год из даты, а неделю из EXTRACT, пары «год и неделя» могут не совпасть. Для пары нужны isoyear и week вместе:

```sql run=empty
SELECT
  d,
  EXTRACT(year FROM d) AS year,
  EXTRACT(isoyear FROM d) AS iso_year,
  EXTRACT(week FROM d) AS iso_week
FROM (VALUES (DATE '2025-12-31'), (DATE '2026-01-01'), (DATE '2026-01-05')) AS t(d);
```

Первые две даты лежат в одной ISO-неделе (первой неделе 2026 года), хотя календарные годы у них разные.

## EXTRACT в условиях

Полученное число можно использовать в WHERE так же, как любое другое. Например, сотрудники, принятые в мае, в любом году:

```sql run=company
SELECT full_name, hire_date
FROM employees
WHERE EXTRACT(month FROM hire_date) = 5
ORDER BY hire_date;
```

Условие по году лучше записывать диапазоном дат, если по столбцу есть индекс: `hire_date >= DATE '2020-01-01' AND hire_date < DATE '2021-01-01'`. Тогда индекс можно использовать, а `EXTRACT(year FROM hire_date) = 2020` его обойдёт. Для небольших таблиц разницы нет, и EXTRACT проще читать.

## Собрать дату обратно

Извлечённые числа можно подставить в make_date. Так получают дату того же дня в другом году. Для дня рождения в 2026 году:

```sql run=company
SELECT
  full_name,
  birth_date,
  make_date(2026, EXTRACT(month FROM birth_date)::int, EXTRACT(day FROM birth_date)::int) AS birthday_2026
FROM employees
WHERE id <= 3;
```

Именно здесь нужно приведение к int: make_date не принимает numeric.

## Что называется иначе в MySQL

В MySQL есть отдельные функции YEAR(d), MONTH(d), DAY(d) или DAYOFMONTH(d), HOUR(t), MINUTE(t), SECOND(t). В PostgreSQL ни одной из них нет, везде работает EXTRACT. Функция DATE(ts) заменяется приведением `ts::date`. Названия MONTHNAME и DAYNAME соответствуют форматированию через to_char: оно разобрано в одном из следующих уроков.
