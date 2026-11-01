---
title: Отчёты по библиотеке
slug: sql-practice-library-reports
minutes: 40
description: Поиск лучшего в группе с учётом ничьих, авторы без книг, условия для всех строк группы и реляционное деление.
tasks: sql-practice-library-top-author-pages, sql-practice-library-authors-without-books, sql-practice-library-above-genre-average, sql-practice-library-genre-report, sql-practice-library-centuries, sql-practice-library-youngest-authors, sql-practice-library-multi-genre-authors, sql-practice-library-country-report, sql-practice-library-titles-per-author, sql-practice-library-all-before-1950, sql-practice-courses-passed-all-backend
---
Библиотечные отчёты проверяют внимание к мелочам: у книги может не быть автора, у автора книг, у книги цены. Каждый такой пропуск меняет ответ, если не обработать его заранее. Этот урок разбирает «лучшего в группе», поиск строк без пары, условия «для всех» и деление.

## Лучший в группе и ничьи

Задача «автор с наибольшим числом страниц» решается группировкой, сортировкой по агрегату и LIMIT 1:

```sql run=library
SELECT a.full_name, SUM(b.pages) AS total_pages
FROM authors a
JOIN books b ON b.author_id = a.id
GROUP BY a.id, a.full_name
ORDER BY total_pages DESC, a.id
LIMIT 1;
```

Второй ключ `a.id` нужен на случай, когда у двух авторов одна и та же сумма: без него ответ зависел бы от того, в каком порядке PostgreSQL прочитал строки. Теперь та же затея с числом книг:

```sql run=library
SELECT a.full_name, COUNT(*) AS books_count
FROM authors a
JOIN books b ON b.author_id = a.id
GROUP BY a.id, a.full_name
ORDER BY books_count DESC, a.full_name;
```

У Толстого и Мураками по две книги. Если попросить «двух лучших» по числу книг через LIMIT 2, Мураками в ответ не попадёт только из-за порядка имён, хотя делит второе место с Толстым. Когда условие говорит «все, кто разделил место», LIMIT не годится: нужна оконная функция RANK (она разобрана в последнем уроке раздела) или сравнение с максимумом.

## Строки без пары

Авторы без книг, товары без продаж, студенты без записей: всё это одна схема. Левое соединение сохраняет все строки главной таблицы, а проверка IS NULL по столбцу правой таблицы оставляет те, для которых пары не нашлось:

```sql run=library
SELECT a.id, a.full_name
FROM authors a
LEFT JOIN books b ON b.author_id = a.id
WHERE b.id IS NULL
ORDER BY a.id;
```

Проверять нужно столбец, который в настоящей строке не бывает пустым, обычно первичный ключ.

В обратную сторону работает тот же приём. Книги без автора лежат в `books` с пустым `author_id`. Внутреннее соединение их теряет, а левое от `books` оставляет. Для вывода можно подставить текст вместо NULL:

```sql run=library
SELECT b.title,
       COALESCE(a.full_name, 'Автор неизвестен') AS author,
       COALESCE(b.price::text, 'нет цены') AS price_text
FROM books b
LEFT JOIN authors a ON a.id = b.author_id
ORDER BY b.id;
```

Приведение `price::text` обязательно: COALESCE требует одинаковых типов, а число и текст в одном выражении PostgreSQL не объединит.

## NULL в агрегатах

Агрегаты по-разному относятся к пустым значениям. COUNT(*) считает строки, COUNT(столбец) и AVG пропускают NULL. В отчёте по жанрам это даёт разные числа:

```sql run=library
SELECT genre,
       COUNT(*) AS books_count,
       COUNT(price) AS priced_books,
       ROUND(AVG(price), 2) AS avg_price
FROM books
GROUP BY genre
ORDER BY books_count DESC, genre;
```

У романов восемь книг, но цена известна у семи, и средняя считается по семи. Если по условию неизвестную цену нужно считать нулём, оберните её в COALESCE явно, иначе среднее окажется выше.

## Условие для всех строк группы

Автор, все книги которого вышли до 1950 года: про отдельные строки группы говорит слово «все». Проще всего свести его к экстремуму. Все книги раньше 1950 года тогда и только тогда, когда самая поздняя раньше:

```sql run=library
SELECT a.id, a.full_name
FROM authors a
JOIN books b ON b.author_id = a.id
GROUP BY a.id, a.full_name
HAVING MAX(b.published_year) < 1950
ORDER BY a.id;
```

Внутреннее соединение убирает авторов вообще без книг. Для них условие «все книги такие-то» выполняется пустым образом, но в отчёт такие авторы обычно не нужны.

## Реляционное деление

Вопрос «кто связан со всеми из набора» называют реляционным делением. Например, авторы, которые писали во всех жанрах, где работал Достоевский. Решается в три шага: определить набор, оставить в связях только его элементы и сравнить число найденных с размером набора:

```sql run=library
SELECT a.full_name
FROM authors a
JOIN books b ON b.author_id = a.id
WHERE b.genre IN (SELECT genre FROM books WHERE author_id = 2)
GROUP BY a.id, a.full_name
HAVING COUNT(DISTINCT b.genre) = (SELECT COUNT(DISTINCT genre) FROM books WHERE author_id = 2)
ORDER BY a.full_name;
```

Число жанров набора в запрос не вписано, оно считается подзапросом, поэтому запрос не сломается, когда набор изменится. Сравнивать нужно количество разных элементов, иначе две книги одного жанра создадут иллюзию полного охвата. В задачах раздела деление встретится на студентах и курсах.

## Век, возраст, склейка

Три небольших приёма из отчётов по книгам. Век издания считается целочисленным делением со сдвигом на единицу, чтобы границы попадали в верный век:

```sql run=library
SELECT (published_year - 1) / 100 + 1 AS century, COUNT(*) AS books_count
FROM books
GROUP BY 1
ORDER BY century;
```

Список книг автора в одну строку собирает string_agg, и порядок в нём задаётся прямо в скобках:

```sql run=library
SELECT a.full_name AS author,
       string_agg(b.title, '; ' ORDER BY b.published_year, b.id) AS titles
FROM authors a
JOIN books b ON b.author_id = a.id
GROUP BY a.id, a.full_name
HAVING COUNT(*) >= 2
ORDER BY a.full_name;
```

Возраст автора в год издания считается обычным вычитанием `published_year - birth_year`, но только после внутреннего соединения: у книги без автора возраста нет.

## Перед решением

В задачах следите за тремя вещами: что станет с книгами без автора и авторами без книг, как поведут себя NULL в ценах и что сделать при равенстве значений. Если задача просит «одного лучшего», условие называет второй ключ.
