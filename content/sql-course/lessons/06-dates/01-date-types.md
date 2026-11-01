---
title: Типы даты и времени
slug: sql-dates-types
minutes: 20
description: Чем отличаются date, time, timestamp, timestamptz и interval, как записывать даты в формате ISO, сравнивать их и переводить из пояса в пояс.
tasks: sql-dates-types-hired-since, sql-dates-types-march-orders, sql-dates-types-order-parts, sql-dates-types-registered-2025, sql-dates-types-evening-events, sql-dates-types-moscow-time
---
Дату и время в PostgreSQL хранят в отдельных типах, и от выбора типа зависит, что вы сможете с ними делать. Тип date хранит календарный день без времени, time - время суток без даты. Тип timestamp хранит и то и другое вместе, но без часового пояса. Тип timestamptz (полное имя timestamp with time zone) хранит момент времени с учётом часового пояса. Отдельный тип interval хранит длительность: «3 дня», «2 часа 30 минут».

В учебных данных курса все эти типы уже встречались: `hire_date` у сотрудников и `registered_on` у покупателей имеют тип date, а `ordered_at` у заказов - timestamp.

## Как записывать значения

PostgreSQL принимает даты в формате ISO 8601: сначала год из четырёх цифр, потом месяц, потом день, через дефис. Время пишется через двоеточия, дата и время разделяются пробелом или буквой T. Такая запись однозначна, и ей стоит пользоваться всегда: запись «03.04.2026» одни прочтут как 3 апреля, другие как 4 марта.

```sql run=empty
SELECT
  DATE '2026-04-15' AS d,
  TIME '18:30' AS t,
  TIMESTAMP '2026-04-15 18:30:00' AS ts,
  INTERVAL '2 hours 30 minutes' AS iv;
```

Слово перед строкой задаёт тип. Без него литерал остаётся просто текстом, и PostgreSQL выберет тип по контексту. В сравнении с датой это обычно работает, но явная приставка защищает от неожиданностей.

Приведение типов можно записать и двумя двоеточиями: `'2026-04-15'::date`. Оно же отбрасывает лишнее. Если у timestamp взять `::date`, останется только день, если `::time` - только время:

```sql run=shop
SELECT id, ordered_at, ordered_at::date AS order_date, ordered_at::time AS order_time
FROM orders
WHERE id <= 3;
```

## Сравнение дат

Даты сравнивают обычными операторами. Раньше значит меньше, позже значит больше:

```sql run=company
SELECT full_name, hire_date
FROM employees
WHERE hire_date >= DATE '2022-01-01'
ORDER BY hire_date;
```

Для диапазона по date удобен BETWEEN: он включает обе границы, а у даты нет времени, поэтому последний день попадает целиком. С timestamp BETWEEN опасен. Условие `ordered_at BETWEEN '2026-03-01' AND '2026-03-31'` читается как «до полуночи 31 марта», и все заказы последнего дня теряются. Для timestamp надёжнее полуоткрытый промежуток: начало периода включается, начало следующего не включается.

```sql run=shop
SELECT id, ordered_at
FROM orders
WHERE ordered_at >= TIMESTAMP '2026-03-01'
  AND ordered_at <  TIMESTAMP '2026-04-01'
ORDER BY id;
```

Такая запись работает для любого типа и любого периода, поэтому её удобно взять за привычку.

## Часовые пояса

С timestamp всё просто: значение хранится ровно как записано, пояс не учитывается. Если один сервер записал `2026-04-15 12:00` по Москве, а другой по UTC, в таблице будет одно и то же значение, хотя это разные моменты.

Тип timestamptz устроен иначе. При записи PostgreSQL переводит значение в UTC и хранит момент времени. При чтении он показывает его в часовом поясе сессии. В тренажёре пояс сессии всегда UTC, и проверить это можно командой:

```sql run=empty
SHOW TimeZone;
```

Чтобы перевести значение из одного пояса в другой, используют конструкцию AT TIME ZONE. Для timestamp она работает как «считать значение записанным в этом поясе и получить момент времени», для timestamptz - как «показать этот момент на часах пояса»:

```sql run=empty
SELECT
  TIMESTAMP '2026-04-15 12:00' AT TIME ZONE 'UTC' AS moment,
  (TIMESTAMP '2026-04-15 12:00' AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow' AS moscow_clock,
  (TIMESTAMP '2026-04-15 12:00' AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Yekaterinburg' AS ekb_clock;
```

Первое выражение даёт timestamptz, поэтому оно показано в поясе сессии. Второе и третье возвращают обычные timestamp с часами на стене в Москве (UTC+3) и Екатеринбурге (UTC+5). Пояса называют по базе IANA: `Europe/Moscow`, а не «МСК». Для хранения времени событий, которые видят люди в разных странах, берут timestamptz, а для календарных дат вроде дня рождения - date.

## Собрать дату из частей

Функция make_date собирает дату из трёх чисел, make_time - время, make_timestamp - всё вместе. Это полезно, когда год, месяц и день лежат в разных столбцах:

```sql run=empty
SELECT
  make_date(2026, 4, 15) AS d,
  make_time(9, 5, 0) AS t,
  make_timestamp(2026, 4, 15, 9, 5, 0) AS ts;
```

Несуществующая дата вроде 31 апреля вызовет ошибку, а не молча перейдёт на 1 мая:

```sql run=empty error
SELECT make_date(2026, 4, 31);
```

## Что называется иначе в MySQL

В MySQL типы называются DATE, TIME, DATETIME и TIMESTAMP. Ближе всего к DATETIME подходит timestamp без пояса. Тип TIMESTAMP в MySQL по смыслу ближе к timestamptz. Приставки вроде `DATE '...'` и приведение через `::` работают только в PostgreSQL, у MySQL приведение записывают как CAST или функцию DATE().
