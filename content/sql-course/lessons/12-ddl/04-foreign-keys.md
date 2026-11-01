---
title: Внешние ключи и ON DELETE
slug: sql-ddl-foreign-keys
minutes: 25
description: Как связать таблицы внешним ключом, что происходит при удалении родительской строки и чем отличаются CASCADE, SET NULL и RESTRICT.
tasks: sql-ddl-fk-basic, sql-ddl-fk-cascade, sql-ddl-fk-set-null, sql-ddl-fk-restrict, sql-ddl-fk-self, sql-ddl-fk-composite
---
Внешний ключ говорит базе: значение в этом столбце обязано встречаться в столбце другой таблицы. Так связаны заказы и покупатели, книги и авторы. Без внешнего ключа в `orders.customer_id` можно записать номер покупателя, которого нет. С ним такая вставка не пройдёт.

## Как объявить внешний ключ

Ключ можно записать у столбца словом REFERENCES или отдельной строкой FOREIGN KEY на уровне таблицы. После REFERENCES указывают таблицу-родителя и в скобках её столбец. Столбец родителя должен быть первичным ключом или иметь ограничение UNIQUE.

```sql run=empty
CREATE TABLE authors (
  id integer PRIMARY KEY,
  full_name text NOT NULL
);
CREATE TABLE books (
  id integer PRIMARY KEY,
  title text NOT NULL,
  author_id integer NOT NULL REFERENCES authors (id)
);
INSERT INTO authors VALUES (1, 'Лев Толстой');
INSERT INTO books VALUES (1, 'Война и мир', 1);
SELECT b.title, a.full_name FROM books b JOIN authors a ON a.id = b.author_id;
```

Таблицу `authors` называют родительской, `books` - дочерней. Вставка книги с несуществующим автором завершится ошибкой:

```sql run=empty error
CREATE TABLE authors (id integer PRIMARY KEY, full_name text NOT NULL);
CREATE TABLE books (
  id integer PRIMARY KEY,
  author_id integer NOT NULL REFERENCES authors (id)
);
INSERT INTO books VALUES (1, 99);
```

Если столбец ключа допускает NULL, то в нём можно оставить пустое значение: книга без известного автора. Чтобы связь была обязательной, ставят NOT NULL.

## Что делать при удалении родителя

Что должно случиться со строками книг, когда автора удаляют? Это задаётся фразой ON DELETE после REFERENCES. Есть несколько вариантов.

NO ACTION (по умолчанию) и RESTRICT запрещают удалять родителя, пока на него есть ссылки. Разница в том, что NO ACTION проверяют в конце команды, а RESTRICT сразу; на практике поведение одинаковое. Это самый безопасный вариант:

```sql run=empty error
CREATE TABLE authors (id integer PRIMARY KEY, full_name text NOT NULL);
CREATE TABLE books (
  id integer PRIMARY KEY,
  author_id integer NOT NULL REFERENCES authors (id) ON DELETE RESTRICT
);
INSERT INTO authors VALUES (1, 'Антон Чехов');
INSERT INTO books VALUES (1, 1);
DELETE FROM authors WHERE id = 1;
```

CASCADE удаляет вместе с родителем все дочерние строки. Он подходит, когда дети не имеют смысла без родителя: позиции заказа без самого заказа, комментарии под удалённой статьёй.

```sql run=empty
CREATE TABLE orders (id integer PRIMARY KEY);
CREATE TABLE order_lines (
  id integer PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders (id) ON DELETE CASCADE
);
INSERT INTO orders VALUES (1), (2);
INSERT INTO order_lines VALUES (1, 1), (2, 1), (3, 2);
DELETE FROM orders WHERE id = 1;
SELECT * FROM order_lines ORDER BY id;
```

SET NULL оставляет дочерние строки, но стирает ссылку. Столбец при этом должен допускать NULL. Такое правило подходит там, где запись самостоятельно имеет ценность: книга остаётся в каталоге, даже если автора убрали.

```sql run=empty
CREATE TABLE authors (id integer PRIMARY KEY, full_name text NOT NULL);
CREATE TABLE books (
  id integer PRIMARY KEY,
  title text NOT NULL,
  author_id integer REFERENCES authors (id) ON DELETE SET NULL
);
INSERT INTO authors VALUES (1, 'Лев Толстой'), (2, 'Антон Чехов');
INSERT INTO books VALUES (1, 'Война и мир', 1), (2, 'Палата номер 6', 2);
DELETE FROM authors WHERE id = 2;
SELECT id, title, author_id FROM books ORDER BY id;
```

Есть ещё SET DEFAULT, который подставляет значение по умолчанию, и ON UPDATE с теми же вариантами для изменения ключа родителя. Менять первичные ключи приходится редко, поэтому ON UPDATE используют реже.

## Выбор правила

Если сомневаетесь, оставляйте поведение по умолчанию: система запретит удаление, и вы заметите, что родитель кому-то нужен. CASCADE выбирайте осознанно: одно удаление может убрать тысячи строк по цепочке таблиц. В MySQL с движком MyISAM внешние ключи не работали вовсе, а в InnoDB они доступны. В PostgreSQL они есть всегда.

## Ключ на ту же таблицу и составной ключ

Таблица может ссылаться на саму себя. Так хранят иерархии: у сотрудника есть руководитель, который сам лежит в этой же таблице.

```sql run=empty
CREATE TABLE staff (
  id integer PRIMARY KEY,
  full_name text NOT NULL,
  boss_id integer REFERENCES staff (id)
);
INSERT INTO staff VALUES (1, 'Ольга', NULL), (2, 'Игорь', 1), (3, 'Мария', 1);
SELECT e.full_name AS employee, b.full_name AS boss
FROM staff e LEFT JOIN staff b ON b.id = e.boss_id
ORDER BY e.id;
```

Все три строки вставлены одной командой: ключ проверяется после вставки всех строк команды, поэтому порядок строк внутри неё не важен.

Если в родителе первичный ключ составной, то и внешний ключ составной. Он перечисляет столбцы в том же порядке:

```sql run=empty
CREATE TABLE order_items (
  order_id integer,
  product_id integer,
  quantity integer NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
CREATE TABLE shipments (
  order_id integer,
  product_id integer,
  shipped_on date NOT NULL,
  PRIMARY KEY (order_id, product_id),
  FOREIGN KEY (order_id, product_id) REFERENCES order_items (order_id, product_id)
);
INSERT INTO order_items VALUES (1, 10, 2);
INSERT INTO shipments VALUES (1, 10, '2026-03-01');
SELECT * FROM shipments;
```

## Как посмотреть внешние ключи

Определение ключа вместе с правилом удаления возвращает та же функция, что и для других ограничений:

```sql run=empty
CREATE TABLE a (id integer PRIMARY KEY);
CREATE TABLE b (id integer PRIMARY KEY, a_id integer REFERENCES a (id) ON DELETE CASCADE);
SELECT pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'b'::regclass AND contype = 'f';
```

Внешний ключ не создаёт индекс на дочернем столбце. Если по `author_id` ищут часто или удаляют родителей, индекс по этому столбцу нужно создать отдельно: без него каждое удаление автора заставит базу просматривать всю таблицу книг. Об индексах - в одном из следующих уроков.
