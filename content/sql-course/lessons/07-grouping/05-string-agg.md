---
title: STRING_AGG и ARRAY_AGG: значения группы в одну ячейку
slug: sql-grouping-string-agg
minutes: 20
description: Как собрать значения группы в строку с разделителем или в массив, как задать порядок элементов и что происходит с NULL.
tasks: sql-grouping-agg-genre-titles, sql-grouping-agg-department-names, sql-grouping-agg-category-cheap, sql-grouping-agg-distinct-cities, sql-grouping-agg-order-ids, sql-grouping-agg-employee-emails, sql-grouping-agg-order-products, sql-grouping-agg-city-customers
---
Обычные агрегаты возвращают число: сумму, количество, максимум. Но иногда нужно показать сами значения группы, например имена всех сотрудников отдела в одной ячейке. Для этого в PostgreSQL есть string_agg, который склеивает значения в строку, и array_agg, который собирает их в массив.

## string_agg

Функция принимает два аргумента: что склеивать и чем разделять.

```sql run=company
SELECT department_id, string_agg(full_name, ', ') AS names
FROM employees
WHERE department_id IS NOT NULL
GROUP BY department_id
ORDER BY department_id;
```

Для каждого отдела получилась одна строка с именами через запятую. Разделитель ставится только между значениями: ни в начале, ни в конце его нет.

В MySQL та же задача решается функцией GROUP_CONCAT. Её разделитель задают словом SEPARATOR, а в PostgreSQL он идёт вторым аргументом. Если в чужом коде встретится GROUP_CONCAT, заменяйте его на string_agg.

## Порядок внутри строки

Попробуйте запустить запрос выше несколько раз на большой таблице, и вы обнаружите, что порядок имён может меняться. Агрегат собирает значения в том порядке, в каком получает строки, а он не гарантирован. Если порядок важен, его задают внутри скобок:

```sql run=company
SELECT department_id,
  string_agg(full_name, ', ' ORDER BY full_name) AS names
FROM employees
WHERE department_id IS NOT NULL
GROUP BY department_id
ORDER BY department_id;
```

ORDER BY внутри функции сортирует элементы строки. ORDER BY в конце запроса сортирует строки результата, это две разные сортировки, и нужна может быть любая из них или обе. Внутри можно указать несколько ключей и направление, как обычно:

```sql run=shop
SELECT category_id,
  string_agg(title, ', ' ORDER BY price DESC, id) AS titles
FROM products
WHERE category_id IS NOT NULL
GROUP BY category_id
ORDER BY category_id;
```

Здесь названия товаров идут от дорогих к дешёвым.

## NULL в string_agg

Значение NULL пропускается вместе с разделителем. Адреса почты сотрудников отдела 1: у Дениса Орлова адреса нет.

```sql run=company
SELECT string_agg(email, '; ' ORDER BY id) AS emails
FROM employees
WHERE department_id = 1;
```

В строке три адреса и два разделителя, пустой позиции для Дениса нет. А вот если все значения группы NULL, или группа пуста, результат целиком будет NULL, а не пустая строка. Для отчёта это можно исправить: `COALESCE(string_agg(...), '')`.

Если NULL нужно показать, замените его заранее: `string_agg(COALESCE(email, 'нет'), '; ')`.

## Повторы

DISTINCT внутри агрегата убирает одинаковые значения. Города, в которых живут покупатели:

```sql run=shop
SELECT string_agg(DISTINCT city, ', ' ORDER BY city) AS cities FROM customers;
```

Когда DISTINCT совмещён с ORDER BY, выражение сортировки должно совпадать с тем, что собирается. Сортировать по другому столбцу нельзя: после удаления повторов непонятно, какую из строк-дублей взять.

## string_agg и число

string_agg принимает только текст. Если склеивать нужно числа, приведите их через `::text` или `CAST`:

```sql run=shop
SELECT order_id,
  string_agg(product_id::text, '-' ORDER BY product_id) AS product_ids
FROM order_items
GROUP BY order_id
ORDER BY order_id;
```

Без приведения PostgreSQL ответит ошибкой о том, что функции string_agg для целых чисел не существует:

```sql run=shop error
SELECT order_id, string_agg(product_id, '-') FROM order_items GROUP BY order_id;
```

## array_agg

Когда результат читает программа, а не человек, удобнее массив. array_agg собирает значения группы в массив и сохраняет их тип:

```sql run=shop
SELECT customer_id, array_agg(id ORDER BY id) AS order_ids
FROM orders
GROUP BY customer_id
ORDER BY customer_id;
```

Массив из чисел остаётся массивом чисел, его не нужно разбирать обратно из строки. Сортировка внутри и DISTINCT работают так же, как у string_agg. В отличие от string_agg, array_agg не пропускает NULL: пустое значение окажется в массиве как NULL.

```sql run=empty
SELECT array_agg(v ORDER BY v NULLS LAST) AS with_nulls,
       array_agg(v ORDER BY v NULLS LAST) FILTER (WHERE v IS NOT NULL) AS without_nulls
FROM (VALUES (3), (NULL), (1)) AS t(v);
```

Массив можно превратить в строку функцией array_to_string, если понадобится: `array_to_string(array_agg(...), ', ')`. Но проще сразу использовать string_agg.

## Вместе с другими агрегатами

string_agg и array_agg - такие же агрегаты, как остальные. В одном запросе их можно сочетать с COUNT и SUM, все они считаются по одним и тем же группам:

```sql run=shop
SELECT city,
  COUNT(*) AS customers_count,
  string_agg(full_name, ', ' ORDER BY full_name) AS names
FROM customers
WHERE city IS NOT NULL
GROUP BY city
ORDER BY customers_count DESC, city;
```

Это удобный способ превратить длинный список в короткую сводку: вместо нескольких строк на отдел получается одна, с числом людей и именами в ячейке. Но будьте осторожны с большими группами. Строка из тысяч значений трудно читается и тяжело передаётся по сети, для больших объёмов лучше оставить значения отдельными строками.
