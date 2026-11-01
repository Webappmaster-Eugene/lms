---
title: Интервалы и разница дат
slug: sql-dates-intervals
minutes: 25
description: Как прибавить и вычесть дни, месяцы и часы, найти число дней между датами, посчитать возраст и длительность.
tasks: sql-dates-intervals-trial-end, sql-dates-intervals-days-worked, sql-dates-intervals-age-years, sql-dates-intervals-five-years, sql-dates-intervals-event-minutes, sql-dates-intervals-last-30-days, sql-dates-intervals-months-worked
---
Интервал - это длительность: три дня, полтора часа, два месяца. Его записывают словом INTERVAL и строкой с числом и единицей. Единицы пишут по-английски: year, month, week, day, hour, minute, second. Форма во множественном числе тоже подходит.

```sql run=empty
SELECT
  INTERVAL '3 days' AS three_days,
  INTERVAL '1 year 2 months' AS year_and_two,
  INTERVAL '1 hour 30 minutes' AS hour_half,
  INTERVAL '2 weeks' AS two_weeks;
```

Интервал можно прибавлять к дате и вычитать из неё. В MySQL для этого есть DATE_ADD и DATE_SUB, а в PostgreSQL достаточно знаков плюс и минус:

```sql run=empty
SELECT
  DATE '2026-01-31' + INTERVAL '1 day' AS next_day,
  DATE '2026-01-31' + INTERVAL '1 month' AS next_month,
  DATE '2026-03-31' - INTERVAL '1 month' AS prev_month,
  TIMESTAMP '2026-04-15 22:00' + INTERVAL '3 hours' AS later;
```

Месяц - не фиксированное число дней, и PostgreSQL это учитывает. 31 января плюс месяц даёт 28 февраля: если в нужном месяце нет такого числа, берётся последний день. Результат сложения date и interval - timestamp, а не date, поэтому для чистой даты добавляют `::date`.

## Прибавление дней к date

К значению типа date можно прибавить обычное целое число, и это число дней. Результат остаётся date:

```sql run=shop
SELECT full_name, registered_on, registered_on + 14 AS trial_end
FROM customers
WHERE id <= 3;
```

Это замена ADDDATE(d, n) и самого простого DATE_ADD(d, INTERVAL n DAY) из MySQL.

## Разница двух дат

Вычитание двух значений date даёт целое число дней. В MySQL это DATEDIFF:

```sql run=company
SELECT full_name, hire_date, DATE '2026-04-15' - hire_date AS days_worked
FROM employees
ORDER BY days_worked DESC
LIMIT 3;
```

Из более поздней даты вычитают более раннюю, иначе число будет отрицательным. Если вычесть друг из друга два timestamp, получится интервал вида `12 days 08:30:00`:

```sql run=empty
SELECT
  TIMESTAMP '2026-04-15 20:00' - TIMESTAMP '2026-04-12 11:30' AS diff,
  EXTRACT(day FROM TIMESTAMP '2026-04-15 20:00' - TIMESTAMP '2026-04-12 11:30') AS days_part,
  EXTRACT(epoch FROM TIMESTAMP '2026-04-15 20:00' - TIMESTAMP '2026-04-12 11:30') AS seconds_total;
```

Поле day даёт только дни из записи интервала, то есть 3, а часы теряются. Чтобы получить длительность целиком, берут epoch - число секунд - и делят на 60, 3600 или 86400. Именно так считают аналоги TIMESTAMPDIFF(MINUTE, ...) из MySQL:

```sql run=empty
SELECT (EXTRACT(epoch FROM TIMESTAMP '2026-04-15 20:00' - TIMESTAMP '2026-04-12 11:30') / 60)::int AS minutes;
```

## Возраст и полные годы: age

Деление числа дней на 365 даёт неточный возраст: високосные годы смещают результат. Функция age(конец, начало) считает по календарю и возвращает интервал из лет, месяцев и дней:

```sql run=company
SELECT
  full_name,
  birth_date,
  age(DATE '2026-04-15', birth_date) AS full_age,
  EXTRACT(year FROM age(DATE '2026-04-15', birth_date))::int AS years
FROM employees
WHERE id <= 4;
```

Первый аргумент - дата, на которую считают возраст. Если его опустить, возьмётся текущая дата, и результат начнёт зависеть от дня запуска. Поэтому в примерах курса дату пишут явно.

Полные годы берут из age через EXTRACT. Так проверяют стаж:

```sql run=company
SELECT full_name, hire_date
FROM employees
WHERE EXTRACT(year FROM age(DATE '2026-04-15', hire_date)) >= 5
ORDER BY hire_date;
```

## Полные месяцы

Разница в месяцах (PERIOD_DIFF и TIMESTAMPDIFF(MONTH, ...) в MySQL) складывается из лет и месяцев интервала age: годы нужно перевести в месяцы, умножив на 12.

```sql run=company
SELECT
  full_name,
  EXTRACT(year FROM age(DATE '2026-04-15', hire_date)) * 12
    + EXTRACT(month FROM age(DATE '2026-04-15', hire_date)) AS months_worked
FROM employees
WHERE id IN (1, 11, 12);
```

Одно EXTRACT(month ...) вернуло бы лишь остаток от 0 до 11 и дало бы неверный стаж для всех, кто проработал больше года.

## Окно «последние N дней»

Типичная задача: выбрать записи за последние 30 дней. Опорная дата - не сегодняшний момент, а граница суток. Записи этого дня должны попадать целиком, а будущие - нет:

```sql run=shop
SELECT id, ordered_at
FROM orders
WHERE ordered_at >= TIMESTAMP '2026-03-20' - INTERVAL '30 days'
  AND ordered_at <  TIMESTAMP '2026-03-20' + INTERVAL '1 day'
ORDER BY id;
```

Здесь сегодня - 20 марта 2026 года. Нижняя граница - полночь 18 февраля, верхняя - полночь 21 марта, не включая. Условие «с 18 февраля включительно» и «до 21 марта не включая» захватывает 20 марта полностью, включая заказ в 23:59.

## Интервалы со смешанными единицами

Интервал хранит месяцы, дни и время отдельно. Месяц не превращается в 30 дней, а день - в 24 часа: INTERVAL '1 month' и INTERVAL '30 days' дают разные результаты при прибавлении к дате. Но оператор сравнения считает месяц равным 30 дням, и поэтому интервал «4 года 11 месяцев 30 дней» окажется равным пяти годам. Такой интервал возвращает age, например, для 1 июня 2021 и 31 мая 2026 года. Для стажа в полных годах надёжнее брать число лет через EXTRACT, как выше.

Чтобы собрать интервал из чисел, например из столбца, используют make_interval или умножение:

```sql run=empty
SELECT
  make_interval(days => 10) AS ten_days,
  INTERVAL '1 day' * 7 AS week,
  INTERVAL '1 hour' * 2.5 AS two_and_half_hours;
```
