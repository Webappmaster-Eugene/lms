---
title: Ограничения: NOT NULL, DEFAULT, UNIQUE, CHECK, PRIMARY KEY
slug: sql-ddl-constraints
minutes: 25
description: Как заставить базу следить за данными: обязательные значения, значения по умолчанию, уникальность, условия на значения и первичный ключ, в том числе составной.
tasks: sql-ddl-not-null-default, sql-ddl-unique, sql-ddl-check-two, sql-ddl-composite-pk, sql-ddl-named-check
---
Ограничение - это правило, которое база проверяет при каждой вставке и изменении строки. Если строка правило нарушает, команда завершается ошибкой, а данные остаются прежними. Проверять данные в самой базе надёжнее, чем в приложении: приложений может быть несколько, а база одна.

## NOT NULL и DEFAULT

По умолчанию столбец допускает NULL. Слова NOT NULL запрещают пустое значение, а DEFAULT подставляет значение, если при вставке столбец не назван:

```sql run=empty
CREATE TABLE members (
  id integer NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
);
INSERT INTO members (id, name) VALUES (1, 'Вера');
SELECT * FROM members;
```

Значение по умолчанию может быть выражением, а не только константой, например `now()`. Если же значение указано явно, DEFAULT не действует, даже если указан NULL. Попытка вставить пустое имя вызывает ошибку:

```sql run=empty error
CREATE TABLE members (id integer NOT NULL, name text NOT NULL);
INSERT INTO members (id, name) VALUES (2, NULL);
```

## UNIQUE

Ограничение UNIQUE запрещает повторы значений в столбце или в сочетании столбцов. Под него база строит уникальный индекс, поэтому поиск по таким столбцам быстрый:

```sql run=empty error
CREATE TABLE accounts (
  id integer PRIMARY KEY,
  login text NOT NULL UNIQUE
);
INSERT INTO accounts VALUES (1, 'anna'), (2, 'anna');
```

С NULL ограничение UNIQUE обращается особо: NULL не равен другому NULL, поэтому в столбце с UNIQUE можно хранить сколько угодно пустых значений. Если пустое значение тоже нужно запретить, добавляют NOT NULL.

Уникальной бывает и пара значений. Ограничение записывают на уровне таблицы:

```sql run=empty
CREATE TABLE room_bookings (
  room integer NOT NULL,
  day date NOT NULL,
  guest text,
  UNIQUE (room, day)
);
INSERT INTO room_bookings VALUES (1, '2026-05-01', 'Игорь'), (2, '2026-05-01', 'Мария');
SELECT * FROM room_bookings ORDER BY room;
```

Одну и ту же комнату нельзя занять дважды в один день, а разные комнаты в один день можно.

## CHECK

CHECK задаёт условие, которому должна отвечать каждая строка:

```sql run=empty error
CREATE TABLE items (
  id integer PRIMARY KEY,
  price numeric(10, 2) CHECK (price > 0),
  stock integer CHECK (stock >= 0)
);
INSERT INTO items VALUES (1, -5, 10);
```

Нарушение проверки останавливает вставку. Строка проходит CHECK, если условие истинно или равно NULL. Поэтому пустая цена проверку price > 0 проходит: NULL > 0 даёт NULL. Если цена обязательна, к CHECK нужен ещё NOT NULL.

Условие может смотреть на несколько столбцов строки, например `CHECK (end_date >= start_date)`. Но проверить значения в других строках или таблицах CHECK не может: для этого есть уникальность и внешние ключи.

## PRIMARY KEY

Первичный ключ - это столбец (или набор столбцов), который однозначно определяет строку. Он включает в себя UNIQUE и NOT NULL, и в таблице он может быть только один:

```sql run=empty
CREATE TABLE courses (
  id integer PRIMARY KEY,
  title text NOT NULL
);
SELECT constraint_type FROM information_schema.table_constraints WHERE table_name = 'courses' ORDER BY constraint_type;
```

Первичный ключ один, а две строки CHECK - это столбцы `id` и `title` с запретом NULL: в `information_schema` ограничения NOT NULL перечислены как проверки.

Если строку определяет сочетание значений, ключ делают составным и записывают на уровне таблицы. Так устроена таблица состава заказа в учебном магазине: один товар в заказе указан не более одного раза.

```sql run=empty
CREATE TABLE order_lines (
  order_id integer,
  product_id integer,
  quantity integer NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
INSERT INTO order_lines VALUES (1, 10, 2), (1, 11, 1), (2, 10, 5);
SELECT * FROM order_lines ORDER BY order_id, product_id;
```

Пары `(1, 10)` и `(2, 10)` различаются, а вторая `(1, 10)` вызвала бы ошибку. Порядок столбцов в ключе важен: по нему строится индекс, и он помогает искать по первому столбцу ключа.

## Имена ограничений

Каждое ограничение имеет имя. Если вы его не задали, PostgreSQL придумывает сам: например, `courses_pkey` для первичного ключа или `items_price_check` для проверки. Задать имя можно словом CONSTRAINT перед определением:

```sql run=empty
CREATE TABLE tariffs (
  id integer PRIMARY KEY,
  price numeric(8, 2),
  CONSTRAINT price_limit CHECK (price <= 700)
);
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'tariffs'::regclass AND contype = 'c';
```

Явное имя пригодится, когда ограничение придётся удалять командой ALTER TABLE, и когда в сообщении об ошибке вы хотите сразу увидеть, какое правило сработало.

## Как посмотреть ограничения таблицы

Список ограничений лежит в системном каталоге `pg_constraint`, тип которого указан в столбце `contype`: `p` - первичный ключ, `u` - UNIQUE, `c` - CHECK, `f` - внешний ключ. Функция `pg_get_constraintdef` возвращает определение ограничения без имени, и именно его удобно сравнивать, когда имя не важно:

```sql run=empty
CREATE TABLE products_archive (
  id integer PRIMARY KEY,
  title text NOT NULL,
  price numeric(10, 2) CHECK (price > 0)
);
SELECT contype::text AS kind, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'products_archive'::regclass
ORDER BY kind;
```

Строки с `n` - это ограничения NOT NULL: в `pg_constraint` они появились в PostgreSQL 18, в более ранних версиях их там нет. Надёжнее проверять NOT NULL и DEFAULT в `information_schema.columns`, в столбцах `is_nullable` и `column_default`.
