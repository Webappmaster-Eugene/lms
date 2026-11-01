---
title: Индексы и планы запросов
slug: sql-meta-index-plans
minutes: 20
description: Как подобрать индекс под запрос и увидеть его в плане: индекс по выражению, составной индекс, частичный индекс, лишние индексы, и как проверить решение по каталогу pg_indexes.
tasks: sql-meta-index-lower-email, sql-meta-index-composite, sql-meta-index-partial, sql-meta-index-redundant
---
Индексы мы создавали в разделе о структуре таблиц, а план запроса разбирали в прошлом уроке. Теперь соединим: берём запрос и подбираем индекс, который ему подходит. Правило одно. Индекс помогает, когда его определение повторяет форму условия в запросе. Чтобы увидеть, использует ли план индекс, пользуются EXPLAIN, а чтобы увидеть, какие индексы есть, - каталогом `pg_indexes`.

## Таблицы для примеров

В примерах нет готовой таблицы с индексами, поэтому они строят свою. Таблица побольше, чтобы индекс стал выгоден:

```sql run=empty
CREATE TABLE customers AS
SELECT g AS id, 'user' || g || '@Mail.example' AS email, g % 5 AS bucket
FROM generate_series(1, 2000) AS g;
ALTER TABLE customers ADD PRIMARY KEY (id);
ANALYZE customers;
EXPLAIN (COSTS OFF) SELECT * FROM customers WHERE id = 500;
```

Для поиска по первичному ключу PostgreSQL использует индекс, который создал сам.

## Функция в условии

Теперь запрос по почте без учёта регистра:

```sql run=empty
CREATE TABLE customers AS
SELECT g AS id, 'user' || g || '@Mail.example' AS email
FROM generate_series(1, 2000) AS g;
CREATE INDEX idx_customers_email ON customers (email);
ANALYZE customers;
EXPLAIN (COSTS OFF) SELECT * FROM customers WHERE lower(email) = 'user77@mail.example';
```

Индекс по `email` есть, но план показывает Seq Scan: условие сравнивает не `email`, а `lower(email)`, и индекс по самому столбцу к нему не подходит. Нужен индекс по выражению:

```sql run=empty
CREATE TABLE customers AS
SELECT g AS id, 'user' || g || '@Mail.example' AS email
FROM generate_series(1, 2000) AS g;
CREATE INDEX idx_customers_email_lower ON customers (lower(email));
ANALYZE customers;
EXPLAIN (COSTS OFF) SELECT * FROM customers WHERE lower(email) = 'user77@mail.example';
```

Теперь в плане Index Scan по `idx_customers_email_lower`. Выражение в запросе и в индексе должно совпадать.

## Составной индекс под условие и сортировку

Запрос с равенством и диапазоном: приёмы в статусе `planned`, начиная с 1 декабря. Индекс строят так: первым идёт столбец с равенством, вторым столбец с диапазоном.

```sql run=empty
CREATE TABLE visits AS
SELECT g AS id,
       (ARRAY['planned', 'done', 'cancelled'])[g % 3 + 1] AS status,
       DATE '2026-01-01' + (g % 365) AS visit_date
FROM generate_series(1, 3000) AS g;
CREATE INDEX idx_visits_status_date ON visits (status, visit_date);
ANALYZE visits;
EXPLAIN (COSTS OFF)
SELECT * FROM visits
WHERE status = 'planned' AND visit_date >= '2026-12-01';
```

Индекс отбирает нужный статус, а внутри него уже упорядоченные даты, поэтому условие по диапазону проверяется только на узком участке. Узел Bitmap Heap Scan сначала собирает по индексу список нужных страниц таблицы, а потом читает их. Если поменять столбцы местами, то есть `(visit_date, status)`, диапазон по дате останется широким, а статус будет проверяться внутри него.

## Частичный индекс

Когда запросы почти всегда касаются узкой части строк, частичный индекс получается намного меньше. Таблица приёмов, в которой «запланированных» мало, а расписание показывает только их:

```sql run=empty
CREATE TABLE visits AS
SELECT g AS id,
       CASE WHEN g % 20 = 0 THEN 'planned' ELSE 'done' END AS status,
       DATE '2026-01-01' + (g % 365) AS visit_date
FROM generate_series(1, 3000) AS g;
CREATE INDEX idx_visits_planned ON visits (visit_date) WHERE status = 'planned';
ANALYZE visits;
EXPLAIN (COSTS OFF) SELECT * FROM visits WHERE status = 'planned' ORDER BY visit_date;
```

Индекс хранит записи только для 5 процентов строк, поэтому он мал, и обновление остальных 95 процентов его не затрагивает. Условие запроса `status = 'planned'` совпадает с условием индекса, и индекс подходит. Для запроса с другим статусом он бесполезен.

## Лишние индексы

Индекс по `(patient_id, visit_date)` содержит всё, что нужно для поиска по одному `patient_id`: он начинается с этого столбца. Поэтому отдельный индекс по `patient_id` не нужен. Каждый такой дубль замедляет запись и занимает место. Найти кандидатов на удаление помогает `pg_indexes`: ищите индексы таблицы, определение которых совпадает с началом определения другого индекса.

```sql run=empty
CREATE TABLE visits (id integer PRIMARY KEY, patient_id integer, visit_date date);
CREATE INDEX visits_patient_idx ON visits (patient_id);
CREATE INDEX visits_patient_date_idx ON visits (patient_id, visit_date);
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'visits'
ORDER BY indexname;
```

В этом списке `visits_patient_idx` лишний. Прежде чем удалить его в рабочей базе, проверьте, не используют ли индекс какие-то запросы напрямую (статистика использования лежит в `pg_stat_user_indexes`), и только потом выполните `DROP INDEX`.

## Когда индекс не нужен

Три ситуации, когда новый индекс ничего не даст. Таблица маленькая. Условие возвращает большую долю таблицы. Запрос редкий, а таблица часто обновляется: затраты на поддержку индекса не окупятся. Каждый раз, когда хочется добавить индекс, посмотрите на план запроса до и после и сравните оценки. Если план не изменился, индекс можно не создавать.

## Как проверить решение в практике

План запроса зависит от размера таблицы, статистики и версии базы, поэтому в практике задачи проверяются по каталогу. Решение сравнивается по определению индекса в `pg_indexes`, а не по тексту EXPLAIN. Имя индекса при этом не учитывается, если условие его не задаёт. Ваша задача - записать индекс так, чтобы его определение подходило форме запроса из условия.
