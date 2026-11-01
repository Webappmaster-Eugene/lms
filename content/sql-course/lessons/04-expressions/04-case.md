---
title: CASE: условия в выражениях
slug: sql-expressions-case
minutes: 20
description: Простой и поисковый CASE, ветка ELSE, CASE в SELECT и ORDER BY, и чем он заменяет IF из MySQL.
tasks: sql-expressions-salary-grade, sql-expressions-status-ru, sql-expressions-stock-label, sql-expressions-managers-first, sql-expressions-book-size, sql-expressions-customer-region, sql-expressions-tier-total
---
Иногда значение в столбце результата нужно выбирать по условию: разряд по зарплате, русское название статуса, пометку «мало» или «много». Для этого в SQL есть выражение `CASE`. Оно похоже на цепочку `if / else if / else` в языках программирования, но возвращает значение, а не выполняет действие, поэтому его можно ставить везде, где допустимо выражение.

В MySQL есть ещё функция `IF(условие, a, b)`. В PostgreSQL её нет, вместо неё всегда используют `CASE`.

## CASE с условиями

Основная форма начинается с `CASE`, затем идут ветки `WHEN условие THEN значение`, необязательная ветка `ELSE` и слово `END`:

```sql run=company
SELECT
  full_name,
  salary,
  CASE
    WHEN salary >= 200000 THEN 'высокий'
    WHEN salary >= 100000 THEN 'средний'
    ELSE 'базовый'
  END AS grade
FROM employees
ORDER BY id;
```

PostgreSQL проверяет условия сверху вниз и берёт значение первой подошедшей ветки, остальные уже не смотрит. Поэтому порядок веток - часть логики. Если поставить `salary >= 100000` выше, то под него попадут и те, у кого зарплата больше 200000, и ветка «высокий» никогда не сработает.

Конец выражения обозначает `END`, а не `END CASE`. Забытое `END` - самая частая синтаксическая ошибка в первых запросах с CASE.

## Простой CASE

Когда одно выражение сравнивается с набором значений на равенство, можно написать его один раз после `CASE`:

```sql run=shop
SELECT
  id,
  status,
  CASE status
    WHEN 'new' THEN 'Новый'
    WHEN 'paid' THEN 'Оплачен'
    WHEN 'shipped' THEN 'Отправлен'
    WHEN 'cancelled' THEN 'Отменён'
    ELSE 'Неизвестно'
  END AS status_ru
FROM orders
ORDER BY id;
```

Простая форма короче, но умеет только сравнивать на равенство. Для неравенств, диапазонов, `IS NULL` и `LIKE` нужна основная форма. Сравнение в простой форме работает по тем же правилам, что обычное `=`: значение NULL ни с чем не совпадает, даже с другим NULL.

## Что будет без ELSE

Если ни одно условие не подошло и ветки `ELSE` нет, результатом будет NULL. Иногда это то, что нужно, но чаще это забытая ветка:

```sql run=library
SELECT
  title,
  pages,
  CASE
    WHEN pages >= 800 THEN 'толстая'
    WHEN pages <= 200 THEN 'тонкая'
  END AS size
FROM books
ORDER BY id;
```

У книг средней толщины в `size` стоит NULL. Если вам нужна надпись, добавьте `ELSE 'средняя'`.

Типы значений во всех ветках должны быть совместимы. Нельзя вернуть из одной ветки текст, а из другой число: PostgreSQL выдаст ошибку, потому что столбец результата может иметь только один тип.

```sql run=empty error
SELECT CASE WHEN 1 > 0 THEN 'да' ELSE 0 END;
```

## NULL внутри условий

Условие `WHEN` срабатывает только тогда, когда оно истинно. Если оно ложно или неизвестно (результат сравнения с NULL), ветка пропускается. Поэтому пропущенные значения нужно ловить отдельным условием `IS NULL`:

```sql run=shop
SELECT
  full_name,
  city,
  CASE
    WHEN city IN ('Москва', 'Санкт-Петербург') THEN 'столица'
    WHEN city IS NULL THEN 'не указан'
    ELSE 'регион'
  END AS region
FROM customers
ORDER BY id;
```

Запись `WHEN city = NULL` никогда не сработает: сравнение с NULL всегда неизвестно.

## Выражения внутри веток

В ветках `THEN` и в условиях стоят обычные выражения, поэтому можно считать прямо в CASE. Например, скидка за количество:

```sql run=shop
SELECT
  order_id,
  product_id,
  quantity,
  price * quantity AS full_price,
  CASE
    WHEN quantity >= 3 THEN price * quantity * 0.9
    ELSE price * quantity
  END AS total
FROM order_items
ORDER BY order_id, product_id;
```

## CASE в ORDER BY

Выражение CASE можно поставить в `ORDER BY`. Так задают свой порядок, которого нет у самих значений: «сначала руководители, потом остальные», «сначала новые заказы, затем оплаченные».

```sql run=company
SELECT full_name, position
FROM employees
ORDER BY
  CASE WHEN position LIKE 'Руководитель%' THEN 0 ELSE 1 END,
  full_name;
```

CASE возвращает 0 или 1, по этому числу идёт сортировка, а внутри групп работает второй ключ. Запомните этот приём: он заменяет функцию `FIELD` из MySQL, которой в PostgreSQL нет.

## CASE и WHERE

CASE годится и в условии, но чаще то же самое выражается проще через `AND` и `OR`. Подход «CASE в WHERE» полезен, когда порог выбирается по значению другого столбца:

```sql run=company
SELECT full_name, salary
FROM employees
WHERE salary >= CASE WHEN department_id = 1 THEN 200000 ELSE 100000 END
ORDER BY id;
```

В отделе разработки отбираются зарплаты от 200000, во всех остальных - от 100000. Стажёр без отдела попадает во вторую группу: сравнение `department_id = 1` для NULL неизвестно, и срабатывает `ELSE`.

## Вложенные CASE

CASE можно вкладывать, но три уровня уже трудно читать. Чаще всего цепочку `WHEN` с несколькими условиями через `AND` читать проще. Если ветвление растёт, возможно, стоит вынести его в отдельную таблицу соответствий и подключать через соединение. Это тема одного из следующих разделов.
