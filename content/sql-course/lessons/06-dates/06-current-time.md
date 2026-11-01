---
title: Текущие дата и время
slug: sql-dates-current
minutes: 20
description: Чем отличаются now(), current_date и clock_timestamp(), как считать отрезки от текущей даты и почему в задачах курса дата зафиксирована.
tasks: sql-dates-current-recent-products, sql-dates-current-recent-customers, sql-dates-current-prev-month-orders, sql-dates-current-waiting-orders, sql-dates-current-running-events, sql-dates-current-next-birthday
---
Чтобы узнать, который сейчас час, в PostgreSQL есть несколько функций. Результаты примеров ниже зависят от момента запуска, поэтому они показаны обычными блоками без выполнения, а словами описано, что вернёт база.

```sql
SELECT now(), current_date, current_time, current_timestamp, localtimestamp;
```

Функция now() возвращает текущий момент как timestamptz. Слова current_date, current_time и current_timestamp записываются без скобок: так принято в стандарте SQL. current_timestamp - то же самое, что now(). current_date возвращает только дату, current_time - время с поясом. localtimestamp и localtime дают текущие значения без пояса.

В MySQL то же делают NOW(), CURDATE() и CURTIME(). Соответствие простое: NOW() - это now(), CURDATE() - current_date, CURTIME() - current_time.

## Время начала транзакции

Здесь есть особенность, неожиданная для тех, кто пришёл из других баз. now() и current_timestamp возвращают время начала текущей транзакции, а не момент вызова. Если вызвать now() дважды в одной транзакции, оба раза получится одно и то же значение. Это сделано намеренно: все записи, сделанные в транзакции, получают одну отметку времени.

Если нужен настоящий текущий момент, который меняется от вызова к вызову, используют clock_timestamp(). Она, например, нужна, чтобы замерить длительность отдельного шага внутри транзакции. Для обычных отчётов хватает now().

## Отсчёт от текущей даты

Чаще всего просят отчёты «за последние 7 дней», «за этот месяц», «за прошлый год». В рабочих запросах такие границы строятся на now() и current_date:

```sql
SELECT id, ordered_at FROM orders WHERE ordered_at >= now() - INTERVAL '7 days';
SELECT id FROM orders WHERE date_trunc('month', ordered_at) = date_trunc('month', now());
SELECT full_name FROM employees WHERE age(current_date, birth_date) < INTERVAL '30 years';
```

Первый запрос возвращает заказы за последние семь суток от текущего момента, второй - заказы этого календарного месяца, третий - сотрудников младше тридцати лет. Результат каждого зависит от дня, в который запрос выполнен.

Для курса это неудобно: ответ задачи должен быть один и тот же в любой день, а страницы уроков собираются заранее. Поэтому в условиях и примерах «сегодня» задано датой, например «считайте, что сегодня 15 апреля 2026 года». В запросе вместо current_date пишут `DATE '2026-04-15'`, и логика остаётся той же. При переносе в рабочий запрос литерал меняют на current_date.

```sql run=shop
SELECT id, ordered_at
FROM orders
WHERE ordered_at >= TIMESTAMP '2026-04-15' - INTERVAL '30 days'
  AND ordered_at <  TIMESTAMP '2026-04-15' + INTERVAL '1 day'
ORDER BY id;
```

Это тот же запрос «за последние 30 дней», но от фиксированного дня: 15 апреля 2026 года.

## Сегодня, вчера, этот месяц

Несколько заготовок, которые решают большинство задач. Опорную дату в каждой из них задаёт литерал.

Записи за один день: приведите timestamp к date и сравните с нужной датой. Здесь «сегодня» - 2 апреля 2026 года. Для столбца с индексом лучше полуоткрытый промежуток.

```sql run=shop
SELECT id, ordered_at
FROM orders
WHERE ordered_at::date = DATE '2026-04-02'
ORDER BY id;
```

Записи за текущий месяц (пусть сегодня 15 марта 2026 года): от начала месяца включительно до начала следующего. Начало месяца даёт date_trunc, начало следующего - прибавление месяца:

```sql run=shop
SELECT id, ordered_at
FROM orders
WHERE ordered_at >= date_trunc('month', TIMESTAMP '2026-03-15')
  AND ordered_at <  date_trunc('month', TIMESTAMP '2026-03-15') + INTERVAL '1 month'
ORDER BY id;
```

Записи за последние N месяцев: нижняя граница считается вычитанием INTERVAL 'N months'. Месяцы календарные, поэтому число дней в окне будет разным.

## Дни до события

Типичная задача: сколько дней до ближайшего дня рождения. Нужно собрать день рождения в текущем году через make_date, и если он уже прошёл, взять следующий год. Затем из полученной даты вычесть опорную:

```sql run=company
SELECT
  full_name,
  next_birthday,
  next_birthday - DATE '2026-04-15' AS days_left
FROM (
  SELECT
    full_name,
    CASE
      WHEN make_date(2026, EXTRACT(month FROM birth_date)::int, EXTRACT(day FROM birth_date)::int) >= DATE '2026-04-15'
        THEN make_date(2026, EXTRACT(month FROM birth_date)::int, EXTRACT(day FROM birth_date)::int)
      ELSE make_date(2027, EXTRACT(month FROM birth_date)::int, EXTRACT(day FROM birth_date)::int)
    END AS next_birthday
  FROM employees
) AS t
ORDER BY days_left, full_name
LIMIT 3;
```

Подзапрос в круглых скобках после FROM работает как временная таблица. Подробнее он разобран в разделе о подзапросах.

## Часовой пояс и текущее время

Поскольку now() возвращает timestamptz, на экране вы увидите время в поясе сессии. Чтобы показать его по-другому, используйте AT TIME ZONE, как в первом уроке раздела. Для хранения отметок «когда создана запись» берут timestamptz со значением по умолчанию now() - тогда любая вставка автоматически получает момент создания.

## Что называется иначе в MySQL

NOW(), SYSDATE(), CURRENT_TIMESTAMP() в MySQL различаются тем, когда берут время: NOW() - в начале запроса, SYSDATE() - в момент вызова. Аналоги в PostgreSQL: now() и clock_timestamp(). А CURDATE() и CURTIME() заменяются словами current_date и current_time.
