---
title: Точки сохранения: SAVEPOINT
slug: sql-transactions-savepoints
minutes: 25
description: Как откатить часть транзакции, не отменяя её целиком: SAVEPOINT, ROLLBACK TO, RELEASE и восстановление после ошибки.
tasks: sql-transactions-savepoint-basic, sql-transactions-savepoint-nested, sql-transactions-savepoint-release, sql-transactions-savepoint-bonus
---
ROLLBACK отменяет транзакцию целиком. Иногда нужно меньше: оставить уже сделанное, отменить только последние шаги и продолжить. Для этого внутри транзакции ставят точки сохранения.

## SAVEPOINT и ROLLBACK TO

Команда SAVEPOINT имя запоминает текущее состояние транзакции. ROLLBACK TO имя возвращает состояние к этой точке: всё, что сделано после неё, отменяется, всё, что до неё, остаётся. Транзакция при этом продолжается и по-прежнему ждёт COMMIT.

```sql run=empty
CREATE TABLE accounts (
  id integer PRIMARY KEY,
  owner text NOT NULL,
  balance numeric(12, 2) NOT NULL CHECK (balance >= 0)
);
INSERT INTO accounts VALUES (1, 'Анна', 1000), (2, 'Борис', 1000), (3, 'Вера', 1000);

BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
SAVEPOINT step;
UPDATE accounts SET balance = balance - 700 WHERE id = 2;
ROLLBACK TO step;
UPDATE accounts SET balance = balance + 100 WHERE id = 3;
COMMIT;

SELECT * FROM accounts ORDER BY id;
```

Списание со счёта 1 осталось, потому что оно сделано до точки. Списание со счёта 2 отменено. Зачисление на счёт 3 выполнено уже после отката и тоже сохранилось.

## Несколько точек

Точек может быть много, они образуют стопку. Возврат к ранней точке отменяет всё, что сделано после неё, включая более поздние точки:

```sql run=empty
CREATE TABLE steps (n integer PRIMARY KEY, note text);

BEGIN;
INSERT INTO steps VALUES (1, 'начало');
SAVEPOINT s1;
INSERT INTO steps VALUES (2, 'после s1');
SAVEPOINT s2;
INSERT INTO steps VALUES (3, 'после s2');
ROLLBACK TO s1;
INSERT INTO steps VALUES (4, 'после отката');
COMMIT;

SELECT * FROM steps ORDER BY n;
```

Остались шаги 1 и 4. Шаги 2 и 3 отменены вместе: точка `s2` была создана после `s1` и тоже исчезла. Вернуться к ней уже нельзя, а к `s1` можно ещё раз.

## RELEASE: снять точку

RELEASE SAVEPOINT имя удаляет только имя точки, а не изменения. Это нужно редко, например чтобы освободить память в долгой транзакции с тысячами точек. После RELEASE откатиться к этой точке уже нельзя:

```sql run=empty
CREATE TABLE steps (n integer PRIMARY KEY, note text);

BEGIN;
SAVEPOINT a;
INSERT INTO steps VALUES (1, 'под точкой a');
RELEASE SAVEPOINT a;
SAVEPOINT b;
INSERT INTO steps VALUES (2, 'под точкой b');
ROLLBACK TO b;
COMMIT;

SELECT * FROM steps ORDER BY n;
```

Изменение под точкой `a` осталось, потому что RELEASE ничего не откатывает. Изменение под `b` отменено.

Если ROLLBACK TO сделан на несуществующую точку, будет ошибка, и транзакция станет прерванной:

```sql run=empty error
BEGIN;
ROLLBACK TO nothing;
```

## Восстановление после ошибки

Главная причина, по которой точки сохранения нужны на практике, связана с прерванным состоянием из прошлого урока. Если ошибка случилась после SAVEPOINT, то ROLLBACK TO возвращает транзакцию в рабочее состояние, и можно продолжать. Вот как это выглядит в сеансе psql (в тренажёре запрос с ошибкой остановил бы выполнение скрипта, поэтому показываем как есть):

```sql
BEGIN;
INSERT INTO accounts VALUES (10, 'Игорь', 0);
SAVEPOINT attempt;
INSERT INTO accounts VALUES (10, 'Дубль', 0);
-- ERROR: duplicate key value violates unique constraint "accounts_pkey"
ROLLBACK TO attempt;
-- транзакция снова рабочая, первая вставка на месте
INSERT INTO accounts VALUES (11, 'Ольга', 0);
COMMIT;
```

Так пишут код, который пробует необязательное действие: ставит точку, выполняет попытку, при ошибке откатывается к точке и идёт дальше. В функциях PL/pgSQL тот же приём записывают блоком BEGIN ... EXCEPTION: он ставит такие точки сам.

Каждая точка сохранения стоит ресурсов: внутри открывается подтранзакция. Ставить тысячи точек в цикле дорого. Применяйте их там, где отказ действительно возможен.

## MySQL

В MySQL работают те же команды SAVEPOINT, ROLLBACK TO SAVEPOINT и RELEASE SAVEPOINT. Слово SAVEPOINT в ROLLBACK TO можно писать и в PostgreSQL, но оно необязательно. Главное отличие в ошибках: в MySQL после ошибки в запросе транзакция остаётся рабочей и продолжается, а в PostgreSQL становится прерванной и требует отката до точки или полного ROLLBACK.
