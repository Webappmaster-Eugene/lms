---
title: Оконные функции
slug: sql-practice-window-functions
minutes: 50
description: OVER, PARTITION BY и ORDER BY в окне, нумерация и ранги, LAG и LEAD, накопительные суммы, NTILE, процентили и выбор лучшей строки в группе.
tasks: sql-practice-window-salary-place, sql-practice-window-top-paid-per-department, sql-practice-window-dense-rank-years, sql-practice-window-top-months-rank, sql-practice-window-month-change, sql-practice-window-days-to-next-order, sql-practice-window-running-total, sql-practice-window-moving-average, sql-practice-window-top-quarter-salary, sql-practice-window-longest-books, sql-practice-window-median-salary, sql-practice-window-median-price, sql-practice-window-second-order, sql-practice-window-payroll-share, sql-practice-window-sales-forecast
---
Группировка отвечает на вопрос «сколько в целом по группе», но схлопывает строки: от группы остаётся одна. Оконная функция считает то же самое, не убирая строки. Рядом с каждым сотрудником можно вывести среднюю зарплату его отдела, номер места, значение из предыдущей строки. Для рейтингов, сравнения с соседними значениями и накопительных итогов это основной инструмент.

## Конструкция OVER

Оконная функция записывается как обычная функция, за которой стоит OVER. В скобках задаётся окно, то есть набор строк, над которым функция работает. Самая простая форма с пустыми скобками берёт все строки результата:

```sql run=company
SELECT full_name, salary, ROUND(AVG(salary) OVER (), 0) AS company_avg
FROM employees
ORDER BY id
LIMIT 4;
```

Каждая строка осталась на месте, а рядом с ней стоит среднее по всей таблице. С GROUP BY так не получилось бы.

PARTITION BY делит строки на группы, и функция считает отдельно в каждой. Среднее по отделу рядом с каждым сотрудником:

```sql run=company
SELECT full_name, department_id, salary,
       ROUND(AVG(salary) OVER (PARTITION BY department_id), 0) AS department_avg
FROM employees
WHERE department_id IS NOT NULL
ORDER BY department_id, id;
```

Оконные функции вычисляются после WHERE, GROUP BY и HAVING, но до итоговой сортировки. Поэтому в WHERE нельзя сослаться на результат окна: чтобы отфильтровать по нему, запрос оборачивают во внешний.

## Нумерация и ранги

ORDER BY внутри OVER задаёт порядок строк в окне. Три функции нумеруют строки, а различаются тем, что делают с равными значениями. Возьмём книги, у двух из которых одинаковый год издания:

```sql run=library
SELECT title, published_year,
       ROW_NUMBER() OVER (ORDER BY published_year DESC, id) AS row_num,
       RANK() OVER (ORDER BY published_year DESC) AS rank_pos,
       DENSE_RANK() OVER (ORDER BY published_year DESC) AS dense_pos
FROM books
ORDER BY published_year DESC, id;
```

ROW_NUMBER даёт каждой строке уникальный номер; при равных значениях порядок определяется остальными ключами, поэтому второй ключ нужен. RANK даёт равным значениям одно место и оставляет пропуск: после двух книг на месте 5 идёт место 7. DENSE_RANK пропусков не оставляет. Когда в условии есть ничьи, выбор функции - это выбор правила: «одно место на двоих и пропуск» или «одно место на двоих, дальше подряд».

## Лучшая строка в группе

Самый частый приём: пронумеровать строки в каждой группе и оставить первую. Самый высокооплачиваемый сотрудник отдела:

```sql run=company
SELECT department_id, full_name, salary
FROM (
  SELECT department_id, full_name, salary,
         ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY salary DESC, id) AS rn
  FROM employees
  WHERE department_id IS NOT NULL
) t
WHERE rn = 1
ORDER BY department_id;
```

Нумерация вынесена в подзапрос, потому что фильтровать по ней в том же запросе нельзя. Если нужен не один человек, а все, кто разделил первое место, замените ROW_NUMBER на RANK и оставьте `rank = 1`. Если нужны две-три лучшие строки, условие `rn <= 3`.

## Соседние значения: LAG и LEAD

LAG берёт значение из предыдущей строки окна, LEAD из следующей. Так считают изменение к прошлому периоду. Таблицу продаж создадим в самом блоке:

```sql run=empty
WITH sales(product, month, revenue) AS (
  VALUES ('Тетради', DATE '2026-01-01', 100), ('Тетради', DATE '2026-02-01', 90), ('Тетради', DATE '2026-03-01', 110),
         ('Ручки', DATE '2026-01-01', 40), ('Ручки', DATE '2026-02-01', 55)
)
SELECT product, month, revenue,
       LAG(revenue) OVER (PARTITION BY product ORDER BY month) AS prev_revenue,
       revenue - LAG(revenue) OVER (PARTITION BY product ORDER BY month) AS change
FROM sales
ORDER BY product, month;
```

В первом месяце каждого товара предыдущей строки нет, и LAG возвращает NULL. Если нужно другое значение, его задают вторым и третьим аргументами: `LAG(revenue, 1, 0)` вернёт ноль вместо NULL. Без PARTITION BY функция взяла бы предыдущую строку всей таблицы и сравнила бы январь «Ручек» с мартом «Тетрадей». В MySQL 8 эти функции называются так же; переменные для накопления, которыми обходились в старых версиях MySQL, в PostgreSQL заменяют оконные суммы.

## Накопительная сумма и рамка

Если в OVER есть ORDER BY, агрегат считается от начала группы до текущей строки:

```sql run=empty
WITH sales(product, month, revenue) AS (
  VALUES ('Тетради', DATE '2026-01-01', 100), ('Тетради', DATE '2026-02-01', 90), ('Тетради', DATE '2026-03-01', 110),
         ('Тетради', DATE '2026-04-01', 120)
)
SELECT month, revenue,
       SUM(revenue) OVER (ORDER BY month) AS running_total,
       ROUND(AVG(revenue) OVER (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 1) AS avg_3m
FROM sales
ORDER BY month;
```

Часть ROWS BETWEEN ... называется рамкой окна: она ограничивает, какие строки группы видит функция. Запись 2 PRECEDING AND CURRENT ROW означает «две предыдущие строки и текущая», так получается скользящее среднее. Без явной рамки при наличии ORDER BY работает рамка «от начала группы до текущей строки и всех её равных по ключу». Для сумм с повторяющимся ключом это значит, что строки с одним значением ключа получат одну и ту же накопленную сумму. Если нужно строго по строкам, пишите ROWS явно.

## Группы поровну: NTILE и PERCENT_RANK

NTILE(n) делит упорядоченные строки на n групп почти равного размера и возвращает номер группы. Если строки не делятся нацело, первые группы получаются на одну строку больше. Так получают «верхние 25 процентов» или квартили:

```sql run=company
SELECT full_name, salary, NTILE(4) OVER (ORDER BY salary DESC, id) AS quarter
FROM employees
ORDER BY salary DESC, id;
```

Равные значения NTILE может разнести по разным группам, поэтому сортировка в окне должна быть однозначной. PERCENT_RANK возвращает долю от 0 до 1: у наименьшего значения 0, у наибольшего 1. Условие «верхние 20 процентов» тогда читается как `PERCENT_RANK() >= 0.8`, а равные значения получают равный ранг. Как и номер строки, процентный ранг нельзя проверять в WHERE того же запроса, его вычисляют в подзапросе.

## Медиана

Медиана делит выборку пополам. Отдельной функции в PostgreSQL нет, зато есть агрегат percentile_cont с синтаксисом WITHIN GROUP:

```sql run=company
SELECT d.name AS department,
       ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY e.salary))::numeric, 2) AS median_salary
FROM departments d
JOIN employees e ON e.department_id = d.id
GROUP BY d.id, d.name
ORDER BY d.name;
```

Это обычный агрегат, а не оконная функция, поэтому ему нужен GROUP BY. При чётном числе значений percentile_cont берёт среднее двух центральных, а percentile_disc выбирает одно из имеющихся. Значение 0.5 можно заменить любой долей: 0.9 даст девяностый процентиль. Результат имеет тип double precision, поэтому перед ROUND с двумя знаками его приводят к numeric.

## Прогноз по истории

Простой прогноз строится из тех же средств. Для следующего месяца берём последнее значение и прибавляем среднее приращение, то есть разницу между последним и первым значением, делённую на число интервалов. Первое значение даёт FIRST_VALUE, число месяцев COUNT(*) OVER, а последнюю строку помечает нумерация по убыванию месяца. Такой прогноз учитывает только две точки и предназначен для оценки порядка величины, а не для планирования.

## Перед решением

Перед решением ответьте на три вопроса: что в окне служит группой, по какому ключу упорядочены строки и что должно происходить при равных значениях. Для рейтингов в условии сказано, как разрешать ничьи, и это правило определяет выбор между ROW_NUMBER, RANK и DENSE_RANK.
