---
title: Усечение дат: DATE_TRUNC
slug: sql-dates-trunc
minutes: 20
description: Как привести дату к началу месяца, недели, квартала или года, найти последний день месяца и сравнить даты по периодам.
tasks: sql-dates-trunc-month-start, sql-dates-trunc-current-month, sql-dates-trunc-month-end, sql-dates-trunc-year-start, sql-dates-trunc-week-start, sql-dates-trunc-quarter-start, sql-dates-trunc-last-year
---
Функция date_trunc округляет дату вниз до границы выбранного периода. Всё, что мельче периода, обнуляется: у месяца день становится первым, у года - первым января, у часа минуты и секунды становятся нулями. Первым аргументом идёт название периода строкой, вторым - значение:

```sql run=empty
SELECT
  date_trunc('hour', TIMESTAMP '2026-04-15 18:47:33') AS hour_start,
  date_trunc('day', TIMESTAMP '2026-04-15 18:47:33') AS day_start,
  date_trunc('month', TIMESTAMP '2026-04-15 18:47:33') AS month_start,
  date_trunc('quarter', TIMESTAMP '2026-04-15 18:47:33') AS quarter_start,
  date_trunc('year', TIMESTAMP '2026-04-15 18:47:33') AS year_start;
```

Результат всегда содержит время, даже когда оно нулевое. Если нужна чистая дата, добавьте приведение `::date`.

## Неделя

Период `week` в PostgreSQL начинается с понедельника. Для воскресенья начало недели - это понедельник за шесть дней до него:

```sql run=empty
SELECT d::date AS day, date_trunc('week', d)::date AS week_start
FROM generate_series(DATE '2026-04-12', DATE '2026-04-19', INTERVAL '1 day') AS d;
```

В MySQL функция WEEK и режимы недели настраиваются, а здесь правило одно - неделя по ISO. Если неделя у вас должна начинаться с воскресенья, сдвиньте дату: `date_trunc('week', d + INTERVAL '1 day') - INTERVAL '1 day'`.

## Сравнение по периоду

Усечение удобно в условиях вида «в том же месяце» или «в том же году». Усеките обе стороны и сравните:

```sql run=shop
SELECT id, ordered_at
FROM orders
WHERE date_trunc('month', ordered_at) = date_trunc('month', TIMESTAMP '2026-03-20')
ORDER BY id;
```

Здесь сегодняшняя дата задана литералом, чтобы результат не менялся от запуска к запуску. В рабочем запросе на её месте стоял бы now() или current_date: он разобран в последнем уроке раздела.

Когда в date_trunc передают значение типа date, PostgreSQL сначала переводит его в timestamptz, и результат тоже получается с поясом. Поскольку в тренажёре пояс UTC, разницы не видно. В рабочей базе, где пояс сессии другой, лучше приводить аргумент к timestamp явно: `date_trunc('month', d::timestamp)`.

## Последний день месяца

В MySQL есть функция LAST_DAY. В PostgreSQL её нет, но результат получается из усечения: возьмите начало месяца, прибавьте месяц, вычтите день.

```sql run=company
SELECT
  full_name,
  hire_date,
  (date_trunc('month', hire_date) + INTERVAL '1 month' - INTERVAL '1 day')::date AS month_end
FROM employees
WHERE id IN (1, 2, 3, 5);
```

Такая запись сама учитывает длину месяца: для февраля получится 28 или 29 число. Если нужен первый день следующего месяца, достаточно первых двух слагаемых. Это же значение удобно взять как верхнюю границу полуоткрытого промежутка.

## Месяц, квартал и год относительно заданной даты

С усечением удобно считать «прошлый месяц» и «прошлый год». Усеките сегодняшнюю дату, сдвиньте на период назад и сравнивайте:

```sql run=shop
SELECT id, ordered_at
FROM orders
WHERE ordered_at >= date_trunc('month', TIMESTAMP '2026-04-10' - INTERVAL '1 month')
  AND ordered_at <  date_trunc('month', TIMESTAMP '2026-04-10')
ORDER BY id;
```

Условие читается как «с начала марта включительно до начала апреля не включая». Такая форма дружит с индексом по столбцу, потому что столбец не обёрнут в функцию.

## Группировка по периодам

Усечение чаще всего применяют вместе с группировкой, чтобы получить «заказы по месяцам». Саму группировку мы разберём в одном из следующих разделов, но ради примера:

```sql run=shop
SELECT date_trunc('month', ordered_at)::date AS month, count(*) AS orders
FROM orders
GROUP BY 1
ORDER BY 1;
```

Усечение даёт одинаковое значение всем датам одного месяца, поэтому они попадают в одну группу. Строку для подписи оси из этого значения делают через to_char, о котором следующий урок.

## Усечение и EXTRACT

Оба инструмента отделяют часть даты, но результат у них разный. EXTRACT возвращает число: `EXTRACT(month FROM d)` для мая и любого года даст 5. date_trunc возвращает дату: для мая 2026 это 2026-05-01, а для мая 2025 - 2025-05-01. Поэтому для условия «в любом мае» берут EXTRACT, а для «в мае этого года» - усечение, потому что оно хранит и год.
