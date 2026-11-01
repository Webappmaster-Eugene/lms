---
title: Округление: ROUND, CEIL, FLOOR, TRUNC
slug: sql-expressions-rounding
minutes: 20
description: Как округлить число до нужного знака, вверх, вниз или отбросить лишние знаки, и почему ROUND с двумя аргументами не работает с double precision.
tasks: sql-expressions-price-per-page, sql-expressions-bonus, sql-expressions-rough-price, sql-expressions-temp-fahrenheit, sql-expressions-sheets, sql-expressions-price-thousands, sql-expressions-round-or-trunc
---
После деления и умножения дробей чаще всего нужно привести число к удобному виду: оставить два знака после запятой, округлить до целых рублей или узнать, сколько целых упаковок потребуется. Для этого в PostgreSQL есть четыре функции: `ROUND`, `CEIL`, `FLOOR` и `TRUNC`.

## ROUND

Функция `ROUND(x)` округляет до ближайшего целого, а `ROUND(x, n)` оставляет `n` знаков после запятой.

```sql run=empty
SELECT
  ROUND(3.14159) AS to_integer,
  ROUND(3.14159, 2) AS two_digits,
  ROUND(2.5) AS half_up,
  ROUND(-2.5) AS half_down;
```

Для типа numeric половинка округляется от нуля: 2,5 становится 3, а -2,5 становится -3. Другие правила (к чётному, к нулю) в PostgreSQL для numeric не используются.

Типичное применение - цена за единицу или процент:

```sql run=library
SELECT title, price, pages, ROUND(price / pages, 2) AS per_page
FROM books
WHERE price IS NOT NULL
ORDER BY id;
```

Книге «Хроники заводной птицы» цена не указана, поэтому условие отбрасывает её. Без этого условия в `per_page` был бы NULL.

## Отрицательное число знаков

Если второй аргумент отрицательный, округление идёт слева от запятой: `-1` даёт десятки, `-2` сотни, `-3` тысячи.

```sql run=shop
SELECT title, price, ROUND(price, -2) AS to_hundreds, ROUND(price, -3) AS to_thousands
FROM products
ORDER BY id
LIMIT 6;
```

Такое округление удобно для грубых оценок: цена 89990 превращается в 90000, то есть «около 90 тысяч».

## ROUND и тип double precision

Здесь скрыта ловушка, с которой сталкиваются почти все, кто пришёл из MySQL. В PostgreSQL есть `ROUND(numeric, integer)`, но нет `ROUND(double precision, integer)`. Если столбец или выражение имеет тип double precision, округление до знака вызовет ошибку:

```sql run=empty error
SELECT ROUND(2.718281828::double precision, 2);
```

Сообщение говорит, что функции с такими типами аргументов нет. Решение - привести значение к numeric:

```sql run=empty
SELECT ROUND(2.718281828::double precision::numeric, 2) AS fixed;
```

Одноаргументный `ROUND(x)` для double precision работает, но округляет по-другому: половинки идут к ближайшему чётному.

```sql run=empty
SELECT ROUND(2.5::double precision) AS from_double, ROUND(3.5::double precision) AS also_double, ROUND(2.5::numeric) AS from_numeric;
```

Поэтому, если важна предсказуемость, приводите к numeric и в этом случае. Тип double precision появляется из столбцов с таким типом, из функций `SQRT`, `POWER`, `RANDOM` для целых аргументов и из любых выражений, где он участвует.

## CEIL и FLOOR

`CEIL(x)` (есть и синоним `CEILING`) округляет вверх до ближайшего целого, `FLOOR(x)` - вниз. Для положительных чисел это «округлить с избытком» и «отбросить дробь», для отрицательных результат другой.

```sql run=empty
SELECT
  CEIL(4.1) AS ceil_pos, FLOOR(4.9) AS floor_pos,
  CEIL(-4.1) AS ceil_neg, FLOOR(-4.1) AS floor_neg;
```

Для -4,1 `CEIL` даёт -4, а `FLOOR` даёт -5: вверх и вниз считаются по числовой оси, а не по модулю. Типичная задача для CEIL - сколько нужно упаковок или страниц, если неполная тоже считается:

```sql run=library
SELECT title, pages, CEIL(pages / 2.0) AS sheets
FROM books
ORDER BY id
LIMIT 5;
```

Деление на `2.0`, а не на `2`, принципиально. Если поделить целые числа, дробь пропадёт ещё до вызова `CEIL`, и неполный лист потеряется.

## TRUNC

`TRUNC(x)` отбрасывает дробную часть, а `TRUNC(x, n)` оставляет `n` знаков и срезает остальные без округления. В MySQL эту роль выполняет функция `TRUNCATE(x, n)`, в PostgreSQL она называется `TRUNC`.

```sql run=empty
SELECT
  ROUND(2.678, 2) AS rounded,
  TRUNC(2.678, 2) AS truncated,
  TRUNC(-2.678) AS toward_zero,
  FLOOR(-2.678) AS toward_minus;
```

`ROUND` выбирает ближайшее значение (2,68), `TRUNC` просто отбрасывает лишнее (2,67). Для отрицательных чисел `TRUNC` идёт к нулю, а `FLOOR` - к минус бесконечности, поэтому для -2,678 получатся -2 и -3.

## Что выбрать

Для денег в отчёте обычно нужен ROUND(x, 2). Для расчёта числа упаковок, листов, страниц - CEIL. Для «полных единиц», например полных лет или целых коробок, - FLOOR или целочисленное деление. TRUNC нужен, когда округление недопустимо: например, при начислении процентов лишние доли копейки обычно отбрасывают.

Результат этих функций для numeric остаётся numeric, даже если дробной части нет: `ROUND(2.5)` выводится как 3, а `ROUND(2.5, 1)` - как 2.5. Приводить к `integer` нужно только тогда, когда это важно для следующего шага, например для склейки с текстом.
