---
title: Длина и регистр
slug: sql-strings-length-case
minutes: 15
description: Сколько символов и байт в строке, как перевести текст в верхний и нижний регистр и как сделать заглавной первую букву каждого слова.
tasks: sql-strings-name-length, sql-strings-long-titles, sql-strings-chars-bytes, sql-strings-email-not-lower, sql-strings-initcap-name, sql-strings-avg-title-length
---
Строка в SQL - это значение типа text (или varchar, char), то есть последовательность символов. Для работы с ней в PostgreSQL есть набор функций. Каждая принимает строку и возвращает результат, который можно показать в выборке, использовать в условии WHERE или сортировке. Раздел разбирает их по задачам: измерить, склеить, вырезать, найти, почистить, заменить.

## Длина строки

Число символов возвращает функция char_length. Синоним - character_length, а короткое имя length делает то же самое для обычных строк:

```sql run=company
SELECT full_name, char_length(full_name) AS symbols
FROM employees
ORDER BY symbols DESC, id
LIMIT 4;
```

Пробелы считаются символами. Пустая строка имеет длину 0, а у NULL длины нет: функция вернёт NULL.

```sql run=empty
SELECT char_length('') AS empty_string, char_length(NULL) AS null_value;
```

### Символы и байты

База хранит текст в кодировке UTF-8, где латинская буква занимает один байт, а русская два. Число байт возвращает octet_length:

```sql run=empty
SELECT
  'SQL' AS word,
  char_length('SQL') AS symbols,
  octet_length('SQL') AS bytes
UNION ALL
SELECT 'база', char_length('база'), octet_length('база');
```

В MySQL функция LENGTH возвращает именно байты, а CHAR_LENGTH - символы. В PostgreSQL length считает символы, так что при переносе запросов с MySQL на русском тексте длина получится вдвое меньше. Если нужны байты, ищите octet_length.

## Регистр

Три функции меняют регистр букв. lower переводит всё в нижний регистр, upper в верхний, а initcap делает заглавной первую букву каждого слова, остальные - строчными:

```sql run=library
SELECT
  title,
  upper(title) AS big,
  lower(title) AS small,
  initcap(lower(title)) AS proper
FROM books
WHERE id <= 3;
```

В MySQL аналоги называются LCASE и UCASE, в PostgreSQL они не работают. Для русских букв результат зависит от локали базы; в учебных базах курса lower, upper и initcap работают с кириллицей.

Слова для initcap - это последовательности букв и цифр, разделённые любыми другими символами. Поэтому дефис, апостроф и точка начинают новое слово:

```sql run=empty
SELECT initcap('санкт-петербург') AS city, initcap('o''brien') AS surname;
```

### Регистр в условиях

Сравнение строк в PostgreSQL чувствительно к регистру: 'москва' и 'Москва' разные значения. Чтобы сравнить без учёта регистра, приведите обе стороны к одному виду:

```sql run=shop
SELECT full_name, city
FROM customers
WHERE lower(city) = 'москва';
```

Для поиска по шаблону есть оператор ILIKE, нечувствительный к регистру. Он разобран в разделе об условиях, а с функциями регистра вы чаще всего встретитесь при очистке данных: сравнить введённый пользователем адрес, найти адреса с заглавными буквами, привести имена к единому виду.

```sql run=empty
SELECT
  'Anna.Belova@Mail.Example' AS stored,
  'Anna.Belova@Mail.Example' = 'anna.belova@mail.example' AS plain_equal,
  lower('Anna.Belova@Mail.Example') = 'anna.belova@mail.example' AS lower_equal;
```

Функция внутри WHERE мешает использовать обычный индекс по столбцу: база должна вычислить lower для каждой строки. Для больших таблиц делают индекс по выражению lower(email). На учебных данных это не заметно.

## Длина в условиях и агрегатах

Результат char_length - обычное число, поэтому его можно сравнивать, сортировать и усреднять:

```sql run=shop
SELECT round(avg(char_length(title)), 1) AS avg_length,
       max(char_length(title)) AS longest
FROM products;
```

Типичное применение - найти значения, не помещающиеся в поле формы или в ограничение интерфейса: char_length(title) > 20 покажет такие названия. Тот же приём пригодится для поиска пустых строк: char_length(x) = 0 или проще x = ''. Пустая строка и NULL - разные вещи, и функции длины это различают.

Когда столбец имеет тип char(n), хвостовые пробелы не входят в длину: char_length(CAST('ab ' AS char(5))) вернёт 2. Для text и varchar пробелы считаются. В рабочих таблицах тип char(n) встречается редко, поэтому обычно такой тонкости можно не бояться.
