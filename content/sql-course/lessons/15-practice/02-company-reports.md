---
title: Отчёты по компании и связи между строками
slug: sql-practice-company-reports
minutes: 40
description: Сравнение со средним по группе и по всей таблице, самосоединение для руководителей и пар, а также поиск друзей друзей в таблице связей.
tasks: sql-practice-company-departments-above-average, sql-practice-company-above-department-average, sql-practice-company-headcount, sql-practice-company-managers-reports, sql-practice-company-salary-gap, sql-practice-company-average-tenure, sql-practice-company-age-groups, sql-practice-company-close-salary-pairs, sql-practice-network-friends-of-friends, sql-practice-network-common-friends, sql-practice-network-popularity
---
Отчёты по сотрудникам чаще всего сравнивают числа между собой: зарплату со средней по отделу, отдел с компанией, сотрудника с его руководителем. Для каждого сравнения нужно решить, откуда взять число, с которым сравниваем, и в какой части запроса его считать. Этот урок разбирает три приёма: сравнение со средним, самосоединение и обход связей между людьми.

## Сравнение со средним

Сравнивать можно с одним числом на всю таблицу или с числом, зависящим от строки. Это разные задачи, и устроены они по-разному.

Отделы, где средняя зарплата выше общей по компании: сравниваются две цифры, поэтому условие относится к группе и пишется в HAVING, а общее среднее считается скалярным подзапросом, то есть запросом, который возвращает одно число:

```sql run=company
SELECT d.name AS department, ROUND(AVG(e.salary), 2) AS avg_salary
FROM departments d
JOIN employees e ON e.department_id = d.id
GROUP BY d.id, d.name
HAVING AVG(e.salary) > (SELECT AVG(salary) FROM employees)
ORDER BY avg_salary DESC;
```

Общее среднее считается по всей таблице `employees`, в том числе по сотруднику без отдела. Если взять его из уже соединённого запроса, стажёр без отдела выпал бы из расчёта, и число стало бы другим. Проверьте себя: какое среднее нужно по условию, всех сотрудников или только отнесённых к отделам.

Сотрудники с зарплатой выше средней по своему отделу: среднее у каждого своё, значит, нужен коррелированный подзапрос, который ссылается на строку внешнего запроса:

```sql run=company
SELECT e.full_name, d.name AS department, e.salary
FROM employees e
JOIN departments d ON d.id = e.department_id
WHERE e.salary > (
  SELECT AVG(e2.salary)
  FROM employees e2
  WHERE e2.department_id = e.department_id
)
ORDER BY d.name, e.salary DESC;
```

Подзапрос выполняется для каждой строки с её `department_id`. У сотрудников без отдела условие `department_id = NULL` не выполняется, поэтому среднее равно NULL, сравнение не истинно, и они в ответ не попадают.

## Пустые группы

Если в отчёте по отделам должны быть и пустые, начинайте с `departments` и присоединяйте сотрудников слева. Считайте через COUNT по столбцу правой таблицы: COUNT(*) насчитал бы единицу и для пустого отдела, ведь строка отдела всё равно есть.

```sql run=company
SELECT d.name AS department,
       COUNT(e.id) AS employees_count,
       COALESCE(SUM(e.salary), 0) AS payroll
FROM departments d
LEFT JOIN employees e ON e.department_id = d.id
GROUP BY d.id, d.name
ORDER BY payroll DESC, d.name;
```

## Самосоединение

Когда строки таблицы ссылаются на другие её строки, таблицу присоединяют к самой себе под двумя псевдонимами. В `employees` столбец `manager_id` указывает на другого сотрудника. Один псевдоним читается как «руководитель», другой как «подчинённый»:

```sql run=company
SELECT m.full_name AS manager, COUNT(*) AS reports_count
FROM employees m
JOIN employees e ON e.manager_id = m.id
GROUP BY m.id, m.full_name
ORDER BY reports_count DESC, manager;
```

Эта же схема отвечает на вопрос о парах. Чтобы получить пары коллег одного отдела, соединяйте таблицу с собой по отделу и ставьте условие `a.id < b.id`. Оно оставляет каждую пару в одном порядке и исключает пару сотрудника с самим собой:

```sql run=company
SELECT a.full_name AS first_employee, b.full_name AS second_employee
FROM employees a
JOIN employees b ON b.department_id = a.department_id AND a.id < b.id
ORDER BY a.id, b.id;
```

Сотрудник без отдела ни в какую пару не попал: равенство с NULL не выполняется ни для кого.

## Даты в отчётах

В отчётах про стаж и возраст «сегодня» должно быть датой из условия, а не результатом `now()`: иначе завтра ответ изменится. Стаж в годах получается как разность дат, делённая на 365.25, а полный возраст надёжнее считать функцией AGE:

```sql run=company
SELECT full_name,
       EXTRACT(YEAR FROM AGE(DATE '2026-01-01', birth_date)) AS age_years
FROM employees
ORDER BY birth_date
LIMIT 3;
```

Разность годов `2026 - EXTRACT(YEAR FROM birth_date)` ошибается на единицу у тех, у кого день рождения ещё не наступил. AGE учитывает месяц и день.

## Обход связей: друзья друзей

Дружба между людьми хранится как таблица пар. Пара (1, 2) означает, что люди 1 и 2 дружат, и записана она один раз. Чтобы искать «друзей друзей», связи удобно сначала развернуть в обе стороны: каждая пара превращается в две строки. Для этого служит UNION ALL. Покажем на маленьком примере, который создан прямо в блоке:

```sql run=empty
WITH friendships(person_a, person_b) AS (
  VALUES (1, 2), (1, 3), (2, 4), (3, 4), (4, 5)
),
links AS (
  SELECT person_a AS who, person_b AS friend FROM friendships
  UNION ALL
  SELECT person_b, person_a FROM friendships
)
SELECT DISTINCT f2.friend AS suggestion
FROM links f1
JOIN links f2 ON f2.who = f1.friend
WHERE f1.who = 1
  AND f2.friend <> 1
  AND NOT EXISTS (SELECT 1 FROM links d WHERE d.who = 1 AND d.friend = f2.friend)
ORDER BY suggestion;
```

Первое соединение выбирает друзей человека 1, второе шаг за шагом доходит до их друзей. Дальше убираем самого человека и тех, с кем он уже дружит. DISTINCT нужен потому, что до человека 4 ведут два пути: через 2 и через 3.

Тот же приём считает число друзей у каждого. Здесь нужен UNION ALL, а не UNION: UNION схлопнет одинаковые строки, а повторы нужны, чтобы посчитать их.

## Проверка результата

Для таких отчётов хорошо помогает ручной подсчёт на двух-трёх строках. Выберите одного сотрудника или одного человека, прикиньте ответ на бумаге и сравните с запросом. Если ответ не совпал, выведите промежуточные строки соединения и найдите, где появились лишние или пропали нужные.
