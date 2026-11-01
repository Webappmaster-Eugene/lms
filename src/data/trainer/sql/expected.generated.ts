// Сгенерировано scripts/build-sql-expected.ts. Не редактировать вручную.
export const SQL_EXPECTED: Readonly<Record<string, readonly string[]>> = {
  "sql-dates-current-next-birthday": [
    " full_name         | next_birthday | days_left\n-------------------+---------------+-----------\n Анна Волкова      | 2026-04-17    | 2\n Наталья Кузнецова | 2026-05-19    | 34\n Ольга Смирнова    | 2026-06-12    | 58\n(3 строки)",
    " full_name        | next_birthday | days_left\n------------------+---------------+-----------\n Юлия Фёдорова    | 2026-05-15    | 30\n Ирина Голубева   | 2026-06-30    | 76\n Светлана Павлова | 2026-07-22    | 98\n(3 строки)",
  ],
  "sql-dates-current-prev-month-orders": [
    " id | ordered_at\n----+---------------------\n 8  | 2026-04-02 19:10:00\n(1 строка)",
    " id | ordered_at\n----+---------------------\n 6  | 2026-04-11 20:20:00\n 7  | 2026-04-30 07:30:00\n(2 строки)",
  ],
  "sql-dates-current-recent-customers": [
    " full_name     | registered_on\n---------------+---------------\n Дарья Ершова  | 2025-06-18\n Лев Комаров   | 2025-10-09\n Полина Гусева | 2026-03-27\n(3 строки)",
    " full_name      | registered_on\n----------------+---------------\n Ева Миронова   | 2025-08-08\n Яна Кудрявцева | 2026-01-31\n(2 строки)",
  ],
  "sql-dates-current-recent-products": [
    " title                  | added_on\n------------------------+------------\n Подставка для ноутбука | 2026-02-14\n Смартфон Max           | 2026-03-01\n(2 строки)",
    " title   | added_on\n---------+------------\n Геймпад | 2026-03-09\n(1 строка)",
  ],
  "sql-dates-current-running-events": [
    " title       | room\n-------------+-------------\n Демо релиза | Большой зал\n(1 строка)",
    " title        | room\n--------------+-------------\n Планирование | B2\n Конференция  | Большой зал\n Созвон       | A1\n(3 строки)",
  ],
  "sql-dates-current-waiting-orders": [
    " id | ordered_at          | days_waiting\n----+---------------------+--------------\n 5  | 2026-03-01 12:00:00 | 45\n 8  | 2026-04-02 19:10:00 | 13\n(2 строки)",
    " id | ordered_at          | days_waiting\n----+---------------------+--------------\n 6  | 2026-04-11 20:20:00 | 4\n(1 строка)",
  ],
  "sql-dates-extract-birthday-2026": [
    " full_name         | birthday_2026\n-------------------+---------------\n Сергей Лебедев    | 2026-01-09\n Игорь Петров      | 2026-02-03\n Виктор Зайцев     | 2026-02-28\n Татьяна Соколова  | 2026-03-14\n Анна Волкова      | 2026-04-17\n Наталья Кузнецова | 2026-05-19\n Ольга Смирнова    | 2026-06-12\n Павел Морозов     | 2026-07-07\n Денис Орлов       | 2026-08-30\n Алексей Попов     | 2026-10-02\n Мария Козлова     | 2026-11-21\n Елена Новикова    | 2026-12-25\n(12 строк)",
    " full_name         | birthday_2026\n-------------------+---------------\n Ксения Богданова  | 2026-01-20\n Артём Семёнов     | 2026-03-03\n Юлия Фёдорова     | 2026-05-15\n Ирина Голубева    | 2026-06-30\n Светлана Павлова  | 2026-07-22\n Глеб Воробьёв     | 2026-08-08\n Кирилл Белов      | 2026-09-01\n Вера Медведева    | 2026-09-27\n Максим Виноградов | 2026-11-11\n Роман Егоров      | 2026-12-04\n(10 строк)",
  ],
  "sql-dates-extract-hire-year": [
    " full_name         | hire_year\n-------------------+-----------\n Елена Новикова    | 2016\n Ольга Смирнова    | 2017\n Анна Волкова      | 2018\n Игорь Петров      | 2019\n Павел Морозов     | 2020\n Мария Козлова     | 2021\n Татьяна Соколова  | 2021\n Денис Орлов       | 2022\n Алексей Попов     | 2022\n Сергей Лебедев    | 2023\n Наталья Кузнецова | 2024\n Виктор Зайцев     | 2025\n(12 строк)",
    " full_name         | hire_year\n-------------------+-----------\n Кирилл Белов      | 2015\n Глеб Воробьёв     | 2018\n Светлана Павлова  | 2019\n Юлия Фёдорова     | 2020\n Роман Егоров      | 2021\n Ирина Голубева    | 2022\n Артём Семёнов     | 2023\n Максим Виноградов | 2024\n Вера Медведева    | 2025\n Ксения Богданова  | 2026\n(10 строк)",
  ],
  "sql-dates-extract-iso-week": [
    " id | order_date | iso_week\n----+------------+----------\n 1  | 2026-01-12 | 3\n 2  | 2026-01-20 | 4\n 3  | 2026-02-03 | 6\n 4  | 2026-02-14 | 7\n 5  | 2026-03-01 | 9\n 6  | 2026-03-08 | 10\n 7  | 2026-03-15 | 11\n 8  | 2026-04-02 | 14\n(8 строк)",
    " id | order_date | iso_week\n----+------------+----------\n 1  | 2025-12-30 | 1\n 2  | 2026-01-05 | 2\n 3  | 2026-02-17 | 8\n 4  | 2026-02-17 | 8\n 5  | 2026-03-22 | 12\n 6  | 2026-04-11 | 15\n 7  | 2026-04-30 | 18\n(7 строк)",
  ],
  "sql-dates-extract-may-hires": [
    " full_name     | hire_date\n---------------+------------\n Павел Морозов | 2020-05-18\n(1 строка)",
    " full_name      | hire_date\n----------------+------------\n Кирилл Белов   | 2015-05-12\n Вера Медведева | 2025-05-19\n(2 строки)",
  ],
  "sql-dates-extract-q1-products": [
    " title                  | added_on\n------------------------+------------\n Ноутбук Pro 16         | 2026-01-20\n Подставка для ноутбука | 2026-02-14\n Смартфон Max           | 2026-03-01\n(3 строки)",
    " title                   | added_on\n-------------------------+------------\n Клавиатура механическая | 2026-01-15\n Планшет Tab 11          | 2026-02-02\n Геймпад                 | 2026-03-09\n(3 строки)",
  ],
  "sql-dates-extract-weekend-orders": [
    " id | ordered_at          | weekday_number\n----+---------------------+----------------\n 4  | 2026-02-14 21:30:00 | 6\n 5  | 2026-03-01 12:00:00 | 7\n 6  | 2026-03-08 15:20:00 | 7\n 7  | 2026-03-15 08:45:00 | 7\n(4 строки)",
    " id | ordered_at          | weekday_number\n----+---------------------+----------------\n 5  | 2026-03-22 10:05:00 | 7\n 6  | 2026-04-11 20:20:00 | 6\n(2 строки)",
  ],
  "sql-dates-extract-work-hours": [
    " id | order_hour\n----+------------\n 1  | 10\n 3  | 9\n 5  | 12\n 6  | 15\n(4 строки)",
    " id | order_hour\n----+------------\n 2  | 11\n 3  | 14\n 4  | 16\n 5  | 10\n(4 строки)",
  ],
  "sql-dates-intervals-age-years": [
    " full_name         | age\n-------------------+-----\n Елена Новикова    | 42\n Ольга Смирнова    | 40\n Анна Волкова      | 37\n Игорь Петров      | 35\n Павел Морозов     | 31\n Мария Козлова     | 29\n Татьяна Соколова  | 29\n Алексей Попов     | 27\n Денис Орлов       | 26\n Сергей Лебедев    | 26\n Наталья Кузнецова | 24\n Виктор Зайцев     | 22\n(12 строк)",
    " full_name         | age\n-------------------+-----\n Глеб Воробьёв     | 46\n Кирилл Белов      | 43\n Светлана Павлова  | 38\n Юлия Фёдорова     | 32\n Роман Егоров      | 30\n Артём Семёнов     | 27\n Ирина Голубева    | 25\n Вера Медведева    | 24\n Максим Виноградов | 23\n Ксения Богданова  | 21\n(10 строк)",
  ],
  "sql-dates-intervals-days-worked": [
    " full_name         | days_worked\n-------------------+-------------\n Елена Новикова    | 3481\n Ольга Смирнова    | 3332\n Анна Волкова      | 3012\n Игорь Петров      | 2403\n Павел Морозов     | 2158\n Мария Козлова     | 1836\n Татьяна Соколова  | 1626\n Алексей Попов     | 1479\n Денис Орлов       | 1374\n Сергей Лебедев    | 1150\n Наталья Кузнецова | 681\n Виктор Зайцев     | 226\n(12 строк)",
    " full_name         | days_worked\n-------------------+-------------\n Кирилл Белов      | 3991\n Глеб Воробьёв     | 2683\n Светлана Павлова  | 2571\n Юлия Фёдорова     | 2263\n Роман Егоров      | 1696\n Ирина Голубева    | 1549\n Артём Семёнов     | 919\n Максим Виноградов | 772\n Вера Медведева    | 331\n Ксения Богданова  | 72\n(10 строк)",
  ],
  "sql-dates-intervals-event-minutes": [
    " title         | minutes\n---------------+---------\n Воркшоп       | 240\n Ночной деплой | 150\n(2 строки)",
    " title            | minutes\n------------------+---------\n Конференция      | 540\n Ночная поддержка | 210\n Планирование     | 120\n(3 строки)",
  ],
  "sql-dates-intervals-five-years": [
    " full_name      | hire_date\n----------------+------------\n Елена Новикова | 2016-10-03\n Ольга Смирнова | 2017-03-01\n Анна Волкова   | 2018-01-15\n Игорь Петров   | 2019-09-16\n Павел Морозов  | 2020-05-18\n Мария Козлова  | 2021-04-05\n(6 строк)",
    " full_name        | hire_date\n------------------+------------\n Кирилл Белов     | 2015-05-12\n Глеб Воробьёв    | 2018-12-10\n Светлана Павлова | 2019-04-01\n Юлия Фёдорова    | 2020-02-03\n(4 строки)",
  ],
  "sql-dates-intervals-last-30-days": [
    " id | ordered_at\n----+---------------------\n 7  | 2026-03-15 08:45:00\n 8  | 2026-04-02 19:10:00\n(2 строки)",
    " id | ordered_at\n----+---------------------\n 5  | 2026-03-22 10:05:00\n(1 строка)",
  ],
  "sql-dates-intervals-months-worked": [
    " full_name         | months_worked\n-------------------+---------------\n Елена Новикова    | 114\n Ольга Смирнова    | 109\n Анна Волкова      | 99\n Игорь Петров      | 78\n Павел Морозов     | 70\n Мария Козлова     | 60\n Татьяна Соколова  | 53\n Алексей Попов     | 48\n Денис Орлов       | 45\n Сергей Лебедев    | 37\n Наталья Кузнецова | 22\n Виктор Зайцев     | 7\n(12 строк)",
    " full_name         | months_worked\n-------------------+---------------\n Кирилл Белов      | 131\n Глеб Воробьёв     | 88\n Светлана Павлова  | 84\n Юлия Фёдорова     | 74\n Роман Егоров      | 55\n Ирина Голубева    | 50\n Артём Семёнов     | 30\n Максим Виноградов | 25\n Вера Медведева    | 10\n Ксения Богданова  | 2\n(10 строк)",
  ],
  "sql-dates-intervals-trial-end": [
    " full_name      | trial_end\n----------------+------------\n Андрей Кравцов | 2024-02-25\n Вера Тихонова  | 2024-08-13\n Олег Савин     | 2025-01-19\n Дарья Ершова   | 2025-07-02\n Лев Комаров    | 2025-10-23\n Полина Гусева  | 2026-04-10\n(6 строк)",
    " full_name      | trial_end\n----------------+------------\n Тимур Абрамов  | 2023-12-04\n Алина Зуева    | 2024-05-19\n Борис Лапин    | 2025-03-14\n Ева Миронова   | 2025-08-22\n Яна Кудрявцева | 2026-02-14\n(5 строк)",
  ],
  "sql-dates-to-char-format-ru": [
    " full_name         | hired\n-------------------+------------\n Ольга Смирнова    | 01.03.2017\n Игорь Петров      | 16.09.2019\n Мария Козлова     | 05.04.2021\n Денис Орлов       | 11.07.2022\n Анна Волкова      | 15.01.2018\n Сергей Лебедев    | 20.02.2023\n Елена Новикова    | 03.10.2016\n Павел Морозов     | 18.05.2020\n Татьяна Соколова  | 01.11.2021\n Алексей Попов     | 28.03.2022\n Наталья Кузнецова | 03.06.2024\n Виктор Зайцев     | 01.09.2025\n(12 строк)",
    " full_name         | hired\n-------------------+------------\n Кирилл Белов      | 12.05.2015\n Юлия Фёдорова     | 03.02.2020\n Роман Егоров      | 23.08.2021\n Светлана Павлова  | 01.04.2019\n Артём Семёнов     | 09.10.2023\n Ирина Голубева    | 17.01.2022\n Максим Виноградов | 04.03.2024\n Ксения Богданова  | 02.02.2026\n Глеб Воробьёв     | 10.12.2018\n Вера Медведева    | 19.05.2025\n(10 строк)",
  ],
  "sql-dates-to-char-month-key": [
    " id | month_key\n----+-----------\n 1  | 2026-01\n 2  | 2026-01\n 4  | 2026-02\n 5  | 2026-03\n 6  | 2026-03\n 7  | 2026-03\n 8  | 2026-04\n(7 строк)",
    " id | month_key\n----+-----------\n 1  | 2025-12\n 2  | 2026-01\n 3  | 2026-02\n 5  | 2026-03\n 6  | 2026-04\n 7  | 2026-04\n(6 строк)",
  ],
  "sql-dates-to-char-parse-date": [
    " id | parsed_on\n----+------------\n 2  | 2026-01-15\n 3  | 2026-02-28\n 4  | 2026-04-01\n(3 строки)",
    " id | parsed_on\n----+------------\n 2  | 2026-03-05\n(1 строка)",
  ],
  "sql-dates-to-char-parse-timestamp": [
    " id | parsed_at\n----+---------------------\n 1  | 2025-11-03 14:30:00\n 2  | 2026-01-15 09:05:00\n 3  | 2026-02-28 23:59:00\n 4  | 2026-04-01 00:00:00\n(4 строки)",
    " id | parsed_at\n----+---------------------\n 3  | 2024-10-10 12:00:00\n 1  | 2025-12-31 23:15:00\n 2  | 2026-03-05 08:40:00\n(3 строки)",
  ],
  "sql-dates-to-char-quarter-label": [
    " full_name      | quarter_label\n----------------+---------------\n Андрей Кравцов | 2024-Q1\n Вера Тихонова  | 2024-Q3\n Олег Савин     | 2025-Q1\n Дарья Ершова   | 2025-Q2\n Лев Комаров    | 2025-Q4\n Полина Гусева  | 2026-Q1\n(6 строк)",
    " full_name      | quarter_label\n----------------+---------------\n Тимур Абрамов  | 2023-Q4\n Алина Зуева    | 2024-Q2\n Борис Лапин    | 2025-Q1\n Ева Миронова   | 2025-Q3\n Яна Кудрявцева | 2026-Q1\n(5 строк)",
  ],
  "sql-dates-to-char-time-hhmm": [
    " id | order_time\n----+------------\n 1  | 10:15\n 2  | 18:40\n 4  | 21:30\n 6  | 15:20\n 7  | 08:45\n(5 строк)",
    " id | order_time\n----+------------\n 1  | 23:50\n 2  | 11:11\n 3  | 14:00\n 5  | 10:05\n 7  | 07:30\n(5 строк)",
  ],
  "sql-dates-to-char-weekday-ru": [
    " id | order_date | weekday_name\n----+------------+--------------\n 1  | 2026-01-12 | понедельник\n 2  | 2026-01-20 | вторник\n 3  | 2026-02-03 | вторник\n 4  | 2026-02-14 | суббота\n 5  | 2026-03-01 | воскресенье\n 6  | 2026-03-08 | воскресенье\n 7  | 2026-03-15 | воскресенье\n 8  | 2026-04-02 | четверг\n(8 строк)",
    " id | order_date | weekday_name\n----+------------+--------------\n 1  | 2025-12-30 | вторник\n 2  | 2026-01-05 | понедельник\n 3  | 2026-02-17 | вторник\n 4  | 2026-02-17 | вторник\n 5  | 2026-03-22 | воскресенье\n 6  | 2026-04-11 | суббота\n 7  | 2026-04-30 | четверг\n(7 строк)",
  ],
  "sql-dates-trunc-current-month": [
    " id | ordered_at\n----+---------------------\n 5  | 2026-03-01 12:00:00\n 6  | 2026-03-08 15:20:00\n 7  | 2026-03-15 08:45:00\n(3 строки)",
    " id | ordered_at\n----+---------------------\n 5  | 2026-03-22 10:05:00\n(1 строка)",
  ],
  "sql-dates-trunc-last-year": [
    " full_name     | hire_date\n---------------+------------\n Виктор Зайцев | 2025-09-01\n(1 строка)",
    " full_name      | hire_date\n----------------+------------\n Вера Медведева | 2025-05-19\n(1 строка)",
  ],
  "sql-dates-trunc-month-end": [
    " full_name         | month_end\n-------------------+------------\n Ольга Смирнова    | 2017-03-31\n Игорь Петров      | 2019-09-30\n Мария Козлова     | 2021-04-30\n Денис Орлов       | 2022-07-31\n Анна Волкова      | 2018-01-31\n Сергей Лебедев    | 2023-02-28\n Елена Новикова    | 2016-10-31\n Павел Морозов     | 2020-05-31\n Татьяна Соколова  | 2021-11-30\n Алексей Попов     | 2022-03-31\n Наталья Кузнецова | 2024-06-30\n Виктор Зайцев     | 2025-09-30\n(12 строк)",
    " full_name         | month_end\n-------------------+------------\n Кирилл Белов      | 2015-05-31\n Юлия Фёдорова     | 2020-02-29\n Роман Егоров      | 2021-08-31\n Светлана Павлова  | 2019-04-30\n Артём Семёнов     | 2023-10-31\n Ирина Голубева    | 2022-01-31\n Максим Виноградов | 2024-03-31\n Ксения Богданова  | 2026-02-28\n Глеб Воробьёв     | 2018-12-31\n Вера Медведева    | 2025-05-31\n(10 строк)",
  ],
  "sql-dates-trunc-month-start": [
    " id | month_start\n----+-------------\n 1  | 2026-01-01\n 2  | 2026-01-01\n 3  | 2026-02-01\n 4  | 2026-02-01\n 5  | 2026-03-01\n 6  | 2026-03-01\n 7  | 2026-03-01\n 8  | 2026-04-01\n(8 строк)",
    " id | month_start\n----+-------------\n 1  | 2025-12-01\n 2  | 2026-01-01\n 3  | 2026-02-01\n 4  | 2026-02-01\n 5  | 2026-03-01\n 6  | 2026-04-01\n 7  | 2026-04-01\n(7 строк)",
  ],
  "sql-dates-trunc-quarter-start": [
    " title                     | quarter_start\n---------------------------+---------------\n Ноутбук Air 13            | 2025-10-01\n Ноутбук Pro 16            | 2026-01-01\n Смартфон Lite             | 2025-07-01\n Смартфон Max              | 2026-01-01\n Чехол для смартфона       | 2025-04-01\n Беспроводные наушники     | 2025-07-01\n Зарядное устройство 65 Вт | 2025-10-01\n Мышь беспроводная         | 2024-10-01\n Подставка для ноутбука    | 2026-01-01\n Смартфон Mini             | 2026-04-01\n(10 строк)",
    " title                   | quarter_start\n-------------------------+---------------\n Ноутбук Office 14       | 2025-10-01\n Планшет Tab 11          | 2026-01-01\n Планшет Tab Mini        | 2025-07-01\n Кабель USB-C            | 2024-10-01\n Клавиатура механическая | 2026-01-01\n Игровая приставка       | 2025-10-01\n Геймпад                 | 2026-01-01\n Сумка для ноутбука      | 2025-07-01\n(8 строк)",
  ],
  "sql-dates-trunc-week-start": [
    " id | week_start\n----+------------\n 1  | 2026-01-12\n 4  | 2026-02-09\n 6  | 2026-03-02\n(3 строки)",
    " id | week_start\n----+------------\n 1  | 2025-12-29\n 2  | 2026-01-05\n 5  | 2026-03-16\n(3 строки)",
  ],
  "sql-dates-trunc-year-start": [
    " full_name      | year_start\n----------------+------------\n Андрей Кравцов | 2024-01-01\n Вера Тихонова  | 2024-01-01\n Олег Савин     | 2025-01-01\n Дарья Ершова   | 2025-01-01\n Лев Комаров    | 2025-01-01\n Полина Гусева  | 2026-01-01\n(6 строк)",
    " full_name      | year_start\n----------------+------------\n Тимур Абрамов  | 2023-01-01\n Алина Зуева    | 2024-01-01\n Борис Лапин    | 2025-01-01\n Ева Миронова   | 2025-01-01\n Яна Кудрявцева | 2026-01-01\n(5 строк)",
  ],
  "sql-dates-types-evening-events": [
    " title         | starts_at\n---------------+---------------------\n Лекция по SQL | 2026-04-15 18:30:00\n Ночной деплой | 2026-04-15 23:00:00\n(2 строки)",
    " title            | starts_at\n------------------+---------------------\n Ночная поддержка | 2026-04-14 22:30:00\n Вебинар          | 2026-04-15 19:00:00\n(2 строки)",
  ],
  "sql-dates-types-hired-since": [
    " full_name         | hire_date\n-------------------+------------\n Мария Козлова     | 2021-04-05\n Татьяна Соколова  | 2021-11-01\n Алексей Попов     | 2022-03-28\n Денис Орлов       | 2022-07-11\n Сергей Лебедев    | 2023-02-20\n Наталья Кузнецова | 2024-06-03\n Виктор Зайцев     | 2025-09-01\n(7 строк)",
    " full_name         | hire_date\n-------------------+------------\n Роман Егоров      | 2021-08-23\n Ирина Голубева    | 2022-01-17\n Артём Семёнов     | 2023-10-09\n Максим Виноградов | 2024-03-04\n Вера Медведева    | 2025-05-19\n Ксения Богданова  | 2026-02-02\n(6 строк)",
  ],
  "sql-dates-types-march-orders": [
    " id | ordered_at\n----+---------------------\n 5  | 2026-03-01 12:00:00\n 6  | 2026-03-08 15:20:00\n 7  | 2026-03-15 08:45:00\n(3 строки)",
    " id | ordered_at\n----+---------------------\n 5  | 2026-03-22 10:05:00\n(1 строка)",
  ],
  "sql-dates-types-moscow-time": [
    " title             | starts_msk\n-------------------+---------------------\n Планёрка          | 2026-04-15 12:00:00\n Демо релиза       | 2026-04-15 14:00:00\n Лекция по SQL     | 2026-04-15 21:30:00\n Ретроспектива     | 2026-04-16 18:00:00\n Ночной деплой     | 2026-04-16 02:00:00\n Собеседование     | 2026-04-17 13:00:00\n Воркшоп           | 2026-04-18 13:00:00\n Обед с партнёрами | 2026-04-15 16:00:00\n(8 строк)",
    " title            | starts_msk\n------------------+---------------------\n Стендап          | 2026-04-15 13:00:00\n Вебинар          | 2026-04-15 22:00:00\n Планирование     | 2026-04-15 14:00:00\n Ночная поддержка | 2026-04-15 01:30:00\n Конференция      | 2026-04-15 12:00:00\n Созвон           | 2026-04-15 14:30:00\n Короткий созвон  | 2026-04-15 14:00:00\n(7 строк)",
  ],
  "sql-dates-types-order-parts": [
    " id | order_date | order_time\n----+------------+------------\n 1  | 2026-01-12 | 10:15:00\n 4  | 2026-02-14 | 21:30:00\n 6  | 2026-03-08 | 15:20:00\n(3 строки)",
    " id | order_date | order_time\n----+------------+------------\n 1  | 2025-12-30 | 23:50:00\n 2  | 2026-01-05 | 11:11:00\n 5  | 2026-03-22 | 10:05:00\n(3 строки)",
  ],
  "sql-dates-types-registered-2025": [
    " full_name    | registered_on\n--------------+---------------\n Олег Савин   | 2025-01-05\n Дарья Ершова | 2025-06-18\n Лев Комаров  | 2025-10-09\n(3 строки)",
    " full_name    | registered_on\n--------------+---------------\n Борис Лапин  | 2025-02-28\n Ева Миронова | 2025-08-08\n(2 строки)",
  ],
  "sql-ddl-alter-add-column": [
    " id | discount_percent | data_type | is_nullable | column_default\n----+------------------+-----------+-------------+----------------\n 1  | 0                | integer   | NO          | 0\n 2  | 0                | integer   | NO          | 0\n 3  | 0                | integer   | NO          | 0\n 4  | 15               | integer   | NO          | 0\n 5  | 0                | integer   | NO          | 0\n 6  | 0                | integer   | NO          | 0\n 7  | 0                | integer   | NO          | 0\n 8  | 15               | integer   | NO          | 0\n 9  | 0                | integer   | NO          | 0\n 10 | 0                | integer   | NO          | 0\n(10 строк)",
    " id | discount_percent | data_type | is_nullable | column_default\n----+------------------+-----------+-------------+----------------\n 1  | 0                | integer   | NO          | 0\n 2  | 15               | integer   | NO          | 0\n 3  | 0                | integer   | NO          | 0\n 4  | 0                | integer   | NO          | 0\n 5  | 0                | integer   | NO          | 0\n 6  | 0                | integer   | NO          | 0\n 7  | 15               | integer   | NO          | 0\n 8  | 0                | integer   | NO          | 0\n(8 строк)",
  ],
  "sql-ddl-alter-add-constraints": [
    " kind | definition                      | rows_count\n------+---------------------------------+------------\n c    | CHECK ((salary > (0)::numeric)) | 12\n u    | UNIQUE (email)                  | 12\n(2 строки)",
    " kind | definition                      | rows_count\n------+---------------------------------+------------\n c    | CHECK ((salary > (0)::numeric)) | 10\n u    | UNIQUE (email)                  | 10\n(2 строки)",
  ],
  "sql-ddl-alter-default-not-null": [
    " id | city            | is_nullable | column_default\n----+-----------------+-------------+-----------------------\n 1  | Москва          | NO          | '''не указан''::text'\n 2  | Санкт-Петербург | NO          | '''не указан''::text'\n 3  | Москва          | NO          | '''не указан''::text'\n 4  | Казань          | NO          | '''не указан''::text'\n 5  | не указан       | NO          | '''не указан''::text'\n(5 строк)",
    " id | city         | is_nullable | column_default\n----+--------------+-------------+-----------------------\n 1  | Новосибирск  | NO          | '''не указан''::text'\n 2  | Москва       | NO          | '''не указан''::text'\n 3  | Екатеринбург | NO          | '''не указан''::text'\n 4  | не указан    | NO          | '''не указан''::text'\n 6  | Москва       | NO          | '''не указан''::text'\n 7  | Казань       | NO          | '''не указан''::text'\n(6 строк)",
  ],
  "sql-ddl-alter-drop-column": [
    " column_name   | data_type | is_nullable | column_default | rows_count\n---------------+-----------+-------------+----------------+------------\n id            | integer   | NO          | NULL           | 6\n full_name     | text      | NO          | NULL           | 6\n city          | text      | YES         | NULL           | 6\n registered_on | date      | NO          | NULL           | 6\n(4 строки)",
    " column_name   | data_type | is_nullable | column_default | rows_count\n---------------+-----------+-------------+----------------+------------\n id            | integer   | NO          | NULL           | 5\n full_name     | text      | NO          | NULL           | 5\n city          | text      | YES         | NULL           | 5\n registered_on | date      | NO          | NULL           | 5\n(4 строки)",
  ],
  "sql-ddl-alter-rename-column": [
    " id | full_name              | born_year\n----+------------------------+-----------\n 1  | Лев Толстой            | 1828\n 2  | Фёдор Достоевский      | 1821\n 3  | Джейн Остин            | 1775\n 4  | Габриэль Гарсиа Маркес | 1927\n 5  | Харуки Мураками        | 1949\n 6  | Анна Ахматова          | 1889\n(6 строк)",
    " id | full_name       | born_year\n----+-----------------+-----------\n 1  | Антон Чехов     | 1860\n 2  | Михаил Булгаков | 1891\n 3  | Джордж Оруэлл   | 1903\n 4  | Агата Кристи    | 1890\n 7  | Рэй Брэдбери    | 1920\n(5 строк)",
  ],
  "sql-ddl-alter-swap-pk": [
    " kind | definition                         | rows_count\n------+------------------------------------+------------\n p    | PRIMARY KEY (product_id, order_id) | 13\n(1 строка)",
    " kind | definition                         | rows_count\n------+------------------------------------+------------\n p    | PRIMARY KEY (product_id, order_id) | 11\n(1 строка)",
  ],
  "sql-ddl-alter-type": [
    " id | price | price_type\n----+-------+------------\n 1  | 150   | integer\n 2  | 299   | integer\n 3  | 1     | integer\n 4  | 2490  | integer\n(4 строки)",
    " id | price | price_type\n----+-------+------------\n 1  | 11    | integer\n 2  | 600   | integer\n 3  | 74    | integer\n 4  | 4     | integer\n 5  | 0     | integer\n(5 строк)",
  ],
  "sql-ddl-check-two": [
    " kind | definition                     | rows_count\n------+--------------------------------+------------\n c    | CHECK ((price > (0)::numeric)) | 10\n c    | CHECK ((stock >= 0))           | 10\n n    | NOT NULL id                    | 10\n n    | NOT NULL title                 | 10\n p    | PRIMARY KEY (id)               | 10\n(5 строк)",
    " kind | definition                     | rows_count\n------+--------------------------------+------------\n c    | CHECK ((price > (0)::numeric)) | 8\n c    | CHECK ((stock >= 0))           | 8\n n    | NOT NULL id                    | 8\n n    | NOT NULL title                 | 8\n p    | PRIMARY KEY (id)               | 8\n(5 строк)",
  ],
  "sql-ddl-composite-pk": [
    " kind | definition                         | rows_count\n------+------------------------------------+------------\n n    | NOT NULL order_id                  | 13\n n    | NOT NULL product_id                | 13\n n    | NOT NULL quantity                  | 13\n p    | PRIMARY KEY (order_id, product_id) | 13\n(4 строки)",
    " kind | definition                         | rows_count\n------+------------------------------------+------------\n n    | NOT NULL order_id                  | 11\n n    | NOT NULL product_id                | 11\n n    | NOT NULL quantity                  | 11\n p    | PRIMARY KEY (order_id, product_id) | 11\n(4 строки)",
  ],
  "sql-ddl-create-as-select": [
    " id | title          | price\n----+----------------+--------\n 1  | Ноутбук Air 13 | 89990\n 2  | Ноутбук Pro 16 | 189990\n 4  | Смартфон Max   | 74990\n(3 строки)",
    " id | title             | price\n----+-------------------+-------\n 1  | Ноутбук Office 14 | 54990\n(1 строка)",
  ],
  "sql-ddl-create-like": [
    " column_name | data_type | is_nullable | column_default | pk_count | rows_count\n-------------+-----------+-------------+----------------+----------+------------\n id          | integer   | NO          | NULL           | 1        | 3\n name        | text      | NO          | NULL           | 1        | 3\n city        | text      | YES         | NULL           | 1        | 3\n budget      | numeric   | YES         | NULL           | 1        | 3\n(4 строки)",
    " column_name | data_type | is_nullable | column_default | pk_count | rows_count\n-------------+-----------+-------------+----------------+----------+------------\n id          | integer   | NO          | NULL           | 1        | 2\n name        | text      | NO          | NULL           | 1        | 2\n city        | text      | YES         | NULL           | 1        | 2\n budget      | numeric   | YES         | NULL           | 1        | 2\n(4 строки)",
  ],
  "sql-ddl-create-reading-list": [
    " column_name | data_type | is_nullable | column_default | rows_count\n-------------+-----------+-------------+----------------+------------\n book_id     | integer   | YES         | NULL           | 5\n title       | text      | YES         | NULL           | 5\n pages       | integer   | YES         | NULL           | 5\n(3 строки)",
    " column_name | data_type | is_nullable | column_default | rows_count\n-------------+-----------+-------------+----------------+------------\n book_id     | integer   | YES         | NULL           | 0\n title       | text      | YES         | NULL           | 0\n pages       | integer   | YES         | NULL           | 0\n(3 строки)",
  ],
  "sql-ddl-create-timestamps": [
    " column_name | data_type                | is_nullable | column_default | shipped_count | rows_count\n-------------+--------------------------+-------------+----------------+---------------+------------\n id          | integer                  | YES         | NULL           | 3             | 8\n happened_at | timestamp with time zone | YES         | NULL           | 3             | 8\n details     | jsonb                    | YES         | NULL           | 3             | 8\n(3 строки)",
    " column_name | data_type                | is_nullable | column_default | shipped_count | rows_count\n-------------+--------------------------+-------------+----------------+---------------+------------\n id          | integer                  | YES         | NULL           | 3             | 7\n happened_at | timestamp with time zone | YES         | NULL           | 3             | 7\n details     | jsonb                    | YES         | NULL           | 3             | 7\n(3 строки)",
  ],
  "sql-ddl-create-types": [
    " column_name | data_type         | is_nullable | column_default | character_maximum_length | numeric_precision | numeric_scale | in_stock_count | rows_count\n-------------+-------------------+-------------+----------------+--------------------------+-------------------+---------------+----------------+------------\n sku         | character varying | YES         | NULL           | 20                       | NULL              | NULL          | 8              | 10\n title       | text              | YES         | NULL           | NULL                     | NULL              | NULL          | 8              | 10\n price       | numeric           | YES         | NULL           | NULL                     | 10                | 2             | 8              | 10\n in_stock    | boolean           | YES         | NULL           | NULL                     | NULL              | NULL          | 8              | 10\n added_on    | date              | YES         | NULL           | NULL                     | NULL              | NULL          | 8              | 10\n(5 строк)",
    " column_name | data_type         | is_nullable | column_default | character_maximum_length | numeric_precision | numeric_scale | in_stock_count | rows_count\n-------------+-------------------+-------------+----------------+--------------------------+-------------------+---------------+----------------+------------\n sku         | character varying | YES         | NULL           | 20                       | NULL              | NULL          | 6              | 8\n title       | text              | YES         | NULL           | NULL                     | NULL              | NULL          | 6              | 8\n price       | numeric           | YES         | NULL           | NULL                     | 10                | 2             | 6              | 8\n in_stock    | boolean           | YES         | NULL           | NULL                     | NULL              | NULL          | 6              | 8\n added_on    | date              | YES         | NULL           | NULL                     | NULL              | NULL          | 6              | 8\n(5 строк)",
  ],
  "sql-ddl-drop-cascade": [
    " authors_tables | books_count | foreign_keys\n----------------+-------------+--------------\n 0              | 10          | 0\n(1 строка)",
    " authors_tables | books_count | foreign_keys\n----------------+-------------+--------------\n 0              | 9           | 0\n(1 строка)",
  ],
  "sql-ddl-drop-if-exists": [
    " copied | leftovers\n--------+-----------\n 10     | 0\n(1 строка)",
    " copied | leftovers\n--------+-----------\n 9      | 0\n(1 строка)",
  ],
  "sql-ddl-fk-basic": [
    " kind | definition                                 | rows_count\n------+--------------------------------------------+------------\n f    | FOREIGN KEY (book_id) REFERENCES books(id) | 8\n n    | NOT NULL book_id                           | 8\n n    | NOT NULL id                                | 8\n p    | PRIMARY KEY (id)                           | 8\n(4 строки)",
    " kind | definition                                 | rows_count\n------+--------------------------------------------+------------\n f    | FOREIGN KEY (book_id) REFERENCES books(id) | 2\n n    | NOT NULL book_id                           | 2\n n    | NOT NULL id                                | 2\n p    | PRIMARY KEY (id)                           | 2\n(4 строки)",
  ],
  "sql-ddl-fk-cascade": [
    " kind | definition                                                      | rows_count\n------+-----------------------------------------------------------------+------------\n f    | FOREIGN KEY (shelf_id) REFERENCES shelves(id) ON DELETE CASCADE | 7\n(1 строка)",
    " kind | definition                                                      | rows_count\n------+-----------------------------------------------------------------+------------\n f    | FOREIGN KEY (shelf_id) REFERENCES shelves(id) ON DELETE CASCADE | 6\n(1 строка)",
  ],
  "sql-ddl-fk-composite": [
    " kind | definition                                                                      | rows_count\n------+---------------------------------------------------------------------------------+------------\n f    | FOREIGN KEY (order_id, product_id) REFERENCES order_items(order_id, product_id) | 9\n n    | NOT NULL order_id                                                               | 9\n n    | NOT NULL product_id                                                             | 9\n n    | NOT NULL shipped_on                                                             | 9\n p    | PRIMARY KEY (order_id, product_id)                                              | 9\n(5 строк)",
    " kind | definition                                                                      | rows_count\n------+---------------------------------------------------------------------------------+------------\n f    | FOREIGN KEY (order_id, product_id) REFERENCES order_items(order_id, product_id) | 7\n n    | NOT NULL order_id                                                               | 7\n n    | NOT NULL product_id                                                             | 7\n n    | NOT NULL shipped_on                                                             | 7\n p    | PRIMARY KEY (order_id, product_id)                                              | 7\n(5 строк)",
  ],
  "sql-ddl-fk-restrict": [
    " foreign_key                                                   | loans_count | books_left\n---------------------------------------------------------------+-------------+------------\n FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE RESTRICT | 7           | 7\n(1 строка)",
    " foreign_key                                                   | loans_count | books_left\n---------------------------------------------------------------+-------------+------------\n FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE RESTRICT | 1           | 1\n(1 строка)",
  ],
  "sql-ddl-fk-self": [
    " kind | definition                                 | rows_count\n------+--------------------------------------------+------------\n f    | FOREIGN KEY (boss_id) REFERENCES staff(id) | 12\n n    | NOT NULL full_name                         | 12\n n    | NOT NULL id                                | 12\n p    | PRIMARY KEY (id)                           | 12\n(4 строки)",
    " kind | definition                                 | rows_count\n------+--------------------------------------------+------------\n f    | FOREIGN KEY (boss_id) REFERENCES staff(id) | 10\n n    | NOT NULL full_name                         | 10\n n    | NOT NULL id                                | 10\n p    | PRIMARY KEY (id)                           | 10\n(4 строки)",
  ],
  "sql-ddl-fk-set-null": [
    " id | writer_id | foreign_key\n----+-----------+-------------------------------------------------------------------\n 1  | 1         | FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE SET NULL\n 2  | 1         | FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE SET NULL\n 3  | NULL      | FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE SET NULL\n 4  | NULL      | FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE SET NULL\n 5  | 3         | FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE SET NULL\n 6  | 4         | FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE SET NULL\n 7  | 5         | FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE SET NULL\n 8  | 5         | FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE SET NULL\n 9  | NULL      | FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE SET NULL\n 10 | NULL      | FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE SET NULL\n(10 строк)",
    " id | writer_id | foreign_key\n----+-----------+-------------------------------------------------------------------\n 1  | 1         | FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE SET NULL\n 2  | 1         | FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE SET NULL\n 3  | NULL      | FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE SET NULL\n 4  | NULL      | FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE SET NULL\n 5  | 3         | FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE SET NULL\n 6  | 3         | FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE SET NULL\n 7  | 4         | FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE SET NULL\n 8  | 4         | FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE SET NULL\n 9  | NULL      | FOREIGN KEY (writer_id) REFERENCES writers(id) ON DELETE SET NULL\n(9 строк)",
  ],
  "sql-ddl-identity-add": [
    " id  | title      | identity_generation | identity_start | identity_increment\n-----+------------+---------------------+----------------+--------------------\n 1   | Ноутбуки   | BY DEFAULT          | 100            | 1\n 2   | Смартфоны  | BY DEFAULT          | 100            | 1\n 3   | Аксессуары | BY DEFAULT          | 100            | 1\n 4   | Книги      | BY DEFAULT          | 100            | 1\n 100 | Новинки    | BY DEFAULT          | 100            | 1\n(5 строк)",
    " id  | title       | identity_generation | identity_start | identity_increment\n-----+-------------+---------------------+----------------+--------------------\n 1   | Ноутбуки    | BY DEFAULT          | 100            | 1\n 2   | Планшеты    | BY DEFAULT          | 100            | 1\n 3   | Аксессуары  | BY DEFAULT          | 100            | 1\n 5   | Игры        | BY DEFAULT          | 100            | 1\n 6   | Фототехника | BY DEFAULT          | 100            | 1\n 100 | Новинки     | BY DEFAULT          | 100            | 1\n(6 строк)",
  ],
  "sql-ddl-identity-always": [
    " id | title                    | identity_generation\n----+--------------------------+---------------------\n 1  | Война и мир              | ALWAYS\n 2  | Анна Каренина            | ALWAYS\n 3  | Преступление и наказание | ALWAYS\n 4  | Идиот                    | ALWAYS\n 5  | Гордость и предубеждение | ALWAYS\n 6  | Сто лет одиночества      | ALWAYS\n 7  | Норвежский лес           | ALWAYS\n 8  | Хроники заводной птицы   | ALWAYS\n 9  | Слово о полку Игореве    | ALWAYS\n 10 | Бедные люди              | ALWAYS\n(10 строк)",
    " id | title                            | identity_generation\n----+----------------------------------+---------------------\n 1  | Палата номер 6                   | ALWAYS\n 2  | Вишнёвый сад                     | ALWAYS\n 3  | Мастер и Маргарита               | ALWAYS\n 4  | Собачье сердце                   | ALWAYS\n 5  | 1984                             | ALWAYS\n 6  | Скотный двор                     | ALWAYS\n 7  | Убийство в «Восточном экспрессе» | ALWAYS\n 8  | И никого не стало                | ALWAYS\n 9  | Повесть временных лет            | ALWAYS\n(9 строк)",
  ],
  "sql-ddl-identity-by-default": [
    " id | body                   | identity_generation\n----+------------------------+---------------------\n 1  | Лев Толстой            | BY DEFAULT\n 2  | Фёдор Достоевский      | BY DEFAULT\n 3  | Джейн Остин            | BY DEFAULT\n 4  | Габриэль Гарсиа Маркес | BY DEFAULT\n 5  | Харуки Мураками        | BY DEFAULT\n 6  | Анна Ахматова          | BY DEFAULT\n 7  | Новая заметка          | BY DEFAULT\n(7 строк)",
    " id | body            | identity_generation\n----+-----------------+---------------------\n 1  | Антон Чехов     | BY DEFAULT\n 2  | Михаил Булгаков | BY DEFAULT\n 3  | Джордж Оруэлл   | BY DEFAULT\n 4  | Агата Кристи    | BY DEFAULT\n 7  | Рэй Брэдбери    | BY DEFAULT\n 8  | Новая заметка   | BY DEFAULT\n(6 строк)",
  ],
  "sql-ddl-identity-start": [
    " id   | customer       | identity_generation | identity_start | identity_increment\n------+----------------+---------------------+----------------+--------------------\n 1000 | Андрей Кравцов | ALWAYS              | 1000           | 10\n 1010 | Олег Савин     | ALWAYS              | 1000           | 10\n(2 строки)",
    " id   | customer    | identity_generation | identity_start | identity_increment\n------+-------------+---------------------+----------------+--------------------\n 1000 | Алина Зуева | ALWAYS              | 1000           | 10\n(1 строка)",
  ],
  "sql-ddl-index-composite": [
    " definition                                                           | rows_count\n----------------------------------------------------------------------+------------\n CREATE INDEX ON public.books USING btree (author_id, published_year) | 10\n CREATE UNIQUE INDEX ON public.books USING btree (id)                 | 10\n(2 строки)",
    " definition                                                           | rows_count\n----------------------------------------------------------------------+------------\n CREATE INDEX ON public.books USING btree (author_id, published_year) | 9\n CREATE UNIQUE INDEX ON public.books USING btree (id)                 | 9\n(2 строки)",
  ],
  "sql-ddl-index-drop": [
    " definition                                           | rows_count\n------------------------------------------------------+------------\n CREATE INDEX ON public.books USING btree (genre)     | 10\n CREATE UNIQUE INDEX ON public.books USING btree (id) | 10\n(2 строки)",
    " definition                                           | rows_count\n------------------------------------------------------+------------\n CREATE INDEX ON public.books USING btree (genre)     | 9\n CREATE UNIQUE INDEX ON public.books USING btree (id) | 9\n(2 строки)",
  ],
  "sql-ddl-index-expression": [
    " definition                                                  | rows_count\n-------------------------------------------------------------+------------\n CREATE INDEX ON public.customers USING btree (lower(email)) | 6\n CREATE UNIQUE INDEX ON public.customers USING btree (id)    | 6\n(2 строки)",
    " definition                                                  | rows_count\n-------------------------------------------------------------+------------\n CREATE INDEX ON public.customers USING btree (lower(email)) | 5\n CREATE UNIQUE INDEX ON public.customers USING btree (id)    | 5\n(2 строки)",
  ],
  "sql-ddl-index-named-desc": [
    " indexname              | indexdef                                                                                     | rows_count\n------------------------+----------------------------------------------------------------------------------------------+------------\n idx_products_cat_price | CREATE INDEX idx_products_cat_price ON public.products USING btree (category_id, price DESC) | 10\n(1 строка)",
    " indexname              | indexdef                                                                                     | rows_count\n------------------------+----------------------------------------------------------------------------------------------+------------\n idx_products_cat_price | CREATE INDEX idx_products_cat_price ON public.products USING btree (category_id, price DESC) | 8\n(1 строка)",
  ],
  "sql-ddl-index-partial": [
    " definition                                                                           | rows_count\n--------------------------------------------------------------------------------------+------------\n CREATE INDEX ON public.orders USING btree (customer_id) WHERE (status = 'new'::text) | 8\n CREATE UNIQUE INDEX ON public.orders USING btree (id)                                | 8\n(2 строки)",
    " definition                                                                           | rows_count\n--------------------------------------------------------------------------------------+------------\n CREATE INDEX ON public.orders USING btree (customer_id) WHERE (status = 'new'::text) | 7\n CREATE UNIQUE INDEX ON public.orders USING btree (id)                                | 7\n(2 строки)",
  ],
  "sql-ddl-index-simple": [
    " definition                                                   | rows_count\n--------------------------------------------------------------+------------\n CREATE INDEX ON public.employees USING btree (department_id) | 12\n CREATE UNIQUE INDEX ON public.employees USING btree (id)     | 12\n(2 строки)",
    " definition                                                   | rows_count\n--------------------------------------------------------------+------------\n CREATE INDEX ON public.employees USING btree (department_id) | 10\n CREATE UNIQUE INDEX ON public.employees USING btree (id)     | 10\n(2 строки)",
  ],
  "sql-ddl-index-unique": [
    " definition                                                  | rows_count\n-------------------------------------------------------------+------------\n CREATE UNIQUE INDEX ON public.customers USING btree (email) | 6\n CREATE UNIQUE INDEX ON public.customers USING btree (id)    | 6\n(2 строки)",
    " definition                                                  | rows_count\n-------------------------------------------------------------+------------\n CREATE UNIQUE INDEX ON public.customers USING btree (email) | 5\n CREATE UNIQUE INDEX ON public.customers USING btree (id)    | 5\n(2 строки)",
  ],
  "sql-ddl-named-check": [
    " conname     | kind | definition                        | rows_count\n-------------+------+-----------------------------------+------------\n price_limit | c    | CHECK ((price <= (700)::numeric)) | 4\n(1 строка)",
    " conname     | kind | definition                        | rows_count\n-------------+------+-----------------------------------+------------\n price_limit | c    | CHECK ((price <= (700)::numeric)) | 7\n(1 строка)",
  ],
  "sql-ddl-not-null-default": [
    " column_name | data_type | is_nullable | column_default        | rows_count\n-------------+-----------+-------------+-----------------------+------------\n id          | integer   | YES         | NULL                  | 5\n email       | text      | NO          | NULL                  | 5\n city        | text      | YES         | '''не указан''::text' | 5\n joined_on   | date      | NO          | NULL                  | 5\n(4 строки)",
    " column_name | data_type | is_nullable | column_default        | rows_count\n-------------+-----------+-------------+-----------------------+------------\n id          | integer   | YES         | NULL                  | 4\n email       | text      | NO          | NULL                  | 4\n city        | text      | YES         | '''не указан''::text' | 4\n joined_on   | date      | NO          | NULL                  | 4\n(4 строки)",
  ],
  "sql-ddl-rename-table": [
    " id | title\n----+--------------------------\n 1  | Война и мир\n 2  | Анна Каренина\n 3  | Преступление и наказание\n 4  | Идиот\n 5  | Гордость и предубеждение\n 6  | Сто лет одиночества\n 7  | Норвежский лес\n 8  | Хроники заводной птицы\n 9  | Слово о полку Игореве\n 10 | Бедные люди\n(10 строк)",
    " id | title\n----+----------------------------------\n 1  | Палата номер 6\n 2  | Вишнёвый сад\n 3  | Мастер и Маргарита\n 4  | Собачье сердце\n 5  | 1984\n 6  | Скотный двор\n 7  | Убийство в «Восточном экспрессе»\n 8  | И никого не стало\n 9  | Повесть временных лет\n(9 строк)",
  ],
  "sql-ddl-schema-archive": [
    " id | title                    | published_year\n----+--------------------------+----------------\n 1  | Война и мир              | 1869\n 2  | Анна Каренина            | 1878\n 3  | Преступление и наказание | 1866\n 4  | Идиот                    | 1869\n 5  | Гордость и предубеждение | 1813\n 9  | Слово о полку Игореве    | 1800\n 10 | Бедные люди              | 1846\n(7 строк)",
    " id | title                 | published_year\n----+-----------------------+----------------\n 1  | Палата номер 6        | 1892\n 9  | Повесть временных лет | 1767\n(2 строки)",
  ],
  "sql-ddl-schema-drop": [
    " id | name       | scratch_schemas\n----+------------+-----------------\n 1  | Разработка | 0\n 2  | Маркетинг  | 0\n 3  | Продажи    | 0\n 4  | Поддержка  | 0\n 5  | Аналитика  | 0\n(5 строк)",
    " id | name         | scratch_schemas\n----+--------------+-----------------\n 1  | Разработка   | 0\n 2  | Финансы      | 0\n 3  | Продажи      | 0\n 4  | Логистика    | 0\n 6  | Юридический  | 0\n 7  | Безопасность | 0\n(6 строк)",
  ],
  "sql-ddl-search-path": [
    " table_schema | table_name      | rows_count\n--------------+-----------------+------------\n reports      | russian_authors | 3\n(1 строка)",
    " table_schema | table_name      | rows_count\n--------------+-----------------+------------\n reports      | russian_authors | 2\n(1 строка)",
  ],
  "sql-ddl-serial": [
    " column_name | data_type | is_nullable | column_default                     | rows_count\n-------------+-----------+-------------+------------------------------------+------------\n id          | integer   | NO          | nextval('visits_id_seq'::regclass) | 10\n page        | text      | NO          | NULL                               | 10\n(2 строки)",
    " column_name | data_type | is_nullable | column_default                     | rows_count\n-------------+-----------+-------------+------------------------------------+------------\n id          | integer   | NO          | nextval('visits_id_seq'::regclass) | 8\n page        | text      | NO          | NULL                               | 8\n(2 строки)",
  ],
  "sql-ddl-truncate-restart": [
    " id | customer       | identity_generation\n----+----------------+---------------------\n 1  | Андрей Кравцов | ALWAYS\n 2  | Олег Савин     | ALWAYS\n(2 строки)",
    " id | customer    | identity_generation\n----+-------------+---------------------\n 1  | Алина Зуева | ALWAYS\n(1 строка)",
  ],
  "sql-ddl-two-schemas": [
    " schema_name | orders_count\n-------------+--------------\n y2025       | 0\n y2026       | 8\n(2 строки)",
    " schema_name | orders_count\n-------------+--------------\n y2025       | 1\n y2026       | 6\n(2 строки)",
  ],
  "sql-ddl-unique": [
    " kind | definition                | rows_count\n------+---------------------------+------------\n n    | NOT NULL email            | 9\n n    | NOT NULL employee_id      | 9\n p    | PRIMARY KEY (employee_id) | 9\n u    | UNIQUE (email)            | 9\n(4 строки)",
    " kind | definition                | rows_count\n------+---------------------------+------------\n n    | NOT NULL email            | 7\n n    | NOT NULL employee_id      | 7\n p    | PRIMARY KEY (employee_id) | 7\n u    | UNIQUE (email)            | 7\n(4 строки)",
  ],
  "sql-dml-copy-inactive": [
    " id | full_name      | salary | archived_on\n----+----------------+--------+-------------\n 2  | Павел Сидоров  | 55000  | 2026-05-01\n 4  | Роман Жуков    | 75000  | 2026-05-01\n 7  | Мила Громова   | 48000  | 2026-05-01\n 90 | Артур Бельский | 40000  | 2025-12-31\n(4 строки)",
    " id | full_name      | salary | archived_on\n----+----------------+--------+-------------\n 2  | Борис Гайдар   | 70000  | 2026-05-01\n 3  | Вера Лисова    | 45000  | 2026-05-01\n 4  | Глеб Яров      | 45000  | 2026-05-01\n 90 | Артур Бельский | 40000  | 2025-12-31\n 91 | Зоя Фролова    | 42000  | 2026-01-31\n(5 строк)",
  ],
  "sql-dml-copy-order": [
    " order_id | product_id | quantity | price\n----------+------------+----------+-------\n 7        | 10         | 1        | 39990\n 20       | 10         | 1        | 39990\n(2 строки)",
    " order_id | product_id | quantity | price\n----------+------------+----------+-------\n 7        | 1          | 1        | 52990\n 7        | 7          | 1        | 5990\n 20       | 1          | 1        | 52990\n 20       | 7          | 1        | 5990\n(4 строки)",
  ],
  "sql-dml-delete-condition": [
    " id | title\n----+--------------------------\n 1  | Война и мир\n 2  | Анна Каренина\n 3  | Преступление и наказание\n 4  | Идиот\n 6  | Сто лет одиночества\n 7  | Норвежский лес\n 8  | Хроники заводной птицы\n(7 строк)",
    " id | title\n----+----------------------------------\n 1  | Палата номер 6\n 2  | Вишнёвый сад\n 3  | Мастер и Маргарита\n 4  | Собачье сердце\n 5  | 1984\n 6  | Скотный двор\n 7  | Убийство в «Восточном экспрессе»\n 8  | И никого не стало\n(8 строк)",
  ],
  "sql-dml-delete-move": [
    " source  | id | full_name\n---------+----+----------------\n archive | 2  | Павел Сидоров\n archive | 4  | Роман Жуков\n archive | 7  | Мила Громова\n archive | 90 | Артур Бельский\n staff   | 1  | Ирина Белова\n staff   | 3  | Юлия Ким\n staff   | 5  | Лена Орлова\n staff   | 6  | Тимофей Разин\n staff   | 8  | Олег Дроздов\n(9 строк)",
    " source  | id | full_name\n---------+----+----------------\n archive | 2  | Борис Гайдар\n archive | 3  | Вера Лисова\n archive | 4  | Глеб Яров\n archive | 90 | Артур Бельский\n archive | 91 | Зоя Фролова\n staff   | 1  | Анна Мухина\n staff   | 5  | Дина Розова\n staff   | 6  | Егор Пикин\n(8 строк)",
  ],
  "sql-dml-delete-returning": [
    " id | full_name\n----+---------------\n 2  | Павел Сидоров\n 7  | Мила Громова\n(2 строки)",
    " id | full_name\n----+-------------\n 3  | Вера Лисова\n 4  | Глеб Яров\n(2 строки)",
  ],
  "sql-dml-delete-subquery": [
    " order_id | product_id\n----------+------------\n 1        | 1\n 1        | 5\n 2        | 3\n 2        | 6\n 4        | 4\n 4        | 7\n 5        | 6\n 6        | 5\n 6        | 8\n 7        | 10\n 8        | 1\n 8        | 7\n(12 строк)",
    " order_id | product_id\n----------+------------\n 1        | 1\n 1        | 4\n 2        | 6\n 2        | 7\n 3        | 3\n 5        | 4\n 5        | 5\n 6        | 8\n 7        | 1\n 7        | 7\n(10 строк)",
  ],
  "sql-dml-delete-using": [
    " order_id | product_id\n----------+------------\n 2        | 3\n 2        | 6\n 5        | 6\n 6        | 5\n 6        | 8\n 7        | 10\n(6 строк)",
    " order_id | product_id\n----------+------------\n 2        | 6\n 2        | 7\n 3        | 3\n 5        | 4\n 5        | 5\n 6        | 8\n 7        | 1\n 7        | 7\n(8 строк)",
  ],
  "sql-dml-generate-todo": [
    " id | title                | status | priority\n----+----------------------+--------+----------\n 1  | Заказать бумагу      | open   | 3\n 2  | Позвонить поставщику | done   | 1\n 3  | Обновить прайс       | open   | 2\n 4  | Задача 1             | open   | 3\n 5  | Задача 2             | open   | 3\n 6  | Задача 3             | open   | 3\n 7  | Задача 4             | open   | 3\n 8  | Задача 5             | open   | 3\n(8 строк)",
    " id | title               | status | priority\n----+---------------------+--------+----------\n 1  | Сверить склад       | open   | 3\n 2  | Отправить акт       | done   | 3\n 3  | Закрыть квартал     | open   | 1\n 4  | Убрать архив        | done   | 2\n 7  | Подготовить договор | open   | 2\n 8  | Задача 1            | open   | 3\n 9  | Задача 2            | open   | 3\n 10 | Задача 3            | open   | 3\n 11 | Задача 4            | open   | 3\n 12 | Задача 5            | open   | 3\n(10 строк)",
  ],
  "sql-dml-insert-columns": [
    " id | full_name              | country        | birth_year\n----+------------------------+----------------+------------\n 1  | Лев Толстой            | Россия         | 1828\n 2  | Фёдор Достоевский      | Россия         | 1821\n 3  | Джейн Остин            | Великобритания | 1775\n 4  | Габриэль Гарсиа Маркес | Колумбия       | 1927\n 5  | Харуки Мураками        | Япония         | 1949\n 6  | Анна Ахматова          | Россия         | 1889\n 8  | Евгений Замятин        | NULL           | NULL\n(7 строк)",
    " id | full_name       | country        | birth_year\n----+-----------------+----------------+------------\n 1  | Антон Чехов     | Россия         | 1860\n 2  | Михаил Булгаков | Россия         | 1891\n 3  | Джордж Оруэлл   | Великобритания | 1903\n 4  | Агата Кристи    | Великобритания | 1890\n 7  | Рэй Брэдбери    | США            | 1920\n 8  | Евгений Замятин | NULL           | NULL\n(6 строк)",
  ],
  "sql-dml-insert-default": [
    " id | title                | status | priority\n----+----------------------+--------+----------\n 1  | Заказать бумагу      | open   | 3\n 2  | Позвонить поставщику | done   | 1\n 3  | Обновить прайс       | open   | 2\n 4  | Проверить отчёт      | open   | 3\n(4 строки)",
    " id | title               | status | priority\n----+---------------------+--------+----------\n 1  | Сверить склад       | open   | 3\n 2  | Отправить акт       | done   | 3\n 3  | Закрыть квартал     | open   | 1\n 4  | Убрать архив        | done   | 2\n 7  | Подготовить договор | open   | 2\n 8  | Проверить отчёт     | open   | 3\n(6 строк)",
  ],
  "sql-dml-insert-default-keyword": [
    " id | title                | status | priority\n----+----------------------+--------+----------\n 1  | Заказать бумагу      | open   | 3\n 2  | Позвонить поставщику | done   | 1\n 3  | Обновить прайс       | open   | 2\n 4  | Согласовать смету    | done   | 3\n(4 строки)",
    " id | title               | status | priority\n----+---------------------+--------+----------\n 1  | Сверить склад       | open   | 3\n 2  | Отправить акт       | done   | 3\n 3  | Закрыть квартал     | open   | 1\n 4  | Убрать архив        | done   | 2\n 7  | Подготовить договор | open   | 2\n 8  | Согласовать смету   | done   | 3\n(6 строк)",
  ],
  "sql-dml-insert-department": [
    " id | name       | city            | budget\n----+------------+-----------------+---------\n 1  | Разработка | Москва          | 1200000\n 2  | Маркетинг  | Санкт-Петербург | 450000\n 3  | Продажи    | Москва          | 800000\n 4  | Поддержка  | Казань          | 300000\n 5  | Аналитика  | NULL            | 500000\n 8  | Закупки    | Тверь           | 250000\n(6 строк)",
    " id | name         | city         | budget\n----+--------------+--------------+--------\n 1  | Разработка   | Новосибирск  | 900000\n 2  | Финансы      | Москва       | 650000\n 3  | Продажи      | Екатеринбург | 400000\n 4  | Логистика    | NULL         | 250000\n 6  | Юридический  | Москва       | NULL\n 7  | Безопасность | Казань       | 150000\n 8  | Закупки      | Тверь        | 250000\n(7 строк)",
  ],
  "sql-dml-insert-many": [
    " id | title\n----+------------\n 1  | Ноутбуки\n 2  | Смартфоны\n 3  | Аксессуары\n 4  | Книги\n 10 | Игры\n 11 | Канцелярия\n 12 | Дом\n(7 строк)",
    " id | title\n----+-------------\n 1  | Ноутбуки\n 2  | Планшеты\n 3  | Аксессуары\n 5  | Игры\n 6  | Фототехника\n 10 | Игры\n 11 | Канцелярия\n 12 | Дом\n(8 строк)",
  ],
  "sql-dml-insert-order-fk": [
    " id | full_name      | status\n----+----------------+-----------\n 1  | Андрей Кравцов | shipped\n 2  | Вера Тихонова  | paid\n 3  | Андрей Кравцов | cancelled\n 4  | Олег Савин     | shipped\n 5  | Дарья Ершова   | new\n 6  | Вера Тихонова  | shipped\n 7  | Лев Комаров    | paid\n 8  | Андрей Кравцов | new\n 20 | Марина Орлова  | new\n(9 строк)",
    " id | full_name     | status\n----+---------------+-----------\n 1  | Алина Зуева   | shipped\n 2  | Тимур Абрамов | shipped\n 3  | Борис Лапин   | paid\n 4  | Алина Зуева   | cancelled\n 5  | Ева Миронова  | shipped\n 6  | Тимур Абрамов | new\n 7  | Борис Лапин   | paid\n 20 | Марина Орлова | new\n(8 строк)",
  ],
  "sql-dml-insert-returning": [
    " id | title\n----+-------------\n 4  | Купить кофе\n(1 строка)",
    " id | title\n----+-------------\n 8  | Купить кофе\n(1 строка)",
  ],
  "sql-dml-insert-subquery-value": [
    " id | full_name         | department_id | salary\n----+-------------------+---------------+--------\n 1  | Ольга Смирнова    | 1             | 320000\n 2  | Игорь Петров      | 1             | 210000\n 3  | Мария Козлова     | 1             | 185000\n 4  | Денис Орлов       | 1             | 120000\n 5  | Анна Волкова      | 2             | 240000\n 6  | Сергей Лебедев    | 2             | 95000\n 7  | Елена Новикова    | 3             | 260000\n 8  | Павел Морозов     | 3             | 110000\n 9  | Татьяна Соколова  | 3             | 115000\n 10 | Алексей Попов     | 4             | 70000\n 11 | Наталья Кузнецова | 4             | 72000\n 12 | Виктор Зайцев     | NULL          | 45000\n 20 | Кирилл Рогов      | 4             | 45000\n(13 строк)",
    " id | full_name         | department_id | salary\n----+-------------------+---------------+--------\n 1  | Кирилл Белов      | 1             | 300000\n 2  | Юлия Фёдорова     | 1             | 230000\n 3  | Роман Егоров      | 1             | 230000\n 4  | Светлана Павлова  | 2             | 130000\n 5  | Артём Семёнов     | 2             | 150000\n 6  | Ирина Голубева    | 3             | 90000\n 7  | Максим Виноградов | 3             | 98000\n 8  | Ксения Богданова  | NULL          | 40000\n 9  | Глеб Воробьёв     | 4             | 65000\n 10 | Вера Медведева    | 1             | 98000\n 20 | Кирилл Рогов      | 4             | 40000\n(11 строк)",
  ],
  "sql-dml-markdown-copies": [
    " id  | title                              | price\n-----+------------------------------------+-------\n 105 | Чехол для смартфона (уценка)       | 891\n 106 | Беспроводные наушники (уценка)     | 6741\n 107 | Зарядное устройство 65 Вт (уценка) | 2241\n 108 | Мышь беспроводная (уценка)         | 1431\n(4 строки)",
    " id  | title                            | price\n-----+----------------------------------+-------\n 104 | Кабель USB-C (уценка)            | 531\n 105 | Клавиатура механическая (уценка) | 8091\n(2 строки)",
  ],
  "sql-dml-stats-fill": [
    " department | headcount | total_salary\n------------+-----------+--------------\n Архив      | 1         | 40000\n Офис       | 2         | 170000\n Склад      | 2         | 112000\n(3 строки)",
    " department | headcount | total_salary\n------------+-----------+--------------\n Архив      | 2         | 82000\n Доставка   | 2         | 104000\n(2 строки)",
  ],
  "sql-dml-truncate-rebuild": [
    " department | headcount | total_salary\n------------+-----------+--------------\n Доставка   | 1         | 50000\n Офис       | 2         | 170000\n Склад      | 2         | 112000\n(3 строки)",
    " department | headcount | total_salary\n------------+-----------+--------------\n Доставка   | 2         | 104000\n Офис       | 1         | 70000\n(2 строки)",
  ],
  "sql-dml-update-case": [
    " id | full_name         | salary\n----+-------------------+--------\n 1  | Ольга Смирнова    | 336000\n 2  | Игорь Петров      | 220500\n 3  | Мария Козлова     | 194250\n 4  | Денис Орлов       | 126000\n 5  | Анна Волкова      | 252000\n 6  | Сергей Лебедев    | 114000\n 7  | Елена Новикова    | 273000\n 8  | Павел Морозов     | 115500\n 9  | Татьяна Соколова  | 120750\n 10 | Алексей Попов     | 84000\n 11 | Наталья Кузнецова | 86400\n 12 | Виктор Зайцев     | 54000\n(12 строк)",
    " id | full_name         | salary\n----+-------------------+--------\n 1  | Кирилл Белов      | 315000\n 2  | Юлия Фёдорова     | 241500\n 3  | Роман Егоров      | 241500\n 4  | Светлана Павлова  | 136500\n 5  | Артём Семёнов     | 157500\n 6  | Ирина Голубева    | 108000\n 7  | Максим Виноградов | 117600\n 8  | Ксения Богданова  | 48000\n 9  | Глеб Воробьёв     | 78000\n 10 | Вера Медведева    | 117600\n(10 строк)",
  ],
  "sql-dml-update-columns": [
    " id | title                    | genre    | price\n----+--------------------------+----------+-------\n 1  | Война и мир              | классика | 1190\n 2  | Анна Каренина            | классика | 890\n 3  | Преступление и наказание | классика | 590\n 4  | Идиот                    | классика | 650\n 5  | Гордость и предубеждение | классика | 490\n 6  | Сто лет одиночества      | роман    | 890\n 7  | Норвежский лес           | роман    | 720\n 8  | Хроники заводной птицы   | роман    | NULL\n 9  | Слово о полку Игореве    | классика | 250\n 10 | Бедные люди              | классика | 290\n(10 строк)",
    " id | title                            | genre    | price\n----+----------------------------------+----------+-------\n 1  | Палата номер 6                   | классика | 220\n 2  | Вишнёвый сад                     | пьеса    | 280\n 3  | Мастер и Маргарита               | роман    | 790\n 4  | Собачье сердце                   | повесть  | 420\n 5  | 1984                             | роман    | 650\n 6  | Скотный двор                     | повесть  | NULL\n 7  | Убийство в «Восточном экспрессе» | детектив | 540\n 8  | И никого не стало                | детектив | 540\n 9  | Повесть временных лет            | классика | 310\n(9 строк)",
  ],
  "sql-dml-update-expression": [
    " id | full_name         | department_id | salary\n----+-------------------+---------------+--------\n 1  | Ольга Смирнова    | 1             | 320000\n 2  | Игорь Петров      | 1             | 210000\n 3  | Мария Козлова     | 1             | 185000\n 4  | Денис Орлов       | 1             | 120000\n 5  | Анна Волкова      | 2             | 240000\n 6  | Сергей Лебедев    | 2             | 95000\n 7  | Елена Новикова    | 3             | 260000\n 8  | Павел Морозов     | 3             | 110000\n 9  | Татьяна Соколова  | 3             | 115000\n 10 | Алексей Попов     | 4             | 77000\n 11 | Наталья Кузнецова | 4             | 79200\n 12 | Виктор Зайцев     | NULL          | 45000\n(12 строк)",
    " id | full_name         | department_id | salary\n----+-------------------+---------------+--------\n 1  | Кирилл Белов      | 1             | 300000\n 2  | Юлия Фёдорова     | 1             | 230000\n 3  | Роман Егоров      | 1             | 230000\n 4  | Светлана Павлова  | 2             | 130000\n 5  | Артём Семёнов     | 2             | 150000\n 6  | Ирина Голубева    | 3             | 90000\n 7  | Максим Виноградов | 3             | 98000\n 8  | Ксения Богданова  | NULL          | 40000\n 9  | Глеб Воробьёв     | 4             | 71500\n 10 | Вера Медведева    | 1             | 98000\n(10 строк)",
  ],
  "sql-dml-update-from": [
    " order_id | product_id | price\n----------+------------+--------\n 1        | 1          | 89990\n 1        | 5          | 990\n 2        | 3          | 19990\n 2        | 6          | 7490\n 3        | 2          | 189990\n 4        | 4          | 74990\n 4        | 7          | 2490\n 5        | 6          | 6741\n 6        | 5          | 990\n 6        | 8          | 1590\n 7        | 10         | 39990\n 8        | 1          | 80991\n 8        | 7          | 2241\n(13 строк)",
    " order_id | product_id | price\n----------+------------+-------\n 1        | 1          | 54990\n 1        | 4          | 590\n 2        | 6          | 49990\n 2        | 7          | 5990\n 3        | 3          | 24990\n 4        | 2          | 32990\n 5        | 4          | 590\n 5        | 5          | 8990\n 6        | 8          | 2691\n 7        | 1          | 52990\n 7        | 7          | 5990\n(11 строк)",
  ],
  "sql-dml-update-null": [
    " id | full_name      | city\n----+----------------+-------------\n 1  | Андрей Кравцов | Москва\n 2  | Вера Тихонова  | Казань\n 3  | Олег Савин     | Москва\n 4  | Дарья Ершова   | Новосибирск\n 5  | Лев Комаров    | не указан\n 6  | Полина Гусева  | Казань\n(6 строк)",
    " id | full_name      | city\n----+----------------+-----------\n 1  | Тимур Абрамов  | Самара\n 2  | Алина Зуева    | Москва\n 3  | Борис Лапин    | Самара\n 4  | Ева Миронова   | не указан\n 5  | Яна Кудрявцева | Пермь\n(5 строк)",
  ],
  "sql-dml-update-one": [
    " id | full_name         | salary\n----+-------------------+--------\n 1  | Ольга Смирнова    | 320000\n 2  | Игорь Петров      | 210000\n 3  | Мария Козлова     | 185000\n 4  | Денис Орлов       | 130000\n 5  | Анна Волкова      | 240000\n 6  | Сергей Лебедев    | 95000\n 7  | Елена Новикова    | 260000\n 8  | Павел Морозов     | 110000\n 9  | Татьяна Соколова  | 115000\n 10 | Алексей Попов     | 70000\n 11 | Наталья Кузнецова | 72000\n 12 | Виктор Зайцев     | 45000\n(12 строк)",
    " id | full_name         | salary\n----+-------------------+--------\n 1  | Кирилл Белов      | 300000\n 2  | Юлия Фёдорова     | 230000\n 3  | Роман Егоров      | 230000\n 4  | Светлана Павлова  | 130000\n 5  | Артём Семёнов     | 150000\n 6  | Ирина Голубева    | 90000\n 7  | Максим Виноградов | 98000\n 8  | Ксения Богданова  | 40000\n 9  | Глеб Воробьёв     | 65000\n 10 | Вера Медведева    | 98000\n(10 строк)",
  ],
  "sql-dml-update-returning": [
    " id | title             | stock\n----+-------------------+-------\n 4  | Смартфон Max      | 10\n 8  | Мышь беспроводная | 10\n(2 строки)",
    " id | title          | stock\n----+----------------+-------\n 2  | Планшет Tab 11 | 10\n 7  | Геймпад        | 10\n(2 строки)",
  ],
  "sql-dml-update-subquery": [
    " id | name       | budget\n----+------------+----------\n 1  | Разработка | 10020000\n 2  | Маркетинг  | 4020000\n 3  | Продажи    | 5820000\n 4  | Поддержка  | 1704000\n 5  | Аналитика  | 500000\n(5 строк)",
    " id | name         | budget\n----+--------------+----------\n 1  | Разработка   | 10296000\n 2  | Финансы      | 3360000\n 3  | Продажи      | 2256000\n 4  | Логистика    | 780000\n 6  | Юридический  | NULL\n 7  | Безопасность | 150000\n(6 строк)",
  ],
  "sql-dml-upsert-add": [
    " sku   | title           | qty\n-------+-----------------+-----\n A-100 | Кабель HDMI     | 10\n A-200 | Кабель USB      | 4\n B-100 | Адаптер питания | 20\n E-500 | Лампа           | 15\n(4 строки)",
    " sku   | title           | qty\n-------+-----------------+-----\n A-200 | Кабель USB      | 8\n B-100 | Адаптер питания | 23\n C-300 | Переходник      | 6\n D-400 | Удлинитель      | 1\n E-500 | Лампа           | 15\n(5 строк)",
  ],
  "sql-dml-upsert-composite": [
    " order_id | product_id | quantity | price\n----------+------------+----------+-------\n 1        | 1          | 1        | 89990\n 1        | 5          | 3        | 990\n(2 строки)",
    " order_id | product_id | quantity | price\n----------+------------+----------+-------\n 1        | 1          | 1        | 54990\n 1        | 4          | 3        | 590\n 1        | 5          | 1        | 990\n(3 строки)",
  ],
  "sql-dml-upsert-replace": [
    " sku   | title           | qty\n-------+-----------------+-----\n A-100 | Кабель HDMI     | 10\n A-200 | Кабель USB-C    | 12\n B-100 | Адаптер питания | 0\n D-400 | Удлинитель 3 м  | 2\n(4 строки)",
    " sku   | title           | qty\n-------+-----------------+-----\n A-200 | Кабель USB-C    | 12\n B-100 | Адаптер питания | 3\n C-300 | Переходник      | 6\n D-400 | Удлинитель 3 м  | 2\n(4 строки)",
  ],
  "sql-dml-upsert-skip": [
    " sku   | title           | qty\n-------+-----------------+-----\n A-100 | Кабель HDMI     | 10\n A-200 | Кабель USB      | 4\n B-100 | Адаптер питания | 0\n C-300 | Переходник      | 7\n(4 строки)",
    " sku   | title           | qty\n-------+-----------------+-----\n A-100 | Кабель HDMI     | 5\n A-200 | Кабель USB      | 8\n B-100 | Адаптер питания | 3\n C-300 | Переходник      | 6\n D-400 | Удлинитель      | 1\n(5 строк)",
  ],
  "sql-dml-upsert-where": [
    " id | title                     | price\n----+---------------------------+--------\n 1  | Ноутбук Air 13            | 79990\n 2  | Ноутбук Pro 16            | 189990\n 3  | Смартфон Lite             | 19990\n 4  | Смартфон Max              | 74990\n 5  | Чехол для смартфона       | 990\n 6  | Беспроводные наушники     | 7490\n 7  | Зарядное устройство 65 Вт | 2490\n 8  | Мышь беспроводная         | 1590\n 9  | Подставка для ноутбука    | 3290\n 10 | Смартфон Mini             | 39990\n 11 | Мини-колонка              | 3490\n(11 строк)",
    " id | title                   | price\n----+-------------------------+-------\n 1  | Ноутбук Office 14       | 54990\n 2  | Планшет Tab 11          | 32990\n 3  | Планшет Tab Mini        | 21990\n 4  | Кабель USB-C            | 590\n 5  | Клавиатура механическая | 8990\n 6  | Игровая приставка       | 49990\n 7  | Геймпад                 | 5990\n 8  | Сумка для ноутбука      | 2990\n 11 | Мини-колонка            | 3490\n(9 строк)",
  ],
  "sql-expressions-bonus": [
    " full_name         | bonus\n-------------------+-------\n Ольга Смирнова    | 23520\n Игорь Петров      | 15435\n Мария Козлова     | 13598\n Денис Орлов       | 8820\n Анна Волкова      | 17640\n Сергей Лебедев    | 6983\n Елена Новикова    | 19110\n Павел Морозов     | 8085\n Татьяна Соколова  | 8453\n Алексей Попов     | 5145\n Наталья Кузнецова | 5292\n Виктор Зайцев     | 3308\n(12 строк)",
    " full_name         | bonus\n-------------------+-------\n Кирилл Белов      | 22050\n Юлия Фёдорова     | 16905\n Роман Егоров      | 16905\n Светлана Павлова  | 9555\n Артём Семёнов     | 11025\n Ирина Голубева    | 6615\n Максим Виноградов | 7203\n Ксения Богданова  | 2940\n Глеб Воробьёв     | 4778\n Вера Медведева    | 7203\n(10 строк)",
  ],
  "sql-expressions-bonus-points": [
    " title                     | points\n---------------------------+--------\n Ноутбук Air 13            | 13499\n Ноутбук Pro 16            | 28499\n Смартфон Lite             | 2999\n Смартфон Max              | 11249\n Чехол для смартфона       | 149\n Беспроводные наушники     | 1124\n Зарядное устройство 65 Вт | 374\n Мышь беспроводная         | 239\n Подставка для ноутбука    | 494\n Смартфон Mini             | 5999\n(10 строк)",
    " title                   | points\n-------------------------+--------\n Ноутбук Office 14       | 8249\n Планшет Tab 11          | 4949\n Планшет Tab Mini        | 3749\n Кабель USB-C            | 89\n Клавиатура механическая | 1349\n Игровая приставка       | 7499\n Геймпад                 | 899\n Сумка для ноутбука      | 449\n(8 строк)",
  ],
  "sql-expressions-book-price-default": [
    " title                    | price_shown\n--------------------------+-------------\n Война и мир              | 1290\n Анна Каренина            | 990\n Преступление и наказание | 690\n Идиот                    | 750\n Гордость и предубеждение | 590\n Сто лет одиночества      | 890\n Норвежский лес           | 720\n Хроники заводной птицы   | 300\n Слово о полку Игореве    | 350\n Бедные люди              | 390\n(10 строк)",
    " title                            | price_shown\n----------------------------------+-------------\n Палата номер 6                   | 320\n Вишнёвый сад                     | 280\n Мастер и Маргарита               | 790\n Собачье сердце                   | 420\n 1984                             | 650\n Скотный двор                     | 300\n Убийство в «Восточном экспрессе» | 540\n И никого не стало                | 540\n Повесть временных лет            | 410\n(9 строк)",
  ],
  "sql-expressions-book-size": [
    " title                    | size\n--------------------------+---------\n Война и мир              | толстая\n Анна Каренина            | толстая\n Преступление и наказание | NULL\n Идиот                    | NULL\n Гордость и предубеждение | NULL\n Сто лет одиночества      | NULL\n Норвежский лес           | NULL\n Хроники заводной птицы   | толстая\n Слово о полку Игореве    | тонкая\n Бедные люди              | тонкая\n(10 строк)",
    " title                            | size\n----------------------------------+--------\n Палата номер 6                   | тонкая\n Вишнёвый сад                     | тонкая\n Мастер и Маргарита               | NULL\n Собачье сердце                   | тонкая\n 1984                             | NULL\n Скотный двор                     | тонкая\n Убийство в «Восточном экспрессе» | NULL\n И никого не стало                | NULL\n Повесть временных лет            | NULL\n(9 строк)",
  ],
  "sql-expressions-boxes": [
    " title                     | boxes | leftover\n---------------------------+-------+----------\n Ноутбук Air 13            | 0     | 7\n Ноутбук Pro 16            | 0     | 2\n Смартфон Lite             | 2     | 1\n Смартфон Max              | 0     | 0\n Чехол для смартфона       | 10    | 0\n Беспроводные наушники     | 2     | 10\n Зарядное устройство 65 Вт | 4     | 10\n Мышь беспроводная         | 0     | 0\n Подставка для ноутбука    | 0     | 11\n Смартфон Mini             | 0     | 9\n(10 строк)",
    " title                   | boxes | leftover\n-------------------------+-------+----------\n Ноутбук Office 14       | 1     | 0\n Планшет Tab 11          | 0     | 0\n Планшет Tab Mini        | 0     | 6\n Кабель USB-C            | 25    | 0\n Клавиатура механическая | 1     | 3\n Игровая приставка       | 0     | 4\n Геймпад                 | 0     | 0\n Сумка для ноутбука      | 1     | 6\n(8 строк)",
  ],
  "sql-expressions-city-shown": [
    " full_name      | city_shown\n----------------+-------------\n Андрей Кравцов | Москва\n Вера Тихонова  | Казань\n Олег Савин     | Москва\n Дарья Ершова   | Новосибирск\n Лев Комаров    | не указан\n Полина Гусева  | Казань\n(6 строк)",
    " full_name      | city_shown\n----------------+------------\n Тимур Абрамов  | Самара\n Алина Зуева    | Москва\n Борис Лапин    | Самара\n Ева Миронова   | не указан\n Яна Кудрявцева | Пермь\n(5 строк)",
  ],
  "sql-expressions-clean-dates": [
    " id | day\n----+------------\n 2  | 2026-02-28\n 1  | 2026-03-05\n 3  | 2026-03-17\n 5  | 2026-04-01\n(4 строки)",
    " id | day\n----+------------\n 4  | 2025-12-31\n 1  | 2026-01-10\n 2  | 2026-01-11\n 5  | 2026-02-02\n(4 строки)",
  ],
  "sql-expressions-clean-qty": [
    " id | qty\n----+-----\n 1  | 12\n 2  | 7\n 4  | 30\n 6  | 5\n(4 строки)",
    " id | qty\n----+-----\n 1  | 3\n 3  | 8\n 4  | 100\n(3 строки)",
  ],
  "sql-expressions-completion-zero": [
    " item         | completion\n--------------+------------\n Аренда офиса | 100\n Реклама      | 118\n Командировки | 64\n Обучение     | 0\n Подарки      | 0\n(5 строк)",
    " item     | completion\n----------+------------\n Серверы  | 90\n Лицензии | 0\n Курьеры  | 101\n Питание  | 136\n Ремонт   | 0\n(5 строк)",
  ],
  "sql-expressions-contact": [
    " full_name      | contact\n----------------+---------------------\n Андрей Кравцов | andrey@mail.example\n Вера Тихонова  | vera@mail.example\n Олег Савин     | Москва\n Дарья Ершова   | darya@mail.example\n Лев Комаров    | lev@mail.example\n Полина Гусева  | polina@mail.example\n(6 строк)",
    " full_name      | contact\n----------------+--------------------\n Тимур Абрамов  | timur@mail.example\n Алина Зуева    | Москва\n Борис Лапин    | boris@mail.example\n Ева Миронова   | eva@mail.example\n Яна Кудрявцева | yana@mail.example\n(5 строк)",
  ],
  "sql-expressions-cube-volume": [
    " label     | volume\n-----------+--------\n Малая     | 8\n Средняя   | 27\n Большая   | 125\n Контейнер | 1728\n(4 строки)",
    " label   | volume\n---------+--------\n Коробка | 64\n Ящик    | 216\n Сундук  | 343\n Бокс    | 1000\n(4 строки)",
  ],
  "sql-expressions-customer-region": [
    " full_name      | region\n----------------+-----------\n Андрей Кравцов | столица\n Вера Тихонова  | регион\n Олег Савин     | столица\n Дарья Ершова   | регион\n Лев Комаров    | не указан\n Полина Гусева  | регион\n(6 строк)",
    " full_name      | region\n----------------+-----------\n Тимур Абрамов  | регион\n Алина Зуева    | столица\n Борис Лапин    | регион\n Ева Миронова   | не указан\n Яна Кудрявцева | регион\n(5 строк)",
  ],
  "sql-expressions-delivery-fee": [
    " title                     | delivery\n---------------------------+----------\n Ноутбук Air 13            | 2000\n Ноутбук Pro 16            | 2000\n Смартфон Lite             | 599.7\n Смартфон Max              | 2000\n Чехол для смартфона       | 100\n Беспроводные наушники     | 224.7\n Зарядное устройство 65 Вт | 100\n Мышь беспроводная         | 100\n Подставка для ноутбука    | 100\n Смартфон Mini             | 1199.7\n(10 строк)",
    " title                   | delivery\n-------------------------+----------\n Ноутбук Office 14       | 1649.7\n Планшет Tab 11          | 989.7\n Планшет Tab Mini        | 749.7\n Кабель USB-C            | 100\n Клавиатура механическая | 269.7\n Игровая приставка       | 1499.7\n Геймпад                 | 179.7\n Сумка для ноутбука      | 100\n(8 строк)",
  ],
  "sql-expressions-deviation": [
    " item         | deviation | abs_deviation | direction\n--------------+-----------+---------------+-----------\n Аренда офиса | 0         | 0             | 0\n Реклама      | 15000     | 15000         | 1\n Командировки | -18000    | 18000         | -1\n Обучение     | 15000     | 15000         | 1\n Подарки      | -20000    | 20000         | -1\n(5 строк)",
    " item     | deviation | abs_deviation | direction\n----------+-----------+---------------+-----------\n Серверы  | -20000    | 20000         | -1\n Лицензии | 0         | 0             | 0\n Курьеры  | 500       | 500           | 1\n Питание  | 11000     | 11000         | 1\n Ремонт   | 70000     | 70000         | 1\n(5 строк)",
  ],
  "sql-expressions-every-third": [
    " full_name\n------------------\n Мария Козлова\n Сергей Лебедев\n Татьяна Соколова\n Виктор Зайцев\n(4 строки)",
    " full_name\n----------------\n Роман Егоров\n Ирина Голубева\n Глеб Воробьёв\n(3 строки)",
  ],
  "sql-expressions-higher-lower": [
    " item         | higher | lower\n--------------+--------+--------\n Аренда офиса | 120000 | 120000\n Реклама      | 95000  | 80000\n Командировки | 50000  | 32000\n Обучение     | 15000  | 0\n Подарки      | 20000  | 0\n(5 строк)",
    " item     | higher | lower\n----------+--------+--------\n Серверы  | 200000 | 180000\n Лицензии | 0      | 0\n Курьеры  | 45500  | 45000\n Питание  | 41000  | 30000\n Ремонт   | 70000  | 0\n(5 строк)",
  ],
  "sql-expressions-import-total": [
    " id | total\n----+--------\n 1  | 2398.8\n 2  | 315\n(2 строки)",
    " id | total\n----+-------\n 1  | 4500\n 4  | 99\n(2 строки)",
  ],
  "sql-expressions-in-stock-flag": [
    " title                     | in_stock\n---------------------------+----------\n Ноутбук Air 13            | 1\n Ноутбук Pro 16            | 1\n Смартфон Lite             | 1\n Смартфон Max              | 0\n Чехол для смартфона       | 1\n Беспроводные наушники     | 1\n Зарядное устройство 65 Вт | 1\n Мышь беспроводная         | 0\n Подставка для ноутбука    | 1\n Смартфон Mini             | 1\n(10 строк)",
    " title                   | in_stock\n-------------------------+----------\n Ноутбук Office 14       | 1\n Планшет Tab 11          | 0\n Планшет Tab Mini        | 1\n Кабель USB-C            | 1\n Клавиатура механическая | 1\n Игровая приставка       | 1\n Геймпад                 | 0\n Сумка для ноутбука      | 1\n(8 строк)",
  ],
  "sql-expressions-line-total": [
    " order_id | product_id | line_total\n----------+------------+------------\n 1        | 1          | 89990\n 1        | 5          | 1980\n 2        | 3          | 19990\n 2        | 6          | 7490\n 3        | 2          | 189990\n 4        | 4          | 74990\n 4        | 7          | 4980\n 5        | 6          | 14980\n 6        | 5          | 2970\n 6        | 8          | 1590\n 7        | 10         | 39990\n 8        | 1          | 89990\n 8        | 7          | 2490\n(13 строк)",
    " order_id | product_id | line_total\n----------+------------+------------\n 1        | 1          | 54990\n 1        | 4          | 1770\n 2        | 6          | 49990\n 2        | 7          | 11980\n 3        | 3          | 24990\n 4        | 2          | 32990\n 5        | 4          | 1180\n 5        | 5          | 8990\n 6        | 8          | 2990\n 7        | 1          | 52990\n 7        | 7          | 5990\n(11 строк)",
  ],
  "sql-expressions-managers-first": [
    " full_name         | position\n-------------------+-------------------------\n Анна Волкова      | Руководитель маркетинга\n Елена Новикова    | Руководитель продаж\n Ольга Смирнова    | Руководитель разработки\n Алексей Попов     | Специалист поддержки\n Виктор Зайцев     | Стажёр\n Денис Орлов       | Тестировщик\n Игорь Петров      | Бэкенд-разработчик\n Мария Козлова     | Фронтенд-разработчик\n Наталья Кузнецова | Специалист поддержки\n Павел Морозов     | Менеджер по продажам\n Сергей Лебедев    | SMM-менеджер\n Татьяна Соколова  | Менеджер по продажам\n(12 строк)",
    " full_name         | position\n-------------------+-------------------------\n Кирилл Белов      | Руководитель разработки\n Артём Семёнов     | Финансовый аналитик\n Вера Медведева    | Тестировщик\n Глеб Воробьёв     | Кладовщик\n Ирина Голубева    | Менеджер по продажам\n Ксения Богданова  | Стажёр\n Максим Виноградов | Менеджер по продажам\n Роман Егоров      | Бэкенд-разработчик\n Светлана Павлова  | Бухгалтер\n Юлия Фёдорова     | Бэкенд-разработчик\n(10 строк)",
  ],
  "sql-expressions-new-budget": [
    " name       | new_budget\n------------+------------\n Разработка | 1300000\n Маркетинг  | 550000\n Продажи    | 900000\n Поддержка  | 400000\n Аналитика  | 600000\n(5 строк)",
    " name         | new_budget\n--------------+------------\n Разработка   | 1000000\n Финансы      | 750000\n Продажи      | 500000\n Логистика    | 350000\n Юридический  | 100000\n Безопасность | 250000\n(6 строк)",
  ],
  "sql-expressions-pages-decimal": [
    " title                    | hundreds\n--------------------------+----------\n Война и мир              | 13\n Анна Каренина            | 8.6\n Преступление и наказание | 6.7\n Идиот                    | 6.4\n Гордость и предубеждение | 4.2\n Сто лет одиночества      | 4.8\n Норвежский лес           | 3.8\n Хроники заводной птицы   | 9\n Слово о полку Игореве    | 1\n Бедные люди              | 1.6\n(10 строк)",
    " title                            | hundreds\n----------------------------------+----------\n Палата номер 6                   | 1\n Вишнёвый сад                     | 1.3\n Мастер и Маргарита               | 4.8\n Собачье сердце                   | 1.6\n 1984                             | 3.3\n Скотный двор                     | 1.4\n Убийство в «Восточном экспрессе» | 2.6\n И никого не стало                | 2.9\n Повесть временных лет            | 2.2\n(9 строк)",
  ],
  "sql-expressions-pages-hundreds": [
    " title                    | hundreds\n--------------------------+----------\n Война и мир              | 13\n Анна Каренина            | 8\n Преступление и наказание | 6\n Идиот                    | 6\n Гордость и предубеждение | 4\n Сто лет одиночества      | 4\n Норвежский лес           | 3\n Хроники заводной птицы   | 8\n Слово о полку Игореве    | 0\n Бедные люди              | 1\n(10 строк)",
    " title                            | hundreds\n----------------------------------+----------\n Палата номер 6                   | 0\n Вишнёвый сад                     | 1\n Мастер и Маргарита               | 4\n Собачье сердце                   | 1\n 1984                             | 3\n Скотный двор                     | 1\n Убийство в «Восточном экспрессе» | 2\n И никого не стало                | 2\n Повесть временных лет            | 2\n(9 строк)",
  ],
  "sql-expressions-plan-completion": [
    " item         | completion\n--------------+------------\n Аренда офиса | 100\n Реклама      | 118\n Командировки | 64\n Обучение     | NULL\n Подарки      | 0\n(5 строк)",
    " item     | completion\n----------+------------\n Серверы  | 90\n Лицензии | NULL\n Курьеры  | 101\n Питание  | 136\n Ремонт   | NULL\n(5 строк)",
  ],
  "sql-expressions-price-label": [
    " label\n------------------------------------\n Ноутбук Air 13: 89990.00\n Ноутбук Pro 16: 189990.00\n Смартфон Lite: 19990.00\n Смартфон Max: 74990.00\n Чехол для смартфона: 990.00\n Беспроводные наушники: 7490.00\n Зарядное устройство 65 Вт: 2490.00\n Мышь беспроводная: 1590.00\n Подставка для ноутбука: 3290.00\n Смартфон Mini: 39990.00\n(10 строк)",
    " label\n----------------------------------\n Ноутбук Office 14: 54990.00\n Планшет Tab 11: 32990.00\n Планшет Tab Mini: 24990.00\n Кабель USB-C: 590.00\n Клавиатура механическая: 8990.00\n Игровая приставка: 49990.00\n Геймпад: 5990.00\n Сумка для ноутбука: 2990.00\n(8 строк)",
  ],
  "sql-expressions-price-per-page": [
    " title                    | price_per_page\n--------------------------+----------------\n Война и мир              | 0.99\n Анна Каренина            | 1.15\n Преступление и наказание | 1.03\n Идиот                    | 1.17\n Гордость и предубеждение | 1.42\n Сто лет одиночества      | 1.85\n Норвежский лес           | 1.88\n Слово о полку Игореве    | 3.65\n Бедные люди              | 2.44\n(9 строк)",
    " title                            | price_per_page\n----------------------------------+----------------\n Палата номер 6                   | 3.33\n Вишнёвый сад                     | 2.19\n Мастер и Маргарита               | 1.65\n Собачье сердце                   | 2.63\n 1984                             | 1.98\n Убийство в «Восточном экспрессе» | 2.11\n И никого не стало                | 1.88\n Повесть временных лет            | 1.86\n(8 строк)",
  ],
  "sql-expressions-price-sort": [
    " id | title                    | price\n----+--------------------------+-------\n 1  | Война и мир              | 1290\n 2  | Анна Каренина            | 990\n 6  | Сто лет одиночества      | 890\n 4  | Идиот                    | 750\n 7  | Норвежский лес           | 720\n 3  | Преступление и наказание | 690\n 5  | Гордость и предубеждение | 590\n 10 | Бедные люди              | 390\n 9  | Слово о полку Игореве    | 350\n 8  | Хроники заводной птицы   | NULL\n(10 строк)",
    " id | title                            | price\n----+----------------------------------+-------\n 3  | Мастер и Маргарита               | 790\n 5  | 1984                             | 650\n 7  | Убийство в «Восточном экспрессе» | 540\n 8  | И никого не стало                | 540\n 4  | Собачье сердце                   | 420\n 9  | Повесть временных лет            | 410\n 1  | Палата номер 6                   | 320\n 2  | Вишнёвый сад                     | 280\n 6  | Скотный двор                     | NULL\n(9 строк)",
  ],
  "sql-expressions-price-thousands": [
    " title                     | floor_k | ceil_k\n---------------------------+---------+--------\n Ноутбук Air 13            | 89      | 90\n Ноутбук Pro 16            | 189     | 190\n Смартфон Lite             | 19      | 20\n Смартфон Max              | 74      | 75\n Чехол для смартфона       | 0       | 1\n Беспроводные наушники     | 7       | 8\n Зарядное устройство 65 Вт | 2       | 3\n Мышь беспроводная         | 1       | 2\n Подставка для ноутбука    | 3       | 4\n Смартфон Mini             | 39      | 40\n(10 строк)",
    " title                   | floor_k | ceil_k\n-------------------------+---------+--------\n Ноутбук Office 14       | 54      | 55\n Планшет Tab 11          | 32      | 33\n Планшет Tab Mini        | 24      | 25\n Кабель USB-C            | 0       | 1\n Клавиатура механическая | 8       | 9\n Игровая приставка       | 49      | 50\n Геймпад                 | 5       | 6\n Сумка для ноутбука      | 2       | 3\n(8 строк)",
  ],
  "sql-expressions-rough-price": [
    " id | title                     | rough_price\n----+---------------------------+-------------\n 1  | Ноутбук Air 13            | 90000\n 2  | Ноутбук Pro 16            | 190000\n 3  | Смартфон Lite             | 20000\n 4  | Смартфон Max              | 75000\n 5  | Чехол для смартфона       | 1000\n 6  | Беспроводные наушники     | 7500\n 7  | Зарядное устройство 65 Вт | 2500\n 8  | Мышь беспроводная         | 1600\n 9  | Подставка для ноутбука    | 3300\n 10 | Смартфон Mini             | 40000\n(10 строк)",
    " id | title                   | rough_price\n----+-------------------------+-------------\n 1  | Ноутбук Office 14       | 55000\n 2  | Планшет Tab 11          | 33000\n 3  | Планшет Tab Mini        | 25000\n 4  | Кабель USB-C            | 600\n 5  | Клавиатура механическая | 9000\n 6  | Игровая приставка       | 50000\n 7  | Геймпад                 | 6000\n 8  | Сумка для ноутбука      | 3000\n(8 строк)",
  ],
  "sql-expressions-round-or-trunc": [
    " full_name         | rounded  | truncated\n-------------------+----------+-----------\n Ольга Смирнова    | 45714.29 | 45714.28\n Игорь Петров      | 30000    | 30000\n Мария Козлова     | 26428.57 | 26428.57\n Денис Орлов       | 17142.86 | 17142.85\n Анна Волкова      | 34285.71 | 34285.71\n Сергей Лебедев    | 13571.43 | 13571.42\n Елена Новикова    | 37142.86 | 37142.85\n Павел Морозов     | 15714.29 | 15714.28\n Татьяна Соколова  | 16428.57 | 16428.57\n Алексей Попов     | 10000    | 10000\n Наталья Кузнецова | 10285.71 | 10285.71\n Виктор Зайцев     | 6428.57  | 6428.57\n(12 строк)",
    " full_name         | rounded  | truncated\n-------------------+----------+-----------\n Кирилл Белов      | 42857.14 | 42857.14\n Юлия Фёдорова     | 32857.14 | 32857.14\n Роман Егоров      | 32857.14 | 32857.14\n Светлана Павлова  | 18571.43 | 18571.42\n Артём Семёнов     | 21428.57 | 21428.57\n Ирина Голубева    | 12857.14 | 12857.14\n Максим Виноградов | 14000    | 14000\n Ксения Богданова  | 5714.29  | 5714.28\n Глеб Воробьёв     | 9285.71  | 9285.71\n Вера Медведева    | 14000    | 14000\n(10 строк)",
  ],
  "sql-expressions-salary-grade": [
    " full_name         | grade\n-------------------+---------\n Ольга Смирнова    | высокий\n Игорь Петров      | высокий\n Мария Козлова     | средний\n Денис Орлов       | средний\n Анна Волкова      | высокий\n Сергей Лебедев    | базовый\n Елена Новикова    | высокий\n Павел Морозов     | средний\n Татьяна Соколова  | средний\n Алексей Попов     | базовый\n Наталья Кузнецова | базовый\n Виктор Зайцев     | базовый\n(12 строк)",
    " full_name         | grade\n-------------------+---------\n Кирилл Белов      | высокий\n Юлия Фёдорова     | высокий\n Роман Егоров      | высокий\n Светлана Павлова  | средний\n Артём Семёнов     | средний\n Ирина Голубева    | базовый\n Максим Виноградов | базовый\n Ксения Богданова  | базовый\n Глеб Воробьёв     | базовый\n Вера Медведева    | базовый\n(10 строк)",
  ],
  "sql-expressions-sale-price": [
    " title                     | price  | sale_price\n---------------------------+--------+------------\n Ноутбук Air 13            | 89990  | 76491.5\n Ноутбук Pro 16            | 189990 | 161491.5\n Смартфон Lite             | 19990  | 16991.5\n Смартфон Max              | 74990  | 63741.5\n Чехол для смартфона       | 990    | 841.5\n Беспроводные наушники     | 7490   | 6366.5\n Зарядное устройство 65 Вт | 2490   | 2116.5\n Мышь беспроводная         | 1590   | 1351.5\n Подставка для ноутбука    | 3290   | 2796.5\n Смартфон Mini             | 39990  | 33991.5\n(10 строк)",
    " title                   | price | sale_price\n-------------------------+-------+------------\n Ноутбук Office 14       | 54990 | 46741.5\n Планшет Tab 11          | 32990 | 28041.5\n Планшет Tab Mini        | 24990 | 21241.5\n Кабель USB-C            | 590   | 501.5\n Клавиатура механическая | 8990  | 7641.5\n Игровая приставка       | 49990 | 42491.5\n Геймпад                 | 5990  | 5091.5\n Сумка для ноутбука      | 2990  | 2541.5\n(8 строк)",
  ],
  "sql-expressions-sheets": [
    " title                    | sheets\n--------------------------+--------\n Война и мир              | 650\n Анна Каренина            | 432\n Преступление и наказание | 336\n Идиот                    | 320\n Гордость и предубеждение | 208\n Сто лет одиночества      | 240\n Норвежский лес           | 192\n Хроники заводной птицы   | 448\n Слово о полку Игореве    | 48\n Бедные люди              | 80\n(10 строк)",
    " title                            | sheets\n----------------------------------+--------\n Палата номер 6                   | 48\n Вишнёвый сад                     | 64\n Мастер и Маргарита               | 240\n Собачье сердце                   | 80\n 1984                             | 164\n Скотный двор                     | 72\n Убийство в «Восточном экспрессе» | 128\n И никого не стало                | 144\n Повесть временных лет            | 110\n(9 строк)",
  ],
  "sql-expressions-square-side": [
    " label     | side\n-----------+-------\n Малая     | 3\n Средняя   | 4.47\n Большая   | 10\n Контейнер | 12.25\n(4 строки)",
    " label   | side\n---------+------\n Коробка | 7.07\n Ящик    | 6\n Сундук  | 1.41\n Бокс    | 9\n(4 строки)",
  ],
  "sql-expressions-status-ru": [
    " id | status_ru\n----+-----------\n 1  | Отправлен\n 2  | Оплачен\n 3  | Отменён\n 4  | Отправлен\n 5  | Новый\n 6  | Отправлен\n 7  | Оплачен\n 8  | Новый\n(8 строк)",
    " id | status_ru\n----+-----------\n 1  | Отправлен\n 2  | Отправлен\n 3  | Оплачен\n 4  | Отменён\n 5  | Отправлен\n 6  | Новый\n 7  | Оплачен\n(7 строк)",
  ],
  "sql-expressions-stock-label": [
    " title                     | availability\n---------------------------+--------------\n Ноутбук Air 13            | мало\n Ноутбук Pro 16            | мало\n Смартфон Lite             | есть\n Смартфон Max              | нет\n Чехол для смартфона       | есть\n Беспроводные наушники     | есть\n Зарядное устройство 65 Вт | есть\n Мышь беспроводная         | нет\n Подставка для ноутбука    | есть\n Смартфон Mini             | мало\n(10 строк)",
    " title                   | availability\n-------------------------+--------------\n Ноутбук Office 14       | есть\n Планшет Tab 11          | нет\n Планшет Tab Mini        | мало\n Кабель USB-C            | есть\n Клавиатура механическая | есть\n Игровая приставка       | мало\n Геймпад                 | нет\n Сумка для ноутбука      | есть\n(8 строк)",
  ],
  "sql-expressions-temp-fahrenheit": [
    " sensor      | temp_f\n-------------+--------\n Склад       | 70.5\n Холодильник | 38.8\n Цех         | 97.9\n Улица       | 18.9\n Серверная   | 76.8\n(5 строк)",
    " sensor      | temp_f\n-------------+--------\n Склад       | 64.8\n Холодильник | 29.3\n Цех         | 84.4\n Улица       | 32\n Серверная   | 81.9\n(5 строк)",
  ],
  "sql-expressions-tier-total": [
    " order_id | product_id | total\n----------+------------+--------\n 1        | 1          | 89990\n 1        | 5          | 1881\n 2        | 3          | 19990\n 2        | 6          | 7490\n 3        | 2          | 189990\n 4        | 4          | 74990\n 4        | 7          | 4731\n 5        | 6          | 14231\n 6        | 5          | 2673\n 6        | 8          | 1590\n 7        | 10         | 39990\n 8        | 1          | 89990\n 8        | 7          | 2490\n(13 строк)",
    " order_id | product_id | total\n----------+------------+-------\n 1        | 1          | 54990\n 1        | 4          | 1593\n 2        | 6          | 49990\n 2        | 7          | 11381\n 3        | 3          | 24990\n 4        | 2          | 32990\n 5        | 4          | 1121\n 5        | 5          | 8990\n 6        | 8          | 2990\n 7        | 1          | 52990\n 7        | 7          | 5990\n(11 строк)",
  ],
  "sql-expressions-track-time": [
    " title           | minutes | seconds_left\n-----------------+---------+--------------\n Вступление      | 0       | 45\n Основная часть  | 3       | 7\n Разбор примеров | 10      | 0\n Итоги           | 62      | 5\n(4 строки)",
    " title    | minutes | seconds_left\n----------+---------+--------------\n Старт    | 0       | 59\n Тема     | 1       | 0\n Практика | 20      | 34\n Финал    | 59      | 59\n Бонус    | 120     | 0\n(5 строк)",
  ],
  "sql-expressions-yearly-pay": [
    " full_name         | yearly\n-------------------+---------\n Ольга Смирнова    | 4160000\n Игорь Петров      | 2730000\n Мария Козлова     | 2405000\n Денис Орлов       | 1560000\n Анна Волкова      | 3120000\n Сергей Лебедев    | 1235000\n Елена Новикова    | 3380000\n Павел Морозов     | 1430000\n Татьяна Соколова  | 1495000\n Алексей Попов     | 910000\n Наталья Кузнецова | 936000\n Виктор Зайцев     | 585000\n(12 строк)",
    " full_name         | yearly\n-------------------+---------\n Кирилл Белов      | 3900000\n Юлия Фёдорова     | 2990000\n Роман Егоров      | 2990000\n Светлана Павлова  | 1690000\n Артём Семёнов     | 1950000\n Ирина Голубева    | 1170000\n Максим Виноградов | 1274000\n Ксения Богданова  | 520000\n Глеб Воробьёв     | 845000\n Вера Медведева    | 1274000\n(10 строк)",
  ],
  "sql-grouping-agg-category-cheap": [
    " category_id | titles\n-------------+------------------------------------------------------------------------------------------\n 3           | Чехол для смартфона, Мышь беспроводная, Зарядное устройство 65 Вт, Беспроводные наушники\n(1 строка)",
    " category_id | titles\n-------------+---------------------------------------\n 3           | Кабель USB-C, Клавиатура механическая\n 5           | Геймпад\n(2 строки)",
  ],
  "sql-grouping-agg-city-customers": [
    " city        | customers_count | names\n-------------+-----------------+------------------------------\n Казань      | 2               | Вера Тихонова, Полина Гусева\n Москва      | 2               | Андрей Кравцов, Олег Савин\n Новосибирск | 1               | Дарья Ершова\n(3 строки)",
    " city   | customers_count | names\n--------+-----------------+----------------------------\n Самара | 2               | Борис Лапин, Тимур Абрамов\n Москва | 1               | Алина Зуева\n Пермь  | 1               | Яна Кудрявцева\n(3 строки)",
  ],
  "sql-grouping-agg-department-names": [
    " department_id | names\n---------------+----------------------------------------------------------\n 1             | Денис Орлов, Игорь Петров, Мария Козлова, Ольга Смирнова\n 2             | Анна Волкова, Сергей Лебедев\n 3             | Елена Новикова, Павел Морозов, Татьяна Соколова\n 4             | Алексей Попов, Наталья Кузнецова\n(4 строки)",
    " department_id | names\n---------------+-----------------------------------------------------------\n 1             | Вера Медведева, Кирилл Белов, Роман Егоров, Юлия Фёдорова\n 2             | Артём Семёнов, Светлана Павлова\n 3             | Ирина Голубева, Максим Виноградов\n 4             | Глеб Воробьёв\n(4 строки)",
  ],
  "sql-grouping-agg-distinct-cities": [
    " cities\n-----------------------------\n Казань, Москва, Новосибирск\n(1 строка)",
    " cities\n-----------------------\n Москва, Пермь, Самара\n(1 строка)",
  ],
  "sql-grouping-agg-employee-emails": [
    " emails\n----------------------------------------------------------\n olga@corp.example; igor@corp.example; maria@corp.example\n(1 строка)",
    " emails\n------------------------------------------------------------\n kirill@corp.example; roman@corp.example; vera@corp.example\n(1 строка)",
  ],
  "sql-grouping-agg-genre-titles": [
    " genre   | titles\n---------+-------------------------------------------------------------------------------------------------------------------------\n повесть | Бедные люди\n поэма   | Слово о полку Игореве\n роман   | Война и мир; Анна Каренина; Преступление и наказание; Идиот; Гордость и предубеждение; Сто лет одиночества; Н…#55b0fffb\n(3 строки)",
    " genre    | titles\n----------+-----------------------------------------------------\n детектив | Убийство в «Восточном экспрессе»; И никого не стало\n летопись | Повесть временных лет\n повесть  | Палата номер 6; Собачье сердце; Скотный двор\n пьеса    | Вишнёвый сад\n роман    | Мастер и Маргарита; 1984\n(5 строк)",
  ],
  "sql-grouping-agg-order-ids": [
    " customer_id | order_ids\n-------------+-----------\n 1           | {1,3,8}\n 2           | {2,6}\n 3           | {4}\n 4           | {5}\n 5           | {7}\n(5 строк)",
    " customer_id | order_ids\n-------------+-----------\n 1           | {2,6}\n 2           | {1,4}\n 3           | {3,7}\n 4           | {5}\n(4 строки)",
  ],
  "sql-grouping-agg-order-products": [
    " order_id | product_ids\n----------+-------------\n 1        | 1-5\n 2        | 3-6\n 3        | 2\n 4        | 4-7\n 5        | 6\n 6        | 5-8\n 7        | 10\n 8        | 1-7\n(8 строк)",
    " order_id | product_ids\n----------+-------------\n 1        | 1-4\n 2        | 6-7\n 3        | 3\n 4        | 2\n 5        | 4-5\n 6        | 8\n 7        | 1-7\n(7 строк)",
  ],
  "sql-grouping-books-avg-pages": [
    " avg_pages\n-----------\n 590.8\n(1 строка)",
    " avg_pages\n-----------\n 233.3\n(1 строка)",
  ],
  "sql-grouping-books-avg-price": [
    " avg_price\n-----------\n 740\n(1 строка)",
    " avg_price\n-----------\n 493.75\n(1 строка)",
  ],
  "sql-grouping-books-year-range": [
    " first_year | last_year\n------------+-----------\n 1800       | 1995\n(1 строка)",
    " first_year | last_year\n------------+-----------\n 1767       | 1987\n(1 строка)",
  ],
  "sql-grouping-by-category-avg-price": [
    " category_id | avg_price\n-------------+-----------\n 1           | 139990\n 2           | 44990\n 3           | 3140\n NULL        | 3290\n(4 строки)",
    " category_id | avg_price\n-------------+-----------\n 1           | 54990\n 2           | 28990\n 3           | 4790\n 5           | 27990\n NULL        | 2990\n(5 строк)",
  ],
  "sql-grouping-by-department-count": [
    " department_id | employees_count\n---------------+-----------------\n 1             | 4\n 2             | 2\n 3             | 3\n 4             | 2\n NULL          | 1\n(5 строк)",
    " department_id | employees_count\n---------------+-----------------\n 1             | 4\n 2             | 2\n 3             | 2\n 4             | 1\n NULL          | 1\n(5 строк)",
  ],
  "sql-grouping-by-department-payroll": [
    " department_id | total_salary\n---------------+--------------\n 1             | 835000\n 3             | 485000\n 2             | 335000\n 4             | 142000\n NULL          | 45000\n(5 строк)",
    " department_id | total_salary\n---------------+--------------\n 1             | 858000\n 2             | 280000\n 3             | 188000\n 4             | 65000\n NULL          | 40000\n(5 строк)",
  ],
  "sql-grouping-by-department-position": [
    " department_id | position                | employees_count\n---------------+-------------------------+-----------------\n 1             | Бэкенд-разработчик      | 1\n 1             | Руководитель разработки | 1\n 1             | Тестировщик             | 1\n 1             | Фронтенд-разработчик    | 1\n 2             | SMM-менеджер            | 1\n 2             | Руководитель маркетинга | 1\n 3             | Менеджер по продажам    | 2\n 3             | Руководитель продаж     | 1\n 4             | Специалист поддержки    | 2\n NULL          | Стажёр                  | 1\n(10 строк)",
    " department_id | position                | employees_count\n---------------+-------------------------+-----------------\n 1             | Бэкенд-разработчик      | 2\n 1             | Руководитель разработки | 1\n 1             | Тестировщик             | 1\n 2             | Бухгалтер               | 1\n 2             | Финансовый аналитик     | 1\n 3             | Менеджер по продажам    | 2\n 4             | Кладовщик               | 1\n NULL          | Стажёр                  | 1\n(8 строк)",
  ],
  "sql-grouping-by-department-recent-avg": [
    " department_id | avg_salary\n---------------+------------\n 1             | 152500\n 2             | 95000\n 3             | 115000\n 4             | 71000\n NULL          | 45000\n(5 строк)",
    " department_id | avg_salary\n---------------+------------\n 1             | 164000\n 2             | 150000\n 3             | 94000\n NULL          | 40000\n(4 строки)",
  ],
  "sql-grouping-by-genre-count": [
    " genre   | books_count\n---------+-------------\n роман   | 8\n повесть | 1\n поэма   | 1\n(3 строки)",
    " genre    | books_count\n----------+-------------\n повесть  | 3\n детектив | 2\n роман    | 2\n летопись | 1\n пьеса    | 1\n(5 строк)",
  ],
  "sql-grouping-by-genre-price-range": [
    " genre   | cheapest | priciest\n---------+----------+----------\n повесть | 390      | 390\n поэма   | 350      | 350\n роман   | 590      | 1290\n(3 строки)",
    " genre    | cheapest | priciest\n----------+----------+----------\n детектив | 540      | 540\n летопись | 410      | 410\n повесть  | 320      | 420\n пьеса    | 280      | 280\n роман    | 650      | 790\n(5 строк)",
  ],
  "sql-grouping-by-status-count": [
    " status    | orders_count\n-----------+--------------\n shipped   | 3\n new       | 2\n paid      | 2\n cancelled | 1\n(4 строки)",
    " status    | orders_count\n-----------+--------------\n shipped   | 3\n paid      | 2\n cancelled | 1\n new       | 1\n(4 строки)",
  ],
  "sql-grouping-count-cities": [
    " with_city | distinct_cities\n-----------+-----------------\n 5         | 3\n(1 строка)",
    " with_city | distinct_cities\n-----------+-----------------\n 4         | 3\n(1 строка)",
  ],
  "sql-grouping-count-departments-used": [
    " employees_count | departments_used\n-----------------+------------------\n 12              | 4\n(1 строка)",
    " employees_count | departments_used\n-----------------+------------------\n 10              | 4\n(1 строка)",
  ],
  "sql-grouping-count-email": [
    " with_email | without_email\n------------+---------------\n 9          | 3\n(1 строка)",
    " with_email | without_email\n------------+---------------\n 7          | 3\n(1 строка)",
  ],
  "sql-grouping-count-employees": [
    " employees_count\n-----------------\n 12\n(1 строка)",
    " employees_count\n-----------------\n 10\n(1 строка)",
  ],
  "sql-grouping-count-genres": [
    " genres\n--------\n 3\n(1 строка)",
    " genres\n--------\n 5\n(1 строка)",
  ],
  "sql-grouping-count-old-books": [
    " old_books\n-----------\n 7\n(1 строка)",
    " old_books\n-----------\n 2\n(1 строка)",
  ],
  "sql-grouping-count-shipped": [
    " total_orders | shipped_orders\n--------------+----------------\n 8            | 3\n(1 строка)",
    " total_orders | shipped_orders\n--------------+----------------\n 7            | 3\n(1 строка)",
  ],
  "sql-grouping-dev-avg-salary": [
    " avg_salary\n------------\n 208750\n(1 строка)",
    " avg_salary\n------------\n 214500\n(1 строка)",
  ],
  "sql-grouping-empty-sum": [
    " total_price\n-------------\n 0\n(1 строка)",
    " total_price\n-------------\n 590\n(1 строка)",
  ],
  "sql-grouping-expr-decade": [
    " decade | books_count | avg_price\n--------+-------------+-----------\n 1800   | 1           | 350\n 1810   | 1           | 590\n 1840   | 1           | 390\n 1860   | 3           | 910\n 1870   | 1           | 990\n 1960   | 1           | 890\n 1980   | 1           | 720\n 1990   | 1           | NULL\n(8 строк)",
    " decade | books_count | avg_price\n--------+-------------+-----------\n 1760   | 1           | 410\n 1890   | 1           | 320\n 1900   | 1           | 280\n 1930   | 2           | 540\n 1940   | 2           | 650\n 1960   | 1           | 790\n 1980   | 1           | 420\n(7 строк)",
  ],
  "sql-grouping-expr-hire-year": [
    " hire_year | hired\n-----------+-------\n 2016      | 1\n 2017      | 1\n 2018      | 1\n 2019      | 1\n 2020      | 1\n 2021      | 2\n 2022      | 2\n 2023      | 1\n 2024      | 1\n 2025      | 1\n(10 строк)",
    " hire_year | hired\n-----------+-------\n 2015      | 1\n 2018      | 1\n 2019      | 1\n 2020      | 1\n 2021      | 1\n 2022      | 1\n 2023      | 1\n 2024      | 1\n 2025      | 1\n 2026      | 1\n(10 строк)",
  ],
  "sql-grouping-expr-orders-month": [
    " month   | orders_count\n---------+--------------\n 2026-01 | 2\n 2026-02 | 2\n 2026-03 | 3\n 2026-04 | 1\n(4 строки)",
    " month   | orders_count\n---------+--------------\n 2025-12 | 1\n 2026-01 | 1\n 2026-02 | 2\n 2026-03 | 1\n 2026-04 | 2\n(5 строк)",
  ],
  "sql-grouping-expr-price-class": [
    " price_class | products_count | total_stock\n-------------+----------------+-------------\n дешёвые     | 4              | 189\n средние     | 3              | 68\n дорогие     | 3              | 9\n(3 строки)",
    " price_class | products_count | total_stock\n-------------+----------------+-------------\n дешёвые     | 2              | 318\n средние     | 5              | 25\n дорогие     | 1              | 12\n(3 строки)",
  ],
  "sql-grouping-expr-rollup": [
    " genre   | books_count\n---------+-------------\n повесть | 1\n поэма   | 1\n роман   | 8\n NULL    | 10\n(4 строки)",
    " genre    | books_count\n----------+-------------\n детектив | 2\n летопись | 1\n повесть  | 3\n пьеса    | 1\n роман    | 2\n NULL     | 9\n(6 строк)",
  ],
  "sql-grouping-expr-salary-band": [
    " band    | employees_count\n---------+-----------------\n низкая  | 4\n средняя | 4\n высокая | 4\n(3 строки)",
    " band    | employees_count\n---------+-----------------\n низкая  | 5\n средняя | 2\n высокая | 3\n(3 строки)",
  ],
  "sql-grouping-expr-status-pivot": [
    " customer_id | shipped_count | new_count\n-------------+---------------+-----------\n 1           | 1             | 1\n 2           | 1             | 0\n 3           | 1             | 0\n 4           | 0             | 1\n 5           | 0             | 0\n(5 строк)",
    " customer_id | shipped_count | new_count\n-------------+---------------+-----------\n 1           | 1             | 1\n 2           | 1             | 0\n 3           | 0             | 0\n 4           | 1             | 0\n(4 строки)",
  ],
  "sql-grouping-expr-title-letter": [
    " letter | books_count\n--------+-------------\n С      | 2\n А      | 1\n Б      | 1\n В      | 1\n Г      | 1\n И      | 1\n Н      | 1\n П      | 1\n Х      | 1\n(9 строк)",
    " letter | books_count\n--------+-------------\n П      | 2\n С      | 2\n 1      | 1\n В      | 1\n И      | 1\n М      | 1\n У      | 1\n(7 строк)",
  ],
  "sql-grouping-expr-year-department": [
    " hire_year | department_id | hired\n-----------+---------------+-------\n 2016      | 3             | 1\n 2017      | 1             | 1\n 2018      | 2             | 1\n 2019      | 1             | 1\n 2020      | 3             | 1\n 2021      | 1             | 1\n 2021      | 3             | 1\n 2022      | 1             | 1\n 2022      | 4             | 1\n 2023      | 2             | 1\n 2024      | 4             | 1\n 2025      | NULL          | 1\n(12 строк)",
    " hire_year | department_id | hired\n-----------+---------------+-------\n 2015      | 1             | 1\n 2018      | 4             | 1\n 2019      | 2             | 1\n 2020      | 1             | 1\n 2021      | 1             | 1\n 2022      | 3             | 1\n 2023      | 2             | 1\n 2024      | 3             | 1\n 2025      | 1             | 1\n 2026      | NULL          | 1\n(10 строк)",
  ],
  "sql-grouping-having-authors-pages": [
    " author_id | total_pages | books_count\n-----------+-------------+-------------\n 1         | 2164        | 2\n 2         | 1472        | 3\n 5         | 1280        | 2\n(3 строки)",
    " author_id | total_pages | books_count\n-----------+-------------+-------------\n 2         | 640         | 2\n 4         | 544         | 2\n(2 строки)",
  ],
  "sql-grouping-having-avg-salary": [
    " department_id | avg_salary\n---------------+------------\n 1             | 208750\n 2             | 167500\n 3             | 161666.67\n(3 строки)",
    " department_id | avg_salary\n---------------+------------\n 1             | 214500\n 2             | 140000\n(2 строки)",
  ],
  "sql-grouping-having-big-departments": [
    " department_id | employees_count\n---------------+-----------------\n 1             | 4\n 3             | 3\n(2 строки)",
    " department_id | employees_count\n---------------+-----------------\n 1             | 4\n(1 строка)",
  ],
  "sql-grouping-having-big-orders": [
    " order_id | order_total\n----------+-------------\n 1        | 91970\n 3        | 189990\n 4        | 79970\n 8        | 92480\n(4 строки)",
    " order_id | order_total\n----------+-------------\n 1        | 56760\n 2        | 61970\n 7        | 58980\n(3 строки)",
  ],
  "sql-grouping-having-genres": [
    " genre | books_count\n-------+-------------\n роман | 8\n(1 строка)",
    " genre    | books_count\n----------+-------------\n детектив | 2\n повесть  | 3\n роман    | 2\n(3 строки)",
  ],
  "sql-grouping-having-positions": [
    " position             | employees_count | max_salary\n----------------------+-----------------+------------\n Менеджер по продажам | 2               | 115000\n Специалист поддержки | 2               | 72000\n(2 строки)",
    " position             | employees_count | max_salary\n----------------------+-----------------+------------\n Бэкенд-разработчик   | 2               | 230000\n Менеджер по продажам | 2               | 98000\n(2 строки)",
  ],
  "sql-grouping-having-repeat-customers": [
    " customer_id | orders_count\n-------------+--------------\n 1           | 2\n 2           | 2\n(2 строки)",
    " customer_id | orders_count\n-------------+--------------\n 1           | 2\n 3           | 2\n(2 строки)",
  ],
  "sql-grouping-having-stock-value": [
    " category_id | stock_value\n-------------+-------------\n 1           | 1009910\n 2           | 859660\n 3           | 517880\n(3 строки)",
    " category_id | stock_value\n-------------+-------------\n 1           | 659880\n 3           | 311850\n(2 строки)",
  ],
  "sql-grouping-payroll-total": [
    " total_salary\n--------------\n 1842000\n(1 строка)",
    " total_salary\n--------------\n 1431000\n(1 строка)",
  ],
  "sql-grouping-salary-spread": [
    " salary_spread\n---------------\n 275000\n(1 строка)",
    " salary_spread\n---------------\n 260000\n(1 строка)",
  ],
  "sql-grouping-share-without-email": [
    " percent_without_email\n-----------------------\n 28.6\n(1 строка)",
    " percent_without_email\n-----------------------\n 16.7\n(1 строка)",
  ],
  "sql-grouping-stock-value": [
    " stock_value\n-------------\n 2423640\n(1 строка)",
    " stock_value\n-------------\n 1375450\n(1 строка)",
  ],
  "sql-grouping-top-orders": [
    " order_id | order_total\n----------+-------------\n 3        | 189990\n 8        | 92480\n 1        | 91970\n(3 строки)",
    " order_id | order_total\n----------+-------------\n 2        | 61970\n 7        | 58980\n 1        | 56760\n(3 строки)",
  ],
  "sql-joins-cross-mailing": [
    " full_name      | category\n----------------+------------\n Андрей Кравцов | Ноутбуки\n Андрей Кравцов | Смартфоны\n Андрей Кравцов | Аксессуары\n Андрей Кравцов | Книги\n Вера Тихонова  | Ноутбуки\n Вера Тихонова  | Смартфоны\n Вера Тихонова  | Аксессуары\n Вера Тихонова  | Книги\n Олег Савин     | Ноутбуки\n Олег Савин     | Смартфоны\n Олег Савин     | Аксессуары\n Олег Савин     | Книги\n Дарья Ершова   | Ноутбуки\n Дарья Ершова   | Смартфоны\n Дарья Ершова   | Аксессуары\n Дарья Ершова   | Книги\n Лев Комаров    | Ноутбуки\n Лев Комаров    | Смартфоны\n Лев Комаров    | Аксессуары\n Лев Комаров    | Книги\n Полина Гусева  | Ноутбуки\n Полина Гусева  | Смартфоны\n Полина Гусева  | Аксессуары\n Полина Гусева  | Книги\n(24 строки)",
    " full_name      | category\n----------------+-------------\n Тимур Абрамов  | Ноутбуки\n Тимур Абрамов  | Планшеты\n Тимур Абрамов  | Аксессуары\n Тимур Абрамов  | Игры\n Тимур Абрамов  | Фототехника\n Алина Зуева    | Ноутбуки\n Алина Зуева    | Планшеты\n Алина Зуева    | Аксессуары\n Алина Зуева    | Игры\n Алина Зуева    | Фототехника\n Борис Лапин    | Ноутбуки\n Борис Лапин    | Планшеты\n Борис Лапин    | Аксессуары\n Борис Лапин    | Игры\n Борис Лапин    | Фототехника\n Ева Миронова   | Ноутбуки\n Ева Миронова   | Планшеты\n Ева Миронова   | Аксессуары\n Ева Миронова   | Игры\n Ева Миронова   | Фототехника\n Яна Кудрявцева | Ноутбуки\n Яна Кудрявцева | Планшеты\n Яна Кудрявцева | Аксессуары\n Яна Кудрявцева | Игры\n Яна Кудрявцева | Фототехника\n(25 строк)",
  ],
  "sql-joins-cross-other-categories": [
    " product        | category\n----------------+------------\n Ноутбук Air 13 | Смартфоны\n Ноутбук Air 13 | Аксессуары\n Ноутбук Air 13 | Книги\n Ноутбук Pro 16 | Смартфоны\n Ноутбук Pro 16 | Аксессуары\n Ноутбук Pro 16 | Книги\n Смартфон Max   | Ноутбуки\n Смартфон Max   | Аксессуары\n Смартфон Max   | Книги\n(9 строк)",
    " product           | category\n-------------------+-------------\n Ноутбук Office 14 | Планшеты\n Ноутбук Office 14 | Аксессуары\n Ноутбук Office 14 | Игры\n Ноутбук Office 14 | Фототехника\n(4 строки)",
  ],
  "sql-joins-cross-pairs-count": [
    " pairs\n-------\n 60\n(1 строка)",
    " pairs\n-------\n 40\n(1 строка)",
  ],
  "sql-joins-full-books-authors": [
    " author        | title\n---------------+-----------------------\n NULL          | Слово о полку Игореве\n Анна Ахматова | NULL\n(2 строки)",
    " author       | title\n--------------+-----------------------\n NULL         | Повесть временных лет\n Рэй Брэдбери | NULL\n(2 строки)",
  ],
  "sql-joins-full-staff-departments": [
    " department | full_name\n------------+-------------------\n Разработка | Ольга Смирнова\n Разработка | Игорь Петров\n Разработка | Мария Козлова\n Разработка | Денис Орлов\n Маркетинг  | Анна Волкова\n Маркетинг  | Сергей Лебедев\n Продажи    | Елена Новикова\n Продажи    | Павел Морозов\n Продажи    | Татьяна Соколова\n Поддержка  | Алексей Попов\n Поддержка  | Наталья Кузнецова\n Аналитика  | NULL\n NULL       | Виктор Зайцев\n(13 строк)",
    " department   | full_name\n--------------+-------------------\n Разработка   | Кирилл Белов\n Разработка   | Юлия Фёдорова\n Разработка   | Роман Егоров\n Разработка   | Вера Медведева\n Финансы      | Светлана Павлова\n Финансы      | Артём Семёнов\n Продажи      | Ирина Голубева\n Продажи      | Максим Виноградов\n Логистика    | Глеб Воробьёв\n Юридический  | NULL\n Безопасность | NULL\n NULL         | Ксения Богданова\n(12 строк)",
  ],
  "sql-joins-full-unmatched-names": [
    " name\n---------------\n Аналитика\n Виктор Зайцев\n(2 строки)",
    " name\n------------------\n Безопасность\n Ксения Богданова\n Юридический\n(3 строки)",
  ],
  "sql-joins-group-category-prices": [
    " category   | products | avg_price\n------------+----------+-----------\n Ноутбуки   | 2        | 139990\n Смартфоны  | 3        | 44990\n Аксессуары | 4        | 3140\n Книги      | 0        | NULL\n(4 строки)",
    " category    | products | avg_price\n-------------+----------+-----------\n Ноутбуки    | 1        | 54990\n Планшеты    | 2        | 28990\n Аксессуары  | 2        | 4790\n Игры        | 2        | 27990\n Фототехника | 0        | NULL\n(5 строк)",
  ],
  "sql-joins-group-category-revenue": [
    " category   | revenue\n------------+---------\n Ноутбуки   | 369970\n Смартфоны  | 134970\n Аксессуары | 36480\n Книги      | 0\n(4 строки)",
    " category    | revenue\n-------------+---------\n Ноутбуки    | 107980\n Игры        | 67960\n Планшеты    | 57980\n Аксессуары  | 11940\n Фототехника | 0\n(5 строк)",
  ],
  "sql-joins-group-customer-spent": [
    " full_name      | spent\n----------------+--------\n Андрей Кравцов | 184450\n Олег Савин     | 79970\n Лев Комаров    | 39990\n Вера Тихонова  | 32040\n Дарья Ершова   | 14980\n Полина Гусева  | 0\n(6 строк)",
    " full_name      | spent\n----------------+-------\n Борис Лапин    | 83970\n Тимур Абрамов  | 64960\n Алина Зуева    | 56760\n Ева Миронова   | 10170\n Яна Кудрявцева | 0\n(5 строк)",
  ],
  "sql-joins-group-department-salary": [
    " department | total_salary\n------------+--------------\n Разработка | 835000\n Продажи    | 485000\n Маркетинг  | 335000\n Поддержка  | 142000\n(4 строки)",
    " department | total_salary\n------------+--------------\n Разработка | 858000\n Финансы    | 280000\n Продажи    | 188000\n Логистика  | 65000\n(4 строки)",
  ],
  "sql-joins-group-fanout": [
    " full_name      | orders_count | items_count\n----------------+--------------+-------------\n Андрей Кравцов | 3            | 6\n Вера Тихонова  | 2            | 6\n Олег Савин     | 1            | 3\n Дарья Ершова   | 1            | 2\n Лев Комаров    | 1            | 1\n Полина Гусева  | 0            | 0\n(6 строк)",
    " full_name      | orders_count | items_count\n----------------+--------------+-------------\n Тимур Абрамов  | 2            | 4\n Алина Зуева    | 2            | 5\n Борис Лапин    | 2            | 3\n Ева Миронова   | 1            | 3\n Яна Кудрявцева | 0            | 0\n(5 строк)",
  ],
  "sql-joins-group-order-totals": [
    " order_id | total\n----------+--------\n 1        | 91970\n 2        | 27480\n 3        | 189990\n 4        | 79970\n 5        | 14980\n 6        | 4560\n 7        | 39990\n 8        | 92480\n(8 строк)",
    " order_id | total\n----------+-------\n 1        | 56760\n 2        | 61970\n 3        | 24990\n 4        | 32990\n 5        | 10170\n 6        | 2990\n 7        | 58980\n(7 строк)",
  ],
  "sql-joins-group-prolific-authors": [
    " full_name         | books_count\n-------------------+-------------\n Фёдор Достоевский | 3\n Лев Толстой       | 2\n Харуки Мураками   | 2\n(3 строки)",
    " full_name       | books_count\n-----------------+-------------\n Антон Чехов     | 2\n Михаил Булгаков | 2\n Джордж Оруэлл   | 2\n Агата Кристи    | 2\n(4 строки)",
  ],
  "sql-joins-group-top-revenue": [
    " product        | revenue\n----------------+---------\n Ноутбук Pro 16 | 189990\n Ноутбук Air 13 | 179980\n Смартфон Max   | 74990\n(3 строки)",
    " product           | revenue\n-------------------+---------\n Ноутбук Office 14 | 107980\n Игровая приставка | 49990\n Планшет Tab 11    | 32990\n(3 строки)",
  ],
  "sql-joins-inner-active-moscow": [
    " order_id | full_name      | status\n----------+----------------+---------\n 1        | Андрей Кравцов | shipped\n 4        | Олег Савин     | shipped\n 8        | Андрей Кравцов | new\n(3 строки)",
    " order_id | full_name   | status\n----------+-------------+---------\n 1        | Алина Зуева | shipped\n(1 строка)",
  ],
  "sql-joins-inner-line-totals": [
    " order_id | product               | line_total\n----------+-----------------------+------------\n 1        | Ноутбук Air 13        | 89990\n 2        | Смартфон Lite         | 19990\n 2        | Беспроводные наушники | 7490\n 3        | Ноутбук Pro 16        | 189990\n 4        | Смартфон Max          | 74990\n 5        | Беспроводные наушники | 14980\n 7        | Смартфон Mini         | 39990\n 8        | Ноутбук Air 13        | 89990\n(8 строк)",
    " order_id | product                 | line_total\n----------+-------------------------+------------\n 1        | Ноутбук Office 14       | 54990\n 2        | Игровая приставка       | 49990\n 2        | Геймпад                 | 11980\n 3        | Планшет Tab Mini        | 24990\n 4        | Планшет Tab 11          | 32990\n 5        | Клавиатура механическая | 8990\n 7        | Ноутбук Office 14       | 52990\n 7        | Геймпад                 | 5990\n(8 строк)",
  ],
  "sql-joins-inner-moscow-staff": [
    " full_name        | department\n------------------+------------\n Ольга Смирнова   | Разработка\n Игорь Петров     | Разработка\n Мария Козлова    | Разработка\n Денис Орлов      | Разработка\n Елена Новикова   | Продажи\n Павел Морозов    | Продажи\n Татьяна Соколова | Продажи\n(7 строк)",
    " full_name        | department\n------------------+------------\n Светлана Павлова | Финансы\n Артём Семёнов    | Финансы\n(2 строки)",
  ],
  "sql-joins-inner-russian-books": [
    " title                    | author\n--------------------------+-------------------\n Война и мир              | Лев Толстой\n Анна Каренина            | Лев Толстой\n Преступление и наказание | Фёдор Достоевский\n Идиот                    | Фёдор Достоевский\n(4 строки)",
    " title              | author\n--------------------+-----------------\n Палата номер 6     | Антон Чехов\n Вишнёвый сад       | Антон Чехов\n Мастер и Маргарита | Михаил Булгаков\n Собачье сердце     | Михаил Булгаков\n(4 строки)",
  ],
  "sql-joins-inner-salary-grades": [
    " full_name | grade\n-----------+--------\n Анна      | junior\n Борис     | middle\n Вера      | middle\n Глеб      | senior\n Дина      | junior\n(5 строк)",
    " full_name | grade\n-----------+---------\n Егор      | trainee\n Жанна     | junior\n Зоя       | middle\n Игорь     | middle\n Ксения    | lead\n Лев       | junior\n(6 строк)",
  ],
  "sql-joins-inner-shipped-customers": [
    " full_name\n----------------\n Андрей Кравцов\n Вера Тихонова\n Лев Комаров\n Олег Савин\n(4 строки)",
    " full_name\n---------------\n Алина Зуева\n Борис Лапин\n Ева Миронова\n Тимур Абрамов\n(4 строки)",
  ],
  "sql-joins-inner-top-products": [
    " product        | category  | price\n----------------+-----------+--------\n Ноутбук Pro 16 | Ноутбуки  | 189990\n Ноутбук Air 13 | Ноутбуки  | 89990\n Смартфон Max   | Смартфоны | 74990\n(3 строки)",
    " product           | category | price\n-------------------+----------+-------\n Ноутбук Office 14 | Ноутбуки | 54990\n Игровая приставка | Игры     | 49990\n Планшет Tab 11    | Планшеты | 32990\n(3 строки)",
  ],
  "sql-joins-left-authors-no-books": [
    " full_name\n---------------\n Анна Ахматова\n(1 строка)",
    " full_name\n--------------\n Рэй Брэдбери\n(1 строка)",
  ],
  "sql-joins-left-books-no-author": [
    " title\n-----------------------\n Слово о полку Игореве\n(1 строка)",
    " title\n-----------------------\n Повесть временных лет\n(1 строка)",
  ],
  "sql-joins-left-customers-no-orders": [
    " full_name\n---------------\n Полина Гусева\n(1 строка)",
    " full_name\n----------------\n Яна Кудрявцева\n(1 строка)",
  ],
  "sql-joins-left-department-counts": [
    " department | employees_count\n------------+-----------------\n Разработка | 4\n Маркетинг  | 2\n Продажи    | 3\n Поддержка  | 2\n Аналитика  | 0\n(5 строк)",
    " department   | employees_count\n--------------+-----------------\n Разработка   | 4\n Финансы      | 2\n Продажи      | 2\n Логистика    | 1\n Юридический  | 0\n Безопасность | 0\n(6 строк)",
  ],
  "sql-joins-left-employee-department": [
    " full_name         | department\n-------------------+------------\n Ольга Смирнова    | Разработка\n Игорь Петров      | Разработка\n Мария Козлова     | Разработка\n Денис Орлов       | Разработка\n Анна Волкова      | Маркетинг\n Сергей Лебедев    | Маркетинг\n Елена Новикова    | Продажи\n Павел Морозов     | Продажи\n Татьяна Соколова  | Продажи\n Алексей Попов     | Поддержка\n Наталья Кузнецова | Поддержка\n Виктор Зайцев     | NULL\n(12 строк)",
    " full_name         | department\n-------------------+------------\n Кирилл Белов      | Разработка\n Юлия Фёдорова     | Разработка\n Роман Егоров      | Разработка\n Светлана Павлова  | Финансы\n Артём Семёнов     | Финансы\n Ирина Голубева    | Продажи\n Максим Виноградов | Продажи\n Ксения Богданова  | NULL\n Глеб Воробьёв     | Логистика\n Вера Медведева    | Разработка\n(10 строк)",
  ],
  "sql-joins-left-empty-departments": [
    " name\n-----------\n Аналитика\n(1 строка)",
    " name\n--------------\n Юридический\n Безопасность\n(2 строки)",
  ],
  "sql-joins-left-on-vs-where": [
    " full_name      | orders_count\n----------------+--------------\n Андрей Кравцов | 2\n Вера Тихонова  | 2\n Олег Савин     | 1\n Дарья Ершова   | 1\n Лев Комаров    | 1\n Полина Гусева  | 0\n(6 строк)",
    " full_name      | orders_count\n----------------+--------------\n Тимур Абрамов  | 2\n Алина Зуева    | 1\n Борис Лапин    | 2\n Ева Миронова   | 1\n Яна Кудрявцева | 0\n(5 строк)",
  ],
  "sql-joins-left-product-category-label": [
    " product                   | category\n---------------------------+---------------\n Ноутбук Air 13            | Ноутбуки\n Ноутбук Pro 16            | Ноутбуки\n Смартфон Lite             | Смартфоны\n Смартфон Max              | Смартфоны\n Чехол для смартфона       | Аксессуары\n Беспроводные наушники     | Аксессуары\n Зарядное устройство 65 Вт | Аксессуары\n Мышь беспроводная         | Аксессуары\n Подставка для ноутбука    | Без категории\n Смартфон Mini             | Смартфоны\n(10 строк)",
    " product                 | category\n-------------------------+---------------\n Ноутбук Office 14       | Ноутбуки\n Планшет Tab 11          | Планшеты\n Планшет Tab Mini        | Планшеты\n Кабель USB-C            | Аксессуары\n Клавиатура механическая | Аксессуары\n Игровая приставка       | Игры\n Геймпад                 | Игры\n Сумка для ноутбука      | Без категории\n(8 строк)",
  ],
  "sql-joins-left-right-categories": [
    " category   | product\n------------+---------------------------\n Ноутбуки   | Ноутбук Air 13\n Ноутбуки   | Ноутбук Pro 16\n Смартфоны  | Смартфон Lite\n Смартфоны  | Смартфон Max\n Смартфоны  | Смартфон Mini\n Аксессуары | Чехол для смартфона\n Аксессуары | Беспроводные наушники\n Аксессуары | Зарядное устройство 65 Вт\n Аксессуары | Мышь беспроводная\n Книги      | NULL\n(10 строк)",
    " category    | product\n-------------+-------------------------\n Ноутбуки    | Ноутбук Office 14\n Планшеты    | Планшет Tab 11\n Планшеты    | Планшет Tab Mini\n Аксессуары  | Кабель USB-C\n Аксессуары  | Клавиатура механическая\n Игры        | Игровая приставка\n Игры        | Геймпад\n Фототехника | NULL\n(8 строк)",
  ],
  "sql-joins-many-accessory-buyers": [
    " full_name\n----------------\n Андрей Кравцов\n Вера Тихонова\n Дарья Ершова\n Олег Савин\n(4 строки)",
    " full_name\n--------------\n Алина Зуева\n Ева Миронова\n(2 строки)",
  ],
  "sql-joins-many-accessory-revenue": [
    " order_id | product                   | line_total\n----------+---------------------------+------------\n 1        | Чехол для смартфона       | 1980\n 2        | Беспроводные наушники     | 7490\n 4        | Зарядное устройство 65 Вт | 4980\n 5        | Беспроводные наушники     | 14980\n 6        | Чехол для смартфона       | 2970\n 6        | Мышь беспроводная         | 1590\n 8        | Зарядное устройство 65 Вт | 2490\n(7 строк)",
    " order_id | product                 | line_total\n----------+-------------------------+------------\n 1        | Кабель USB-C            | 1770\n 5        | Кабель USB-C            | 1180\n 5        | Клавиатура механическая | 8990\n(3 строки)",
  ],
  "sql-joins-many-cancelled-lines": [
    " order_id | customer       | product        | quantity\n----------+----------------+----------------+----------\n 3        | Андрей Кравцов | Ноутбук Pro 16 | 1\n(1 строка)",
    " order_id | customer    | product        | quantity\n----------+-------------+----------------+----------\n 4        | Алина Зуева | Планшет Tab 11 | 1\n(1 строка)",
  ],
  "sql-joins-many-customer-products": [
    " customer       | product\n----------------+---------------------------\n Андрей Кравцов | Ноутбук Air 13\n Андрей Кравцов | Чехол для смартфона\n Андрей Кравцов | Ноутбук Pro 16\n Андрей Кравцов | Ноутбук Air 13\n Андрей Кравцов | Зарядное устройство 65 Вт\n Вера Тихонова  | Смартфон Lite\n Вера Тихонова  | Беспроводные наушники\n Вера Тихонова  | Чехол для смартфона\n Вера Тихонова  | Мышь беспроводная\n Олег Савин     | Смартфон Max\n Олег Савин     | Зарядное устройство 65 Вт\n Дарья Ершова   | Беспроводные наушники\n Лев Комаров    | Смартфон Mini\n Полина Гусева  | NULL\n(14 строк)",
    " customer       | product\n----------------+-------------------------\n Тимур Абрамов  | Игровая приставка\n Тимур Абрамов  | Геймпад\n Тимур Абрамов  | Сумка для ноутбука\n Алина Зуева    | Ноутбук Office 14\n Алина Зуева    | Кабель USB-C\n Алина Зуева    | Планшет Tab 11\n Борис Лапин    | Планшет Tab Mini\n Борис Лапин    | Ноутбук Office 14\n Борис Лапин    | Геймпад\n Ева Миронова   | Кабель USB-C\n Ева Миронова   | Клавиатура механическая\n Яна Кудрявцева | NULL\n(12 строк)",
  ],
  "sql-joins-many-order-lines": [
    " order_id | customer       | product                   | quantity\n----------+----------------+---------------------------+----------\n 1        | Андрей Кравцов | Ноутбук Air 13            | 1\n 1        | Андрей Кравцов | Чехол для смартфона       | 2\n 2        | Вера Тихонова  | Смартфон Lite             | 1\n 2        | Вера Тихонова  | Беспроводные наушники     | 1\n 3        | Андрей Кравцов | Ноутбук Pro 16            | 1\n 4        | Олег Савин     | Смартфон Max              | 1\n 4        | Олег Савин     | Зарядное устройство 65 Вт | 2\n 5        | Дарья Ершова   | Беспроводные наушники     | 2\n 6        | Вера Тихонова  | Чехол для смартфона       | 3\n 6        | Вера Тихонова  | Мышь беспроводная         | 1\n 7        | Лев Комаров    | Смартфон Mini             | 1\n 8        | Андрей Кравцов | Ноутбук Air 13            | 1\n 8        | Андрей Кравцов | Зарядное устройство 65 Вт | 1\n(13 строк)",
    " order_id | customer      | product                 | quantity\n----------+---------------+-------------------------+----------\n 1        | Алина Зуева   | Ноутбук Office 14       | 1\n 1        | Алина Зуева   | Кабель USB-C            | 3\n 2        | Тимур Абрамов | Игровая приставка       | 1\n 2        | Тимур Абрамов | Геймпад                 | 2\n 3        | Борис Лапин   | Планшет Tab Mini        | 1\n 4        | Алина Зуева   | Планшет Tab 11          | 1\n 5        | Ева Миронова  | Кабель USB-C            | 2\n 5        | Ева Миронова  | Клавиатура механическая | 1\n 6        | Тимур Абрамов | Сумка для ноутбука      | 1\n 7        | Борис Лапин   | Ноутбук Office 14       | 1\n 7        | Борис Лапин   | Геймпад                 | 1\n(11 строк)",
  ],
  "sql-joins-many-unsold-products": [
    " title\n------------------------\n Подставка для ноутбука\n(1 строка)",
    " title\n-------\n(0 строк)",
  ],
  "sql-joins-many-with-category": [
    " order_id | product                   | category\n----------+---------------------------+------------\n 1        | Ноутбук Air 13            | Ноутбуки\n 1        | Чехол для смартфона       | Аксессуары\n 2        | Смартфон Lite             | Смартфоны\n 2        | Беспроводные наушники     | Аксессуары\n 3        | Ноутбук Pro 16            | Ноутбуки\n 4        | Смартфон Max              | Смартфоны\n 4        | Зарядное устройство 65 Вт | Аксессуары\n 5        | Беспроводные наушники     | Аксессуары\n 6        | Чехол для смартфона       | Аксессуары\n 6        | Мышь беспроводная         | Аксессуары\n 7        | Смартфон Mini             | Смартфоны\n 8        | Ноутбук Air 13            | Ноутбуки\n 8        | Зарядное устройство 65 Вт | Аксессуары\n(13 строк)",
    " order_id | product                 | category\n----------+-------------------------+------------\n 1        | Ноутбук Office 14       | Ноутбуки\n 1        | Кабель USB-C            | Аксессуары\n 2        | Игровая приставка       | Игры\n 2        | Геймпад                 | Игры\n 3        | Планшет Tab Mini        | Планшеты\n 4        | Планшет Tab 11          | Планшеты\n 5        | Кабель USB-C            | Аксессуары\n 5        | Клавиатура механическая | Аксессуары\n 7        | Ноутбук Office 14       | Ноутбуки\n 7        | Геймпад                 | Игры\n(10 строк)",
  ],
  "sql-joins-relations-book-author": [
    " title                    | author\n--------------------------+------------------------\n Война и мир              | Лев Толстой\n Анна Каренина            | Лев Толстой\n Преступление и наказание | Фёдор Достоевский\n Идиот                    | Фёдор Достоевский\n Гордость и предубеждение | Джейн Остин\n Сто лет одиночества      | Габриэль Гарсиа Маркес\n Норвежский лес           | Харуки Мураками\n Хроники заводной птицы   | Харуки Мураками\n Бедные люди              | Фёдор Достоевский\n(9 строк)",
    " title                            | author\n----------------------------------+-----------------\n Палата номер 6                   | Антон Чехов\n Вишнёвый сад                     | Антон Чехов\n Мастер и Маргарита               | Михаил Булгаков\n Собачье сердце                   | Михаил Булгаков\n 1984                             | Джордж Оруэлл\n Скотный двор                     | Джордж Оруэлл\n Убийство в «Восточном экспрессе» | Агата Кристи\n И никого не стало                | Агата Кристи\n(8 строк)",
  ],
  "sql-joins-relations-count-matched": [
    " matched\n---------\n 11\n(1 строка)",
    " matched\n---------\n 9\n(1 строка)",
  ],
  "sql-joins-relations-employee-department": [
    " full_name         | department\n-------------------+------------\n Ольга Смирнова    | Разработка\n Игорь Петров      | Разработка\n Мария Козлова     | Разработка\n Денис Орлов       | Разработка\n Анна Волкова      | Маркетинг\n Сергей Лебедев    | Маркетинг\n Елена Новикова    | Продажи\n Павел Морозов     | Продажи\n Татьяна Соколова  | Продажи\n Алексей Попов     | Поддержка\n Наталья Кузнецова | Поддержка\n(11 строк)",
    " full_name         | department\n-------------------+------------\n Кирилл Белов      | Разработка\n Юлия Фёдорова     | Разработка\n Роман Егоров      | Разработка\n Светлана Павлова  | Финансы\n Артём Семёнов     | Финансы\n Ирина Голубева    | Продажи\n Максим Виноградов | Продажи\n Глеб Воробьёв     | Логистика\n Вера Медведева    | Разработка\n(9 строк)",
  ],
  "sql-joins-relations-order-customer": [
    " order_id | full_name      | status\n----------+----------------+-----------\n 1        | Андрей Кравцов | shipped\n 2        | Вера Тихонова  | paid\n 3        | Андрей Кравцов | cancelled\n 4        | Олег Савин     | shipped\n 5        | Дарья Ершова   | new\n 6        | Вера Тихонова  | shipped\n 7        | Лев Комаров    | paid\n 8        | Андрей Кравцов | new\n(8 строк)",
    " order_id | full_name     | status\n----------+---------------+-----------\n 1        | Алина Зуева   | shipped\n 2        | Тимур Абрамов | shipped\n 3        | Борис Лапин   | paid\n 4        | Алина Зуева   | cancelled\n 5        | Ева Миронова  | shipped\n 6        | Тимур Абрамов | new\n 7        | Борис Лапин   | paid\n(7 строк)",
  ],
  "sql-joins-relations-order-lines": [
    " order_id | product                   | quantity\n----------+---------------------------+----------\n 1        | Ноутбук Air 13            | 1\n 1        | Чехол для смартфона       | 2\n 2        | Смартфон Lite             | 1\n 2        | Беспроводные наушники     | 1\n 3        | Ноутбук Pro 16            | 1\n 4        | Смартфон Max              | 1\n 4        | Зарядное устройство 65 Вт | 2\n 5        | Беспроводные наушники     | 2\n 6        | Чехол для смартфона       | 3\n 6        | Мышь беспроводная         | 1\n 7        | Смартфон Mini             | 1\n 8        | Ноутбук Air 13            | 1\n 8        | Зарядное устройство 65 Вт | 1\n(13 строк)",
    " order_id | product                 | quantity\n----------+-------------------------+----------\n 1        | Ноутбук Office 14       | 1\n 1        | Кабель USB-C            | 3\n 2        | Игровая приставка       | 1\n 2        | Геймпад                 | 2\n 3        | Планшет Tab Mini        | 1\n 4        | Планшет Tab 11          | 1\n 5        | Кабель USB-C            | 2\n 5        | Клавиатура механическая | 1\n 6        | Сумка для ноутбука      | 1\n 7        | Ноутбук Office 14       | 1\n 7        | Геймпад                 | 1\n(11 строк)",
  ],
  "sql-joins-relations-product-category": [
    " product                   | category\n---------------------------+------------\n Ноутбук Air 13            | Ноутбуки\n Ноутбук Pro 16            | Ноутбуки\n Смартфон Lite             | Смартфоны\n Смартфон Max              | Смартфоны\n Чехол для смартфона       | Аксессуары\n Беспроводные наушники     | Аксессуары\n Зарядное устройство 65 Вт | Аксессуары\n Мышь беспроводная         | Аксессуары\n Смартфон Mini             | Смартфоны\n(9 строк)",
    " product                 | category\n-------------------------+------------\n Ноутбук Office 14       | Ноутбуки\n Планшет Tab 11          | Планшеты\n Планшет Tab Mini        | Планшеты\n Кабель USB-C            | Аксессуары\n Клавиатура механическая | Аксессуары\n Игровая приставка       | Игры\n Геймпад                 | Игры\n(7 строк)",
  ],
  "sql-joins-self-earns-more": [
    " employee          | salary | manager       | manager_salary\n-------------------+--------+---------------+----------------\n Наталья Кузнецова | 72000  | Алексей Попов | 70000\n(1 строка)",
    " employee          | salary | manager          | manager_salary\n-------------------+--------+------------------+----------------\n Артём Семёнов     | 150000 | Светлана Павлова | 130000\n Максим Виноградов | 98000  | Ирина Голубева   | 90000\n(2 строки)",
  ],
  "sql-joins-self-employee-manager": [
    " employee          | manager\n-------------------+----------------\n Ольга Смирнова    | NULL\n Игорь Петров      | Ольга Смирнова\n Мария Козлова     | Ольга Смирнова\n Денис Орлов       | Ольга Смирнова\n Анна Волкова      | NULL\n Сергей Лебедев    | Анна Волкова\n Елена Новикова    | NULL\n Павел Морозов     | Елена Новикова\n Татьяна Соколова  | Елена Новикова\n Алексей Попов     | NULL\n Наталья Кузнецова | Алексей Попов\n Виктор Зайцев     | NULL\n(12 строк)",
    " employee          | manager\n-------------------+------------------\n Кирилл Белов      | NULL\n Юлия Фёдорова     | Кирилл Белов\n Роман Егоров      | Кирилл Белов\n Светлана Павлова  | NULL\n Артём Семёнов     | Светлана Павлова\n Ирина Голубева    | NULL\n Максим Виноградов | Ирина Голубева\n Ксения Богданова  | NULL\n Глеб Воробьёв     | NULL\n Вера Медведева    | Кирилл Белов\n(10 строк)",
  ],
  "sql-joins-self-no-reports": [
    " full_name\n-------------------\n Игорь Петров\n Мария Козлова\n Денис Орлов\n Сергей Лебедев\n Павел Морозов\n Татьяна Соколова\n Наталья Кузнецова\n Виктор Зайцев\n(8 строк)",
    " full_name\n-------------------\n Юлия Фёдорова\n Роман Егоров\n Артём Семёнов\n Максим Виноградов\n Ксения Богданова\n Глеб Воробьёв\n Вера Медведева\n(7 строк)",
  ],
  "sql-joins-self-price-pairs": [
    " first_product             | second_product            | price_diff\n---------------------------+---------------------------+------------\n Чехол для смартфона       | Беспроводные наушники     | 6500\n Чехол для смартфона       | Зарядное устройство 65 Вт | 1500\n Чехол для смартфона       | Мышь беспроводная         | 600\n Беспроводные наушники     | Зарядное устройство 65 Вт | 5000\n Беспроводные наушники     | Мышь беспроводная         | 5900\n Зарядное устройство 65 Вт | Мышь беспроводная         | 900\n(6 строк)",
    " first_product  | second_product          | price_diff\n----------------+-------------------------+------------\n Планшет Tab 11 | Планшет Tab Mini        | 8000\n Кабель USB-C   | Клавиатура механическая | 8400\n(2 строки)",
  ],
  "sql-joins-self-report-counts": [
    " manager        | reports\n----------------+---------\n Ольга Смирнова | 3\n Елена Новикова | 2\n Анна Волкова   | 1\n Алексей Попов  | 1\n(4 строки)",
    " manager          | reports\n------------------+---------\n Кирилл Белов     | 3\n Светлана Павлова | 1\n Ирина Голубева   | 1\n(3 строки)",
  ],
  "sql-joins-self-same-position": [
    " first_employee | second_employee   | position\n----------------+-------------------+----------------------\n Павел Морозов  | Татьяна Соколова  | Менеджер по продажам\n Алексей Попов  | Наталья Кузнецова | Специалист поддержки\n(2 строки)",
    " first_employee | second_employee   | position\n----------------+-------------------+----------------------\n Юлия Фёдорова  | Роман Егоров      | Бэкенд-разработчик\n Ирина Голубева | Максим Виноградов | Менеджер по продажам\n(2 строки)",
  ],
  "sql-meta-all-indexes": [
    " index_name         | table_name | table_rows\n--------------------+------------+------------\n doctors_pkey       | doctors    | 3\n patients_email_idx | patients   | 4\n patients_pkey      | patients   | 4\n visits_date_idx    | visits     | 6\n visits_patient_idx | visits     | 6\n visits_pkey        | visits     | 6\n(6 строк)",
    " index_name         | table_name | table_rows\n--------------------+------------+------------\n doctors_pkey       | doctors    | 2\n patients_email_idx | patients   | 5\n patients_pkey      | patients   | 5\n visits_date_idx    | visits     | 7\n visits_patient_idx | visits     | 7\n visits_pkey        | visits     | 7\n(6 строк)",
  ],
  "sql-meta-date-columns": [
    " table_name | column_name | earliest\n------------+-------------+------------\n patients   | birth_date  | 1978-07-21\n visits     | visit_date  | 2026-02-03\n(2 строки)",
    " table_name | column_name | earliest\n------------+-------------+------------\n patients   | birth_date  | 1960-12-12\n visits     | visit_date  | 2025-12-10\n(2 строки)",
  ],
  "sql-meta-distinct-values": [
    " column_name | n_distinct\n-------------+------------\n doctor_id   | -0.5\n patient_id  | -0.666667\n status      | -0.5\n(3 строки)",
    " column_name | n_distinct\n-------------+------------\n doctor_id   | -0.285714\n patient_id  | -0.714286\n status      | -0.428571\n(3 строки)",
  ],
  "sql-meta-estimated-rows": [
    " table_name | estimated_rows\n------------+----------------\n patients   | 4\n visits     | 6\n(2 строки)",
    " table_name | estimated_rows\n------------+----------------\n patients   | 5\n visits     | 7\n(2 строки)",
  ],
  "sql-meta-foreign-keys": [
    " child_table | child_column | parent_table | child_rows\n-------------+--------------+--------------+------------\n visits      | doctor_id    | doctors      | 6\n visits      | patient_id   | patients     | 6\n(2 строки)",
    " child_table | child_column | parent_table | child_rows\n-------------+--------------+--------------+------------\n visits      | doctor_id    | doctors      | 7\n visits      | patient_id   | patients     | 7\n(2 строки)",
  ],
  "sql-meta-index-composite": [
    " definition                                                     | rows_count\n----------------------------------------------------------------+------------\n CREATE INDEX ON public.visits USING btree (patient_id)         | 6\n CREATE INDEX ON public.visits USING btree (status, visit_date) | 6\n CREATE INDEX ON public.visits USING btree (visit_date)         | 6\n CREATE UNIQUE INDEX ON public.visits USING btree (id)          | 6\n(4 строки)",
    " definition                                                     | rows_count\n----------------------------------------------------------------+------------\n CREATE INDEX ON public.visits USING btree (patient_id)         | 7\n CREATE INDEX ON public.visits USING btree (status, visit_date) | 7\n CREATE INDEX ON public.visits USING btree (visit_date)         | 7\n CREATE UNIQUE INDEX ON public.visits USING btree (id)          | 7\n(4 строки)",
  ],
  "sql-meta-index-lower-email": [
    " definition                                                 | rows_count\n------------------------------------------------------------+------------\n CREATE INDEX ON public.patients USING btree (lower(email)) | 4\n CREATE UNIQUE INDEX ON public.patients USING btree (email) | 4\n CREATE UNIQUE INDEX ON public.patients USING btree (id)    | 4\n(3 строки)",
    " definition                                                 | rows_count\n------------------------------------------------------------+------------\n CREATE INDEX ON public.patients USING btree (lower(email)) | 5\n CREATE UNIQUE INDEX ON public.patients USING btree (email) | 5\n CREATE UNIQUE INDEX ON public.patients USING btree (id)    | 5\n(3 строки)",
  ],
  "sql-meta-index-partial": [
    " definition                                                                              | rows_count\n-----------------------------------------------------------------------------------------+------------\n CREATE INDEX ON public.visits USING btree (patient_id)                                  | 6\n CREATE INDEX ON public.visits USING btree (visit_date)                                  | 6\n CREATE INDEX ON public.visits USING btree (visit_date) WHERE (status = 'planned'::text) | 6\n CREATE UNIQUE INDEX ON public.visits USING btree (id)                                   | 6\n(4 строки)",
    " definition                                                                              | rows_count\n-----------------------------------------------------------------------------------------+------------\n CREATE INDEX ON public.visits USING btree (patient_id)                                  | 7\n CREATE INDEX ON public.visits USING btree (visit_date)                                  | 7\n CREATE INDEX ON public.visits USING btree (visit_date) WHERE (status = 'planned'::text) | 7\n CREATE UNIQUE INDEX ON public.visits USING btree (id)                                   | 7\n(4 строки)",
  ],
  "sql-meta-index-redundant": [
    " definition                                                         | rows_count\n--------------------------------------------------------------------+------------\n CREATE INDEX ON public.visits USING btree (patient_id, visit_date) | 6\n CREATE INDEX ON public.visits USING btree (visit_date)             | 6\n CREATE UNIQUE INDEX ON public.visits USING btree (id)              | 6\n(3 строки)",
    " definition                                                         | rows_count\n--------------------------------------------------------------------+------------\n CREATE INDEX ON public.visits USING btree (patient_id, visit_date) | 7\n CREATE INDEX ON public.visits USING btree (visit_date)             | 7\n CREATE UNIQUE INDEX ON public.visits USING btree (id)              | 7\n(3 строки)",
  ],
  "sql-meta-null-columns": [
    " column_name | nulls_count\n-------------+-------------\n note        | 4\n price       | 2\n(2 строки)",
    " column_name | nulls_count\n-------------+-------------\n note        | 3\n price       | 2\n(2 строки)",
  ],
  "sql-meta-null-fraction": [
    " column_name | null_frac\n-------------+-----------\n note        | 0.666667\n price       | 0.333333\n(2 строки)",
    " column_name | null_frac\n-------------+-----------\n note        | 0.428571\n price       | 0.285714\n(2 строки)",
  ],
  "sql-meta-primary-keys": [
    " table_name  | key_columns          | rows_count\n-------------+----------------------+------------\n categories  | id                   | 4\n customers   | id                   | 6\n order_items | order_id, product_id | 13\n orders      | id                   | 8\n products    | id                   | 10\n(5 строк)",
    " table_name  | key_columns          | rows_count\n-------------+----------------------+------------\n categories  | id                   | 5\n customers   | id                   | 5\n order_items | order_id, product_id | 11\n orders      | id                   | 7\n products    | id                   | 8\n(5 строк)",
  ],
  "sql-meta-table-rows": [
    " table_name | rows_count\n------------+------------\n doctors    | 3\n patients   | 4\n visits     | 6\n(3 строки)",
    " table_name | rows_count\n------------+------------\n doctors    | 2\n patients   | 5\n visits     | 7\n(3 строки)",
  ],
  "sql-practice-company-above-department-average": [
    " full_name         | department | salary\n-------------------+------------+--------\n Анна Волкова      | Маркетинг  | 240000\n Наталья Кузнецова | Поддержка  | 72000\n Елена Новикова    | Продажи    | 260000\n Ольга Смирнова    | Разработка | 320000\n Игорь Петров      | Разработка | 210000\n(5 строк)",
    " full_name         | department | salary\n-------------------+------------+--------\n Максим Виноградов | Продажи    | 98000\n Кирилл Белов      | Разработка | 300000\n Роман Егоров      | Разработка | 230000\n Юлия Фёдорова     | Разработка | 230000\n Артём Семёнов     | Финансы    | 150000\n(5 строк)",
  ],
  "sql-practice-company-age-groups": [
    " age_group | employees_count\n-----------+-----------------\n до 30     | 7\n 30-39     | 3\n 40+       | 2\n(3 строки)",
    " age_group | employees_count\n-----------+-----------------\n до 30     | 5\n 30-39     | 3\n 40+       | 2\n(3 строки)",
  ],
  "sql-practice-company-average-tenure": [
    " department | avg_years\n------------+-----------\n Продажи    | 6.6\n Разработка | 6.1\n Маркетинг  | 5.7\n Поддержка  | 3\n(4 строки)",
    " department | avg_years\n------------+-----------\n Логистика  | 7.3\n Разработка | 5.7\n Финансы    | 4.8\n Продажи    | 3.2\n(4 строки)",
  ],
  "sql-practice-company-close-salary-pairs": [
    " first_employee | second_employee   | salary_gap\n----------------+-------------------+------------\n Алексей Попов  | Наталья Кузнецова | 2000\n Павел Морозов  | Татьяна Соколова  | 5000\n(2 строки)",
    " first_employee | second_employee   | salary_gap\n----------------+-------------------+------------\n Юлия Фёдорова  | Роман Егоров      | 0\n Ирина Голубева | Максим Виноградов | 8000\n(2 строки)",
  ],
  "sql-practice-company-departments-above-average": [
    " department | avg_salary\n------------+------------\n Разработка | 208750\n Маркетинг  | 167500\n Продажи    | 161666.67\n(3 строки)",
    " department | avg_salary\n------------+------------\n Разработка | 214500\n(1 строка)",
  ],
  "sql-practice-company-headcount": [
    " department | employees_count | payroll\n------------+-----------------+---------\n Разработка | 4               | 835000\n Продажи    | 3               | 485000\n Маркетинг  | 2               | 335000\n Поддержка  | 2               | 142000\n Аналитика  | 0               | 0\n(5 строк)",
    " department   | employees_count | payroll\n--------------+-----------------+---------\n Разработка   | 4               | 858000\n Финансы      | 2               | 280000\n Продажи      | 2               | 188000\n Логистика    | 1               | 65000\n Безопасность | 0               | 0\n Юридический  | 0               | 0\n(6 строк)",
  ],
  "sql-practice-company-managers-reports": [
    " manager        | reports_count\n----------------+---------------\n Ольга Смирнова | 3\n Елена Новикова | 2\n Алексей Попов  | 1\n Анна Волкова   | 1\n(4 строки)",
    " manager          | reports_count\n------------------+---------------\n Кирилл Белов     | 3\n Ирина Голубева   | 1\n Светлана Павлова | 1\n(3 строки)",
  ],
  "sql-practice-company-salary-gap": [
    " employee          | manager        | gap\n-------------------+----------------+--------\n Денис Орлов       | Ольга Смирнова | 200000\n Павел Морозов     | Елена Новикова | 150000\n Сергей Лебедев    | Анна Волкова   | 145000\n Татьяна Соколова  | Елена Новикова | 145000\n Мария Козлова     | Ольга Смирнова | 135000\n Игорь Петров      | Ольга Смирнова | 110000\n Наталья Кузнецова | Алексей Попов  | -2000\n(7 строк)",
    " employee          | manager          | gap\n-------------------+------------------+--------\n Вера Медведева    | Кирилл Белов     | 202000\n Роман Егоров      | Кирилл Белов     | 70000\n Юлия Фёдорова     | Кирилл Белов     | 70000\n Максим Виноградов | Ирина Голубева   | -8000\n Артём Семёнов     | Светлана Павлова | -20000\n(5 строк)",
  ],
  "sql-practice-courses-passed-all-backend": [
    " id | name\n----+------\n 1  | Аня\n 3  | Вика\n(2 строки)",
    " id | name\n----+------\n 1  | Ира\n(1 строка)",
  ],
  "sql-practice-library-above-genre-average": [
    " title               | genre | price\n---------------------+-------+-------\n Война и мир         | роман | 1290\n Анна Каренина       | роман | 990\n Сто лет одиночества | роман | 890\n(3 строки)",
    " title              | genre   | price\n--------------------+---------+-------\n Собачье сердце     | повесть | 420\n Мастер и Маргарита | роман   | 790\n(2 строки)",
  ],
  "sql-practice-library-all-before-1950": [
    " id | full_name\n----+-------------------\n 1  | Лев Толстой\n 2  | Фёдор Достоевский\n 3  | Джейн Остин\n(3 строки)",
    " id | full_name\n----+---------------\n 1  | Антон Чехов\n 3  | Джордж Оруэлл\n 4  | Агата Кристи\n(3 строки)",
  ],
  "sql-practice-library-authors-without-books": [
    " id | full_name\n----+---------------\n 6  | Анна Ахматова\n(1 строка)",
    " id | full_name\n----+--------------\n 7  | Рэй Брэдбери\n(1 строка)",
  ],
  "sql-practice-library-centuries": [
    " century | books_count\n---------+-------------\n 18      | 1\n 19      | 6\n 20      | 3\n(3 строки)",
    " century | books_count\n---------+-------------\n 18      | 1\n 19      | 1\n 20      | 7\n(3 строки)",
  ],
  "sql-practice-library-country-report": [
    " country        | authors_count | books_count\n----------------+---------------+-------------\n Россия         | 3             | 5\n Япония         | 1             | 2\n Великобритания | 1             | 1\n Колумбия       | 1             | 1\n(4 строки)",
    " country        | authors_count | books_count\n----------------+---------------+-------------\n Великобритания | 2             | 4\n Россия         | 2             | 4\n США            | 1             | 0\n(3 строки)",
  ],
  "sql-practice-library-genre-report": [
    " genre | books_count | avg_price\n-------+-------------+-----------\n роман | 8           | 845.71\n(1 строка)",
    " genre    | books_count | avg_price\n----------+-------------+-----------\n повесть  | 3           | 370\n детектив | 2           | 540\n роман    | 2           | 720\n(3 строки)",
  ],
  "sql-practice-library-multi-genre-authors": [
    " full_name         | genres_count\n-------------------+--------------\n Фёдор Достоевский | 2\n(1 строка)",
    " full_name       | genres_count\n-----------------+--------------\n Антон Чехов     | 2\n Джордж Оруэлл   | 2\n Михаил Булгаков | 2\n(3 строки)",
  ],
  "sql-practice-library-titles-per-author": [
    " author            | books_count | titles\n-------------------+-------------+----------------------------------------------\n Фёдор Достоевский | 3           | Бедные люди; Преступление и наказание; Идиот\n Лев Толстой       | 2           | Война и мир; Анна Каренина\n Харуки Мураками   | 2           | Норвежский лес; Хроники заводной птицы\n(3 строки)",
    " author          | books_count | titles\n-----------------+-------------+-----------------------------------------------------\n Агата Кристи    | 2           | Убийство в «Восточном экспрессе»; И никого не стало\n Антон Чехов     | 2           | Палата номер 6; Вишнёвый сад\n Джордж Оруэлл   | 2           | Скотный двор; 1984\n Михаил Булгаков | 2           | Мастер и Маргарита; Собачье сердце\n(4 строки)",
  ],
  "sql-practice-library-top-author-pages": [
    " full_name   | total_pages\n-------------+-------------\n Лев Толстой | 2164\n(1 строка)",
    " full_name       | total_pages\n-----------------+-------------\n Михаил Булгаков | 640\n(1 строка)",
  ],
  "sql-practice-library-youngest-authors": [
    " title                    | author            | age_at_publication\n--------------------------+-------------------+--------------------\n Бедные люди              | Фёдор Достоевский | 25\n Гордость и предубеждение | Джейн Остин       | 38\n Норвежский лес           | Харуки Мураками   | 38\n(3 строки)",
    " title          | author        | age_at_publication\n----------------+---------------+--------------------\n Палата номер 6 | Антон Чехов   | 32\n Скотный двор   | Джордж Оруэлл | 42\n Вишнёвый сад   | Антон Чехов   | 44\n(3 строки)",
  ],
  "sql-practice-network-common-friends": [
    " first_person | second_person | common_friends\n--------------+---------------+----------------\n Боря         | Даша          | 2\n Вика         | Гоша          | 2\n(2 строки)",
    " first_person | second_person | common_friends\n--------------+---------------+----------------\n Иван         | Нина          | 2\n Лена         | Макс          | 2\n(2 строки)",
  ],
  "sql-practice-network-friends-of-friends": [
    " id | name\n----+------\n 4  | Гоша\n 5  | Даша\n(2 строки)",
    " id | name\n----+------\n 4  | Нина\n 7  | Рита\n(2 строки)",
  ],
  "sql-practice-network-popularity": [
    " name  | friends_count\n-------+---------------\n Боря  | 3\n Вика  | 3\n Гоша  | 3\n Даша  | 3\n Аня   | 2\n Егор  | 1\n Жанна | 1\n Зоя   | 0\n(8 строк)",
    " name | friends_count\n------+---------------\n Лена | 3\n Нина | 3\n Иван | 2\n Макс | 2\n Олег | 2\n Петя | 1\n Рита | 1\n Тоня | 0\n(8 строк)",
  ],
  "sql-practice-shop-above-category-average": [
    " product               | category   | price\n-----------------------+------------+--------\n Беспроводные наушники | Аксессуары | 7490\n Ноутбук Pro 16        | Ноутбуки   | 189990\n Смартфон Max          | Смартфоны  | 74990\n(3 строки)",
    " product                 | category   | price\n-------------------------+------------+-------\n Клавиатура механическая | Аксессуары | 8990\n Игровая приставка       | Игры       | 49990\n Планшет Tab 11          | Планшеты   | 32990\n(3 строки)",
  ],
  "sql-practice-shop-active-months": [
    " full_name      | active_months\n----------------+---------------\n Андрей Кравцов | 2\n Вера Тихонова  | 2\n(2 строки)",
    " full_name     | active_months\n---------------+---------------\n Борис Лапин   | 2\n Тимур Абрамов | 2\n(2 строки)",
  ],
  "sql-practice-shop-cancelled-share": [
    " full_name      | cancelled_percent\n----------------+-------------------\n Андрей Кравцов | 33.3\n(1 строка)",
    " full_name   | cancelled_percent\n-------------+-------------------\n Алина Зуева | 50\n(1 строка)",
  ],
  "sql-practice-shop-category-revenue": [
    " title      | revenue\n------------+---------\n Ноутбуки   | 179980\n Смартфоны  | 134970\n Аксессуары | 36480\n Книги      | 0\n(4 строки)",
    " title       | revenue\n-------------+---------\n Ноутбуки    | 107980\n Игры        | 67960\n Планшеты    | 24990\n Аксессуары  | 11940\n Фототехника | 0\n(5 строк)",
  ],
  "sql-practice-shop-city-report": [
    " city        | customers_count | orders_count\n-------------+-----------------+--------------\n Москва      | 2               | 3\n Казань      | 2               | 2\n Новосибирск | 1               | 1\n не указан   | 1               | 1\n(4 строки)",
    " city      | customers_count | orders_count\n-----------+-----------------+--------------\n Самара    | 2               | 4\n Москва    | 1               | 1\n не указан | 1               | 1\n Пермь     | 1               | 0\n(4 строки)",
  ],
  "sql-practice-shop-customer-totals": [
    " full_name      | orders_count | total_spent\n----------------+--------------+-------------\n Андрей Кравцов | 2            | 184450\n Олег Савин     | 1            | 79970\n Лев Комаров    | 1            | 39990\n Вера Тихонова  | 2            | 32040\n Дарья Ершова   | 1            | 14980\n Полина Гусева  | 0            | 0\n(6 строк)",
    " full_name      | orders_count | total_spent\n----------------+--------------+-------------\n Борис Лапин    | 2            | 83970\n Тимур Абрамов  | 2            | 64960\n Алина Зуева    | 1            | 56760\n Ева Миронова   | 1            | 10170\n Яна Кудрявцева | 0            | 0\n(5 строк)",
  ],
  "sql-practice-shop-days-to-first-order": [
    " full_name      | days_to_first_order\n----------------+---------------------\n Андрей Кравцов | 701\n Вера Тихонова  | 539\n Олег Савин     | 405\n Дарья Ершова   | 256\n Лев Комаров    | 157\n(5 строк)",
    " full_name     | days_to_first_order\n---------------+---------------------\n Тимур Абрамов | 777\n Алина Зуева   | 604\n Борис Лапин   | 354\n Ева Миронова  | 226\n(4 строки)",
  ],
  "sql-practice-shop-not-bought-in-march": [
    " id | title\n----+---------------------------\n 1  | Ноутбук Air 13\n 2  | Ноутбук Pro 16\n 3  | Смартфон Lite\n 4  | Смартфон Max\n 7  | Зарядное устройство 65 Вт\n 9  | Подставка для ноутбука\n(6 строк)",
    " id | title\n----+--------------------\n 1  | Ноутбук Office 14\n 2  | Планшет Tab 11\n 3  | Планшет Tab Mini\n 6  | Игровая приставка\n 7  | Геймпад\n 8  | Сумка для ноутбука\n(6 строк)",
  ],
  "sql-practice-shop-order-composition": [
    " order_id | items                                   | total\n----------+-----------------------------------------+-------\n 1        | Ноутбук Air 13, Чехол для смартфона     | 91970\n 2        | Беспроводные наушники, Смартфон Lite    | 27480\n 4        | Зарядное устройство 65 Вт, Смартфон Max | 79970\n 6        | Мышь беспроводная, Чехол для смартфона  | 4560\n 7        | Смартфон Mini                           | 39990\n(5 строк)",
    " order_id | items                                 | total\n----------+---------------------------------------+-------\n 1        | Кабель USB-C, Ноутбук Office 14       | 56760\n 2        | Геймпад, Игровая приставка            | 61970\n 3        | Планшет Tab Mini                      | 24990\n 5        | Кабель USB-C, Клавиатура механическая | 10170\n 7        | Геймпад, Ноутбук Office 14            | 58980\n(5 строк)",
  ],
  "sql-practice-shop-orders-above-average": [
    " order_id | total\n----------+-------\n 8        | 92480\n 1        | 91970\n 4        | 79970\n(3 строки)",
    " order_id | total\n----------+-------\n 2        | 61970\n 7        | 58980\n 1        | 56760\n(3 строки)",
  ],
  "sql-practice-window-days-to-next-order": [
    " order_id | customer_id | days_to_next\n----------+-------------+--------------\n 1        | 1           | 22\n 2        | 2           | 47\n 3        | 1           | 58\n 4        | 3           | NULL\n 5        | 4           | NULL\n 6        | 2           | NULL\n 7        | 5           | NULL\n 8        | 1           | NULL\n(8 строк)",
    " order_id | customer_id | days_to_next\n----------+-------------+--------------\n 1        | 2           | 49\n 2        | 1           | 96\n 3        | 3           | 72\n 4        | 2           | NULL\n 5        | 4           | NULL\n 6        | 1           | NULL\n 7        | 3           | NULL\n(7 строк)",
  ],
  "sql-practice-window-dense-rank-years": [
    " title                    | published_year | place\n--------------------------+----------------+-------\n Хроники заводной птицы   | 1995           | 1\n Норвежский лес           | 1987           | 2\n Сто лет одиночества      | 1967           | 3\n Анна Каренина            | 1878           | 4\n Война и мир              | 1869           | 5\n Идиот                    | 1869           | 5\n Преступление и наказание | 1866           | 6\n Бедные люди              | 1846           | 7\n Гордость и предубеждение | 1813           | 8\n Слово о полку Игореве    | 1800           | 9\n(10 строк)",
    " title                            | published_year | place\n----------------------------------+----------------+-------\n Собачье сердце                   | 1987           | 1\n Мастер и Маргарита               | 1967           | 2\n 1984                             | 1949           | 3\n Скотный двор                     | 1945           | 4\n И никого не стало                | 1939           | 5\n Убийство в «Восточном экспрессе» | 1934           | 6\n Вишнёвый сад                     | 1904           | 7\n Палата номер 6                   | 1892           | 8\n Повесть временных лет            | 1767           | 9\n(9 строк)",
  ],
  "sql-practice-window-longest-books": [
    " title                  | pages\n------------------------+-------\n Война и мир            | 1300\n Хроники заводной птицы | 896\n(2 строки)",
    " title              | pages\n--------------------+-------\n Мастер и Маргарита | 480\n 1984               | 328\n(2 строки)",
  ],
  "sql-practice-window-median-price": [
    " median_price\n--------------\n 720\n(1 строка)",
    " median_price\n--------------\n 480\n(1 строка)",
  ],
  "sql-practice-window-median-salary": [
    " department | median_salary\n------------+---------------\n Маркетинг  | 167500\n Поддержка  | 71000\n Продажи    | 115000\n Разработка | 197500\n(4 строки)",
    " department | median_salary\n------------+---------------\n Логистика  | 65000\n Продажи    | 94000\n Разработка | 230000\n Финансы    | 140000\n(4 строки)",
  ],
  "sql-practice-window-month-change": [
    " product | month      | revenue | change\n---------+------------+---------+--------\n Ручки   | 2025-10-01 | 80000   | NULL\n Ручки   | 2025-11-01 | 80000   | 0\n Ручки   | 2025-12-01 | 95000   | 15000\n Ручки   | 2026-01-01 | 70000   | -25000\n Ручки   | 2026-02-01 | 90000   | 20000\n Ручки   | 2026-03-01 | 90000   | 0\n Тетради | 2025-10-01 | 120000  | NULL\n Тетради | 2025-11-01 | 135000  | 15000\n Тетради | 2025-12-01 | 150000  | 15000\n Тетради | 2026-01-01 | 140000  | -10000\n Тетради | 2026-02-01 | 160000  | 20000\n Тетради | 2026-03-01 | 175000  | 15000\n(12 строк)",
    " product | month      | revenue | change\n---------+------------+---------+--------\n Маркеры | 2026-04-01 | 30000   | NULL\n Папки   | 2026-02-01 | 50000   | NULL\n Папки   | 2026-03-01 | 50000   | 0\n Папки   | 2026-04-01 | 50000   | 0\n Тетради | 2026-01-01 | 100000  | NULL\n Тетради | 2026-02-01 | 90000   | -10000\n Тетради | 2026-03-01 | 110000  | 20000\n Тетради | 2026-04-01 | 120000  | 10000\n(8 строк)",
  ],
  "sql-practice-window-moving-average": [
    " product | month      | avg_3m\n---------+------------+-----------\n Ручки   | 2025-10-01 | 80000\n Ручки   | 2025-11-01 | 80000\n Ручки   | 2025-12-01 | 85000\n Ручки   | 2026-01-01 | 81666.67\n Ручки   | 2026-02-01 | 85000\n Ручки   | 2026-03-01 | 83333.33\n Тетради | 2025-10-01 | 120000\n Тетради | 2025-11-01 | 127500\n Тетради | 2025-12-01 | 135000\n Тетради | 2026-01-01 | 141666.67\n Тетради | 2026-02-01 | 150000\n Тетради | 2026-03-01 | 158333.33\n(12 строк)",
    " product | month      | avg_3m\n---------+------------+-----------\n Маркеры | 2026-04-01 | 30000\n Папки   | 2026-02-01 | 50000\n Папки   | 2026-03-01 | 50000\n Папки   | 2026-04-01 | 50000\n Тетради | 2026-01-01 | 100000\n Тетради | 2026-02-01 | 95000\n Тетради | 2026-03-01 | 100000\n Тетради | 2026-04-01 | 106666.67\n(8 строк)",
  ],
  "sql-practice-window-payroll-share": [
    " full_name         | department_id | salary | share_percent\n-------------------+---------------+--------+---------------\n Ольга Смирнова    | 1             | 320000 | 38.3\n Игорь Петров      | 1             | 210000 | 25.1\n Мария Козлова     | 1             | 185000 | 22.2\n Денис Орлов       | 1             | 120000 | 14.4\n Анна Волкова      | 2             | 240000 | 71.6\n Сергей Лебедев    | 2             | 95000  | 28.4\n Елена Новикова    | 3             | 260000 | 53.6\n Татьяна Соколова  | 3             | 115000 | 23.7\n Павел Морозов     | 3             | 110000 | 22.7\n Наталья Кузнецова | 4             | 72000  | 50.7\n Алексей Попов     | 4             | 70000  | 49.3\n(11 строк)",
    " full_name         | department_id | salary | share_percent\n-------------------+---------------+--------+---------------\n Кирилл Белов      | 1             | 300000 | 35\n Роман Егоров      | 1             | 230000 | 26.8\n Юлия Фёдорова     | 1             | 230000 | 26.8\n Вера Медведева    | 1             | 98000  | 11.4\n Артём Семёнов     | 2             | 150000 | 53.6\n Светлана Павлова  | 2             | 130000 | 46.4\n Максим Виноградов | 3             | 98000  | 52.1\n Ирина Голубева    | 3             | 90000  | 47.9\n Глеб Воробьёв     | 4             | 65000  | 100\n(9 строк)",
  ],
  "sql-practice-window-running-total": [
    " product | month      | revenue | running_total\n---------+------------+---------+---------------\n Ручки   | 2025-10-01 | 80000   | 80000\n Ручки   | 2025-11-01 | 80000   | 160000\n Ручки   | 2025-12-01 | 95000   | 255000\n Ручки   | 2026-01-01 | 70000   | 325000\n Ручки   | 2026-02-01 | 90000   | 415000\n Ручки   | 2026-03-01 | 90000   | 505000\n Тетради | 2025-10-01 | 120000  | 120000\n Тетради | 2025-11-01 | 135000  | 255000\n Тетради | 2025-12-01 | 150000  | 405000\n Тетради | 2026-01-01 | 140000  | 545000\n Тетради | 2026-02-01 | 160000  | 705000\n Тетради | 2026-03-01 | 175000  | 880000\n(12 строк)",
    " product | month      | revenue | running_total\n---------+------------+---------+---------------\n Маркеры | 2026-04-01 | 30000   | 30000\n Папки   | 2026-02-01 | 50000   | 50000\n Папки   | 2026-03-01 | 50000   | 100000\n Папки   | 2026-04-01 | 50000   | 150000\n Тетради | 2026-01-01 | 100000  | 100000\n Тетради | 2026-02-01 | 90000   | 190000\n Тетради | 2026-03-01 | 110000  | 300000\n Тетради | 2026-04-01 | 120000  | 420000\n(8 строк)",
  ],
  "sql-practice-window-salary-place": [
    " full_name         | department_id | salary | place\n-------------------+---------------+--------+-------\n Ольга Смирнова    | 1             | 320000 | 1\n Игорь Петров      | 1             | 210000 | 2\n Мария Козлова     | 1             | 185000 | 3\n Денис Орлов       | 1             | 120000 | 4\n Анна Волкова      | 2             | 240000 | 1\n Сергей Лебедев    | 2             | 95000  | 2\n Елена Новикова    | 3             | 260000 | 1\n Татьяна Соколова  | 3             | 115000 | 2\n Павел Морозов     | 3             | 110000 | 3\n Наталья Кузнецова | 4             | 72000  | 1\n Алексей Попов     | 4             | 70000  | 2\n(11 строк)",
    " full_name         | department_id | salary | place\n-------------------+---------------+--------+-------\n Кирилл Белов      | 1             | 300000 | 1\n Юлия Фёдорова     | 1             | 230000 | 2\n Роман Егоров      | 1             | 230000 | 3\n Вера Медведева    | 1             | 98000  | 4\n Артём Семёнов     | 2             | 150000 | 1\n Светлана Павлова  | 2             | 130000 | 2\n Максим Виноградов | 3             | 98000  | 1\n Ирина Голубева    | 3             | 90000  | 2\n Глеб Воробьёв     | 4             | 65000  | 1\n(9 строк)",
  ],
  "sql-practice-window-sales-forecast": [
    " product | last_month | forecast\n---------+------------+----------\n Ручки   | 2026-03-01 | 92000\n Тетради | 2026-03-01 | 186000\n(2 строки)",
    " product | last_month | forecast\n---------+------------+-----------\n Папки   | 2026-04-01 | 50000\n Тетради | 2026-04-01 | 126666.67\n(2 строки)",
  ],
  "sql-practice-window-second-order": [
    " full_name      | second_order_at\n----------------+---------------------\n Андрей Кравцов | 2026-02-03 09:05:00\n Вера Тихонова  | 2026-03-08 15:20:00\n(2 строки)",
    " full_name     | second_order_at\n---------------+---------------------\n Алина Зуева   | 2026-02-17 16:30:00\n Тимур Абрамов | 2026-04-11 20:20:00\n Борис Лапин   | 2026-04-30 07:30:00\n(3 строки)",
  ],
  "sql-practice-window-top-months-rank": [
    " product | month      | revenue | place\n---------+------------+---------+-------\n Ручки   | 2025-12-01 | 95000   | 1\n Ручки   | 2026-02-01 | 90000   | 2\n Ручки   | 2026-03-01 | 90000   | 2\n Тетради | 2026-03-01 | 175000  | 1\n Тетради | 2026-02-01 | 160000  | 2\n(5 строк)",
    " product | month      | revenue | place\n---------+------------+---------+-------\n Маркеры | 2026-04-01 | 30000   | 1\n Папки   | 2026-02-01 | 50000   | 1\n Папки   | 2026-03-01 | 50000   | 1\n Папки   | 2026-04-01 | 50000   | 1\n Тетради | 2026-04-01 | 120000  | 1\n Тетради | 2026-03-01 | 110000  | 2\n(6 строк)",
  ],
  "sql-practice-window-top-paid-per-department": [
    " department_id | full_name         | salary\n---------------+-------------------+--------\n 1             | Ольга Смирнова    | 320000\n 2             | Анна Волкова      | 240000\n 3             | Елена Новикова    | 260000\n 4             | Наталья Кузнецова | 72000\n(4 строки)",
    " department_id | full_name         | salary\n---------------+-------------------+--------\n 1             | Кирилл Белов      | 300000\n 2             | Артём Семёнов     | 150000\n 3             | Максим Виноградов | 98000\n 4             | Глеб Воробьёв     | 65000\n(4 строки)",
  ],
  "sql-practice-window-top-quarter-salary": [
    " full_name      | salary\n----------------+--------\n Ольга Смирнова | 320000\n Елена Новикова | 260000\n Анна Волкова   | 240000\n(3 строки)",
    " full_name     | salary\n---------------+--------\n Кирилл Белов  | 300000\n Роман Егоров  | 230000\n Юлия Фёдорова | 230000\n(3 строки)",
  ],
  "sql-select-alias-annual": [
    " full_name         | annual_salary\n-------------------+---------------\n Алексей Попов     | 840000\n Анна Волкова      | 2880000\n Виктор Зайцев     | 540000\n Денис Орлов       | 1440000\n Елена Новикова    | 3120000\n Игорь Петров      | 2520000\n Мария Козлова     | 2220000\n Наталья Кузнецова | 864000\n Ольга Смирнова    | 3840000\n Павел Морозов     | 1320000\n Сергей Лебедев    | 1140000\n Татьяна Соколова  | 1380000\n(12 строк)",
    " full_name         | annual_salary\n-------------------+---------------\n Артём Семёнов     | 1800000\n Вера Медведева    | 1176000\n Глеб Воробьёв     | 780000\n Ирина Голубева    | 1080000\n Кирилл Белов      | 3600000\n Ксения Богданова  | 480000\n Максим Виноградов | 1176000\n Роман Егоров      | 2760000\n Светлана Павлова  | 1560000\n Юлия Фёдорова     | 2760000\n(10 строк)",
  ],
  "sql-select-alias-constant-column": [
    " title                     | currency | price\n---------------------------+----------+--------\n Беспроводные наушники     | RUB      | 7490\n Зарядное устройство 65 Вт | RUB      | 2490\n Мышь беспроводная         | RUB      | 1590\n Ноутбук Air 13            | RUB      | 89990\n Ноутбук Pro 16            | RUB      | 189990\n Подставка для ноутбука    | RUB      | 3290\n Смартфон Lite             | RUB      | 19990\n Смартфон Max              | RUB      | 74990\n Смартфон Mini             | RUB      | 39990\n Чехол для смартфона       | RUB      | 990\n(10 строк)",
    " title                   | currency | price\n-------------------------+----------+-------\n Геймпад                 | RUB      | 5990\n Игровая приставка       | RUB      | 49990\n Кабель USB-C            | RUB      | 590\n Клавиатура механическая | RUB      | 8990\n Ноутбук Office 14       | RUB      | 54990\n Планшет Tab 11          | RUB      | 32990\n Планшет Tab Mini        | RUB      | 24990\n Сумка для ноутбука      | RUB      | 2990\n(8 строк)",
  ],
  "sql-select-alias-employee-salary": [
    " employee          | monthly_salary\n-------------------+----------------\n Алексей Попов     | 70000\n Анна Волкова      | 240000\n Виктор Зайцев     | 45000\n Денис Орлов       | 120000\n Елена Новикова    | 260000\n Игорь Петров      | 210000\n Мария Козлова     | 185000\n Наталья Кузнецова | 72000\n Ольга Смирнова    | 320000\n Павел Морозов     | 110000\n Сергей Лебедев    | 95000\n Татьяна Соколова  | 115000\n(12 строк)",
    " employee          | monthly_salary\n-------------------+----------------\n Артём Семёнов     | 150000\n Вера Медведева    | 98000\n Глеб Воробьёв     | 65000\n Ирина Голубева    | 90000\n Кирилл Белов      | 300000\n Ксения Богданова  | 40000\n Максим Виноградов | 98000\n Роман Егоров      | 230000\n Светлана Павлова  | 130000\n Юлия Фёдорова     | 230000\n(10 строк)",
  ],
  "sql-select-alias-order-by-alias": [
    " full_name         | annual_salary\n-------------------+---------------\n Ольга Смирнова    | 3840000\n Елена Новикова    | 3120000\n Анна Волкова      | 2880000\n Игорь Петров      | 2520000\n Мария Козлова     | 2220000\n Денис Орлов       | 1440000\n Татьяна Соколова  | 1380000\n Павел Морозов     | 1320000\n Сергей Лебедев    | 1140000\n Наталья Кузнецова | 864000\n Алексей Попов     | 840000\n Виктор Зайцев     | 540000\n(12 строк)",
    " full_name         | annual_salary\n-------------------+---------------\n Кирилл Белов      | 3600000\n Юлия Фёдорова     | 2760000\n Роман Егоров      | 2760000\n Артём Семёнов     | 1800000\n Светлана Павлова  | 1560000\n Максим Виноградов | 1176000\n Вера Медведева    | 1176000\n Ирина Голубева    | 1080000\n Глеб Воробьёв     | 780000\n Ксения Богданова  | 480000\n(10 строк)",
  ],
  "sql-select-alias-price-with-tax": [
    " title                    | price_with_tax\n--------------------------+----------------\n Анна Каренина            | 1188\n Бедные люди              | 468\n Война и мир              | 1548\n Гордость и предубеждение | 708\n Идиот                    | 900\n Норвежский лес           | 864\n Преступление и наказание | 828\n Слово о полку Игореве    | 420\n Сто лет одиночества      | 1068\n Хроники заводной птицы   | NULL\n(10 строк)",
    " title                            | price_with_tax\n----------------------------------+----------------\n 1984                             | 780\n Вишнёвый сад                     | 336\n И никого не стало                | 648\n Мастер и Маргарита               | 948\n Палата номер 6                   | 384\n Повесть временных лет            | 492\n Скотный двор                     | NULL\n Собачье сердце                   | 504\n Убийство в «Восточном экспрессе» | 648\n(9 строк)",
  ],
  "sql-select-alias-quoted": [
    " Название отдела | Город\n-----------------+-----------------\n Аналитика       | NULL\n Маркетинг       | Санкт-Петербург\n Поддержка       | Казань\n Продажи         | Москва\n Разработка      | Москва\n(5 строк)",
    " Название отдела | Город\n-----------------+--------------\n Безопасность    | Казань\n Логистика       | NULL\n Продажи         | Екатеринбург\n Разработка      | Новосибирск\n Финансы         | Москва\n Юридический     | Москва\n(6 строк)",
  ],
  "sql-select-alias-stock-value": [
    " title                     | price  | stock | stock_value\n---------------------------+--------+-------+-------------\n Ноутбук Air 13            | 89990  | 7     | 629930\n Смартфон Lite             | 19990  | 25    | 499750\n Ноутбук Pro 16            | 189990 | 2     | 379980\n Смартфон Mini             | 39990  | 9     | 359910\n Беспроводные наушники     | 7490   | 34    | 254660\n Зарядное устройство 65 Вт | 2490   | 58    | 144420\n Чехол для смартфона       | 990    | 120   | 118800\n Подставка для ноутбука    | 3290   | 11    | 36190\n Смартфон Max              | 74990  | 0     | 0\n Мышь беспроводная         | 1590   | 0     | 0\n(10 строк)",
    " title                   | price | stock | stock_value\n-------------------------+-------+-------+-------------\n Ноутбук Office 14       | 54990 | 12    | 659880\n Игровая приставка       | 49990 | 4     | 199960\n Кабель USB-C            | 590   | 300   | 177000\n Планшет Tab Mini        | 24990 | 6     | 149940\n Клавиатура механическая | 8990  | 15    | 134850\n Сумка для ноутбука      | 2990  | 18    | 53820\n Планшет Tab 11          | 32990 | 0     | 0\n Геймпад                 | 5990  | 0     | 0\n(8 строк)",
  ],
  "sql-select-all-departments": [
    " id | name       | city            | budget\n----+------------+-----------------+---------\n 1  | Разработка | Москва          | 1200000\n 2  | Маркетинг  | Санкт-Петербург | 450000\n 3  | Продажи    | Москва          | 800000\n 4  | Поддержка  | Казань          | 300000\n 5  | Аналитика  | NULL            | 500000\n(5 строк)",
    " id | name         | city         | budget\n----+--------------+--------------+--------\n 1  | Разработка   | Новосибирск  | 900000\n 2  | Финансы      | Москва       | 650000\n 3  | Продажи      | Екатеринбург | 400000\n 4  | Логистика    | NULL         | 250000\n 6  | Юридический  | Москва       | NULL\n 7  | Безопасность | Казань       | 150000\n(6 строк)",
  ],
  "sql-select-books-columns": [
    " published_year | title                    | genre\n----------------+--------------------------+---------\n 1800           | Слово о полку Игореве    | поэма\n 1813           | Гордость и предубеждение | роман\n 1846           | Бедные люди              | повесть\n 1866           | Преступление и наказание | роман\n 1869           | Война и мир              | роман\n 1869           | Идиот                    | роман\n 1878           | Анна Каренина            | роман\n 1967           | Сто лет одиночества      | роман\n 1987           | Норвежский лес           | роман\n 1995           | Хроники заводной птицы   | роман\n(10 строк)",
    " published_year | title                            | genre\n----------------+----------------------------------+----------\n 1767           | Повесть временных лет            | летопись\n 1892           | Палата номер 6                   | повесть\n 1904           | Вишнёвый сад                     | пьеса\n 1934           | Убийство в «Восточном экспрессе» | детектив\n 1939           | И никого не стало                | детектив\n 1945           | Скотный двор                     | повесть\n 1949           | 1984                             | роман\n 1967           | Мастер и Маргарита               | роман\n 1987           | Собачье сердце                   | повесть\n(9 строк)",
  ],
  "sql-select-customers-contacts": [
    " full_name      | email               | city\n----------------+---------------------+-------------\n Андрей Кравцов | andrey@mail.example | Москва\n Вера Тихонова  | vera@mail.example   | Казань\n Дарья Ершова   | darya@mail.example  | Новосибирск\n Лев Комаров    | lev@mail.example    | NULL\n Олег Савин     | NULL                | Москва\n Полина Гусева  | polina@mail.example | Казань\n(6 строк)",
    " full_name      | email              | city\n----------------+--------------------+--------\n Алина Зуева    | NULL               | Москва\n Борис Лапин    | boris@mail.example | Самара\n Ева Миронова   | eva@mail.example   | NULL\n Тимур Абрамов  | timur@mail.example | Самара\n Яна Кудрявцева | yana@mail.example  | Пермь\n(5 строк)",
  ],
  "sql-select-distinct-cities": [
    " city\n-----------------\n NULL\n Казань\n Москва\n Санкт-Петербург\n(4 строки)",
    " city\n--------------\n NULL\n Екатеринбург\n Казань\n Москва\n Новосибирск\n(5 строк)",
  ],
  "sql-select-distinct-customer-cities": [
    " city\n-------------\n Казань\n Москва\n Новосибирск\n NULL\n(4 строки)",
    " city\n--------\n Москва\n Пермь\n Самара\n NULL\n(4 строки)",
  ],
  "sql-select-distinct-genres-sorted": [
    " genre\n---------\n повесть\n поэма\n роман\n(3 строки)",
    " genre\n----------\n детектив\n летопись\n повесть\n пьеса\n роман\n(5 строк)",
  ],
  "sql-select-distinct-on-top-paid": [
    " department_id | full_name         | salary\n---------------+-------------------+--------\n 1             | Ольга Смирнова    | 320000\n 2             | Анна Волкова      | 240000\n 3             | Елена Новикова    | 260000\n 4             | Наталья Кузнецова | 72000\n NULL          | Виктор Зайцев     | 45000\n(5 строк)",
    " department_id | full_name         | salary\n---------------+-------------------+--------\n 1             | Кирилл Белов      | 300000\n 2             | Артём Семёнов     | 150000\n 3             | Максим Виноградов | 98000\n 4             | Глеб Воробьёв     | 65000\n NULL          | Ксения Богданова  | 40000\n(5 строк)",
  ],
  "sql-select-distinct-pairs": [
    " department_id | position\n---------------+-------------------------\n 1             | Бэкенд-разработчик\n 1             | Руководитель разработки\n 1             | Тестировщик\n 1             | Фронтенд-разработчик\n 2             | SMM-менеджер\n 2             | Руководитель маркетинга\n 3             | Менеджер по продажам\n 3             | Руководитель продаж\n 4             | Специалист поддержки\n NULL          | Стажёр\n(10 строк)",
    " department_id | position\n---------------+-------------------------\n 1             | Бэкенд-разработчик\n 1             | Руководитель разработки\n 1             | Тестировщик\n 2             | Бухгалтер\n 2             | Финансовый аналитик\n 3             | Менеджер по продажам\n 4             | Кладовщик\n NULL          | Стажёр\n(8 строк)",
  ],
  "sql-select-distinct-positions": [
    " position\n-------------------------\n SMM-менеджер\n Бэкенд-разработчик\n Менеджер по продажам\n Руководитель маркетинга\n Руководитель продаж\n Руководитель разработки\n Специалист поддержки\n Стажёр\n Тестировщик\n Фронтенд-разработчик\n(10 строк)",
    " position\n-------------------------\n Бухгалтер\n Бэкенд-разработчик\n Кладовщик\n Менеджер по продажам\n Руководитель разработки\n Стажёр\n Тестировщик\n Финансовый аналитик\n(8 строк)",
  ],
  "sql-select-limit-cheapest": [
    " title               | price\n---------------------+-------\n Чехол для смартфона | 990\n(1 строка)",
    " title        | price\n--------------+-------\n Кабель USB-C | 590\n(1 строка)",
  ],
  "sql-select-limit-latest-hires": [
    " full_name         | hire_date\n-------------------+------------\n Виктор Зайцев     | 2025-09-01\n Наталья Кузнецова | 2024-06-03\n Сергей Лебедев    | 2023-02-20\n Денис Орлов       | 2022-07-11\n(4 строки)",
    " full_name         | hire_date\n-------------------+------------\n Ксения Богданова  | 2026-02-02\n Вера Медведева    | 2025-05-19\n Максим Виноградов | 2024-03-04\n Артём Семёнов     | 2023-10-09\n(4 строки)",
  ],
  "sql-select-limit-page-books": [
    " title                 | pages\n-----------------------+-------\n Бедные люди           | 160\n Слово о полку Игореве | 96\n(2 строки)",
    " title          | pages\n----------------+-------\n Палата номер 6 | 96\n(1 строка)",
  ],
  "sql-select-limit-page-products": [
    " title                  | price\n------------------------+--------\n Ноутбук Air 13         | 89990\n Ноутбук Pro 16         | 189990\n Подставка для ноутбука | 3290\n(3 строки)",
    " title                   | price\n-------------------------+-------\n Клавиатура механическая | 8990\n Ноутбук Office 14       | 54990\n Планшет Tab 11          | 32990\n(3 строки)",
  ],
  "sql-select-limit-priciest-book": [
    " title       | price\n-------------+-------\n Война и мир | 1290\n(1 строка)",
    " title              | price\n--------------------+-------\n Мастер и Маргарита | 790\n(1 строка)",
  ],
  "sql-select-limit-second-salary": [
    " full_name      | salary\n----------------+--------\n Елена Новикова | 260000\n(1 строка)",
    " full_name     | salary\n---------------+--------\n Юлия Фёдорова | 230000\n(1 строка)",
  ],
  "sql-select-limit-skip-recent": [
    " id | ordered_at\n----+---------------------\n 6  | 2026-03-08 15:20:00\n 5  | 2026-03-01 12:00:00\n 4  | 2026-02-14 21:30:00\n 3  | 2026-02-03 09:05:00\n 2  | 2026-01-20 18:40:00\n 1  | 2026-01-12 10:15:00\n(6 строк)",
    " id | ordered_at\n----+---------------------\n 5  | 2026-03-22 10:05:00\n 4  | 2026-02-17 16:30:00\n 3  | 2026-02-17 14:00:00\n 2  | 2026-01-05 11:11:00\n 1  | 2025-12-30 23:50:00\n(5 строк)",
  ],
  "sql-select-limit-top-salaries": [
    " full_name      | salary\n----------------+--------\n Ольга Смирнова | 320000\n Елена Новикова | 260000\n Анна Волкова   | 240000\n(3 строки)",
    " full_name     | salary\n---------------+--------\n Кирилл Белов  | 300000\n Юлия Фёдорова | 230000\n Роман Егоров  | 230000\n(3 строки)",
  ],
  "sql-select-names-salaries": [
    " full_name         | salary\n-------------------+--------\n Алексей Попов     | 70000\n Анна Волкова      | 240000\n Виктор Зайцев     | 45000\n Денис Орлов       | 120000\n Елена Новикова    | 260000\n Игорь Петров      | 210000\n Мария Козлова     | 185000\n Наталья Кузнецова | 72000\n Ольга Смирнова    | 320000\n Павел Морозов     | 110000\n Сергей Лебедев    | 95000\n Татьяна Соколова  | 115000\n(12 строк)",
    " full_name         | salary\n-------------------+--------\n Артём Семёнов     | 150000\n Вера Медведева    | 98000\n Глеб Воробьёв     | 65000\n Ирина Голубева    | 90000\n Кирилл Белов      | 300000\n Ксения Богданова  | 40000\n Максим Виноградов | 98000\n Роман Егоров      | 230000\n Светлана Павлова  | 130000\n Юлия Фёдорова     | 230000\n(10 строк)",
  ],
  "sql-select-order-by-expression": [
    " order_id | product_id | line_total\n----------+------------+------------\n 3        | 2          | 189990\n 1        | 1          | 89990\n 8        | 1          | 89990\n 4        | 4          | 74990\n 7        | 10         | 39990\n 2        | 3          | 19990\n 5        | 6          | 14980\n 2        | 6          | 7490\n 4        | 7          | 4980\n 6        | 5          | 2970\n 8        | 7          | 2490\n 1        | 5          | 1980\n 6        | 8          | 1590\n(13 строк)",
    " order_id | product_id | line_total\n----------+------------+------------\n 1        | 1          | 54990\n 7        | 1          | 52990\n 2        | 6          | 49990\n 4        | 2          | 32990\n 3        | 3          | 24990\n 2        | 7          | 11980\n 5        | 5          | 8990\n 7        | 7          | 5990\n 6        | 8          | 2990\n 1        | 4          | 1770\n 5        | 4          | 1180\n(11 строк)",
  ],
  "sql-select-order-by-nulls-first": [
    " name       | city\n------------+-----------------\n Аналитика  | NULL\n Поддержка  | Казань\n Разработка | Москва\n Продажи    | Москва\n Маркетинг  | Санкт-Петербург\n(5 строк)",
    " name         | city\n--------------+--------------\n Логистика    | NULL\n Продажи      | Екатеринбург\n Безопасность | Казань\n Финансы      | Москва\n Юридический  | Москва\n Разработка   | Новосибирск\n(6 строк)",
  ],
  "sql-select-order-by-nulls-last": [
    " title                    | price\n--------------------------+-------\n Война и мир              | 1290\n Анна Каренина            | 990\n Сто лет одиночества      | 890\n Идиот                    | 750\n Норвежский лес           | 720\n Преступление и наказание | 690\n Гордость и предубеждение | 590\n Бедные люди              | 390\n Слово о полку Игореве    | 350\n Хроники заводной птицы   | NULL\n(10 строк)",
    " title                            | price\n----------------------------------+-------\n Мастер и Маргарита               | 790\n 1984                             | 650\n Убийство в «Восточном экспрессе» | 540\n И никого не стало                | 540\n Собачье сердце                   | 420\n Повесть временных лет            | 410\n Палата номер 6                   | 320\n Вишнёвый сад                     | 280\n Скотный двор                     | NULL\n(9 строк)",
  ],
  "sql-select-order-by-salary-desc": [
    " full_name         | salary\n-------------------+--------\n Ольга Смирнова    | 320000\n Елена Новикова    | 260000\n Анна Волкова      | 240000\n Игорь Петров      | 210000\n Мария Козлова     | 185000\n Денис Орлов       | 120000\n Татьяна Соколова  | 115000\n Павел Морозов     | 110000\n Сергей Лебедев    | 95000\n Наталья Кузнецова | 72000\n Алексей Попов     | 70000\n Виктор Зайцев     | 45000\n(12 строк)",
    " full_name         | salary\n-------------------+--------\n Кирилл Белов      | 300000\n Юлия Фёдорова     | 230000\n Роман Егоров      | 230000\n Артём Семёнов     | 150000\n Светлана Павлова  | 130000\n Максим Виноградов | 98000\n Вера Медведева    | 98000\n Ирина Голубева    | 90000\n Глеб Воробьёв     | 65000\n Ксения Богданова  | 40000\n(10 строк)",
  ],
  "sql-select-order-by-status-date": [
    " id | status    | ordered_at\n----+-----------+---------------------\n 3  | cancelled | 2026-02-03 09:05:00\n 8  | new       | 2026-04-02 19:10:00\n 5  | new       | 2026-03-01 12:00:00\n 7  | paid      | 2026-03-15 08:45:00\n 2  | paid      | 2026-01-20 18:40:00\n 6  | shipped   | 2026-03-08 15:20:00\n 4  | shipped   | 2026-02-14 21:30:00\n 1  | shipped   | 2026-01-12 10:15:00\n(8 строк)",
    " id | status    | ordered_at\n----+-----------+---------------------\n 4  | cancelled | 2026-02-17 16:30:00\n 6  | new       | 2026-04-11 20:20:00\n 7  | paid      | 2026-04-30 07:30:00\n 3  | paid      | 2026-02-17 14:00:00\n 5  | shipped   | 2026-03-22 10:05:00\n 2  | shipped   | 2026-01-05 11:11:00\n 1  | shipped   | 2025-12-30 23:50:00\n(7 строк)",
  ],
  "sql-select-order-by-title": [
    " title                    | published_year\n--------------------------+----------------\n Анна Каренина            | 1878\n Бедные люди              | 1846\n Война и мир              | 1869\n Гордость и предубеждение | 1813\n Идиот                    | 1869\n Норвежский лес           | 1987\n Преступление и наказание | 1866\n Слово о полку Игореве    | 1800\n Сто лет одиночества      | 1967\n Хроники заводной птицы   | 1995\n(10 строк)",
    " title                            | published_year\n----------------------------------+----------------\n 1984                             | 1949\n Вишнёвый сад                     | 1904\n И никого не стало                | 1939\n Мастер и Маргарита               | 1967\n Палата номер 6                   | 1892\n Повесть временных лет            | 1767\n Скотный двор                     | 1945\n Собачье сердце                   | 1987\n Убийство в «Восточном экспрессе» | 1934\n(9 строк)",
  ],
  "sql-select-order-by-two-keys": [
    " department_id | full_name         | salary\n---------------+-------------------+--------\n 1             | Ольга Смирнова    | 320000\n 1             | Игорь Петров      | 210000\n 1             | Мария Козлова     | 185000\n 1             | Денис Орлов       | 120000\n 2             | Анна Волкова      | 240000\n 2             | Сергей Лебедев    | 95000\n 3             | Елена Новикова    | 260000\n 3             | Татьяна Соколова  | 115000\n 3             | Павел Морозов     | 110000\n 4             | Наталья Кузнецова | 72000\n 4             | Алексей Попов     | 70000\n NULL          | Виктор Зайцев     | 45000\n(12 строк)",
    " department_id | full_name         | salary\n---------------+-------------------+--------\n 1             | Кирилл Белов      | 300000\n 1             | Юлия Фёдорова     | 230000\n 1             | Роман Егоров      | 230000\n 1             | Вера Медведева    | 98000\n 2             | Артём Семёнов     | 150000\n 2             | Светлана Павлова  | 130000\n 3             | Максим Виноградов | 98000\n 3             | Ирина Голубева    | 90000\n 4             | Глеб Воробьёв     | 65000\n NULL          | Ксения Богданова  | 40000\n(10 строк)",
  ],
  "sql-select-order-by-youngest": [
    " full_name         | birth_date\n-------------------+------------\n Виктор Зайцев     | 2004-02-28\n Наталья Кузнецова | 2001-05-19\n Сергей Лебедев    | 2000-01-09\n Денис Орлов       | 1999-08-30\n Алексей Попов     | 1998-10-02\n Татьяна Соколова  | 1997-03-14\n Мария Козлова     | 1996-11-21\n Павел Морозов     | 1994-07-07\n Игорь Петров      | 1991-02-03\n Анна Волкова      | 1988-04-17\n Ольга Смирнова    | 1985-06-12\n Елена Новикова    | 1983-12-25\n(12 строк)",
    " full_name         | birth_date\n-------------------+------------\n Ксения Богданова  | 2005-01-20\n Максим Виноградов | 2002-11-11\n Вера Медведева    | 2001-09-27\n Ирина Голубева    | 2000-06-30\n Артём Семёнов     | 1999-03-03\n Роман Егоров      | 1995-12-04\n Юлия Фёдорова     | 1993-05-15\n Светлана Павлова  | 1987-07-22\n Кирилл Белов      | 1982-09-01\n Глеб Воробьёв     | 1979-08-08\n(10 строк)",
  ],
  "sql-strings-avg-title-length": [
    " avg_length\n------------\n 17\n(1 строка)",
    " avg_length\n------------\n 15.5\n(1 строка)",
  ],
  "sql-strings-chars-bytes": [
    " id | chars | bytes\n----+-------+-------\n 1  | 11    | 20\n 2  | 13    | 25\n 3  | 24    | 46\n 4  | 5     | 10\n 5  | 24    | 46\n 6  | 19    | 36\n 7  | 14    | 27\n 8  | 22    | 42\n 9  | 21    | 39\n 10 | 11    | 21\n(10 строк)",
    " id | chars | bytes\n----+-------+-------\n 1  | 14    | 25\n 2  | 12    | 23\n 3  | 18    | 34\n 4  | 14    | 27\n 5  | 4     | 4\n 6  | 12    | 23\n 7  | 32    | 61\n 8  | 17    | 31\n 9  | 21    | 40\n(9 строк)",
  ],
  "sql-strings-clean-contacts": [
    " id | name_clean    | city_clean\n----+---------------+-----------------\n 1  | Анна Белова   | Москва\n 2  | Борис  Громов | Казань\n 3  | Вера Сорокина | Санкт-Петербург\n 4  | Глеб Дроздов  | Москва\n 5  | Дарья Ежова   | Казань\n 6  | Егор Жуков    | NULL\n(6 строк)",
    " id | name_clean     | city_clean\n----+----------------+-----------------\n 1  | Жанна Зайцева  | Екатеринбург\n 2  | Иван  Карпов   | Нижний Новгород\n 3  | Людмила Орлова | Самара\n 4  | Максим Пирогов | NULL\n 5  | Нина Рогова    | Самара\n(5 строк)",
  ],
  "sql-strings-collapse-spaces": [
    " id | name_clean\n----+---------------\n 1  | Анна Белова\n 2  | Борис Громов\n 3  | ВЕРА СОРОКИНА\n 4  | Глеб Дроздов\n 5  | Дарья Ежова\n 6  | Егор Жуков\n(6 строк)",
    " id | name_clean\n----+----------------\n 1  | Жанна Зайцева\n 2  | Иван Карпов\n 3  | ЛЮДМИЛА ОРЛОВА\n 4  | Максим Пирогов\n 5  | Нина Рогова\n(5 строк)",
  ],
  "sql-strings-count-letter": [
    " id | title                    | o_count\n----+--------------------------+---------\n 1  | Война и мир              | 1\n 10 | Бедные люди              | 0\n 2  | Анна Каренина            | 0\n 3  | Преступление и наказание | 0\n 4  | Идиот                    | 1\n 5  | Гордость и предубеждение | 2\n 6  | Сто лет одиночества      | 3\n 7  | Норвежский лес           | 1\n 8  | Хроники заводной птицы   | 3\n 9  | Слово о полку Игореве    | 5\n(10 строк)",
    " id | title                            | o_count\n----+----------------------------------+---------\n 1  | Палата номер 6                   | 1\n 2  | Вишнёвый сад                     | 0\n 3  | Мастер и Маргарита               | 0\n 4  | Собачье сердце                   | 1\n 5  | 1984                             | 0\n 6  | Скотный двор                     | 2\n 7  | Убийство в «Восточном экспрессе» | 4\n 8  | И никого не стало                | 3\n 9  | Повесть временных лет            | 1\n(9 строк)",
  ],
  "sql-strings-customer-card": [
    " id | card\n----+-----------------------------------------------\n 1  | Андрей Кравцов, Москва, andrey@mail.example\n 2  | Вера Тихонова, Казань, vera@mail.example\n 3  | Олег Савин, Москва\n 4  | Дарья Ершова, Новосибирск, darya@mail.example\n 5  | Лев Комаров, lev@mail.example\n 6  | Полина Гусева, Казань, polina@mail.example\n(6 строк)",
    " id | card\n----+-------------------------------------------\n 1  | Тимур Абрамов, Самара, timur@mail.example\n 2  | Алина Зуева, Москва\n 3  | Борис Лапин, Самара, boris@mail.example\n 4  | Ева Миронова, eva@mail.example\n 5  | Яна Кудрявцева, Пермь, yana@mail.example\n(5 строк)",
  ],
  "sql-strings-customer-city-label": [
    " id | label\n----+-------------------------------\n 1  | Андрей Кравцов (Москва)\n 2  | Вера Тихонова (Казань)\n 3  | Олег Савин (Москва)\n 4  | Дарья Ершова (Новосибирск)\n 5  | Лев Комаров (город не указан)\n 6  | Полина Гусева (Казань)\n(6 строк)",
    " id | label\n----+--------------------------------\n 1  | Тимур Абрамов (Самара)\n 2  | Алина Зуева (Москва)\n 3  | Борис Лапин (Самара)\n 4  | Ева Миронова (город не указан)\n 5  | Яна Кудрявцева (Пермь)\n(5 строк)",
  ],
  "sql-strings-dirty-city": [
    " id | city\n----+--------------------\n 3  | ' Санкт-Петербург'\n 5  | 'казань '\n(2 строки)",
    " id | city\n----+---------------------\n 2  | ' нижний новгород '\n(1 строка)",
  ],
  "sql-strings-discount": [
    " id | discount\n----+----------\n 1  | 15\n 2  | 10\n(2 строки)",
    " id | discount\n----+----------\n 1  | 30\n(1 строка)",
  ],
  "sql-strings-dotted-line": [
    " id | line\n----+------------------------------------\n 1  | Ноутбук Air 13..............89990\n 10 | Смартфон Mini...............39990\n 2  | Ноутбук Pro 16..............189990\n 3  | Смартфон Lite...............19990\n 4  | Смартфон Max................74990\n 5  | Чехол для смартфона.........990\n 6  | Беспроводные наушники.......7490\n 7  | Зарядное устройство 65 Вт...2490\n 8  | Мышь беспроводная...........1590\n 9  | Подставка для ноутбука......3290\n(10 строк)",
    " id | line\n----+-----------------------------------\n 1  | Ноутбук Office 14...........54990\n 2  | Планшет Tab 11..............32990\n 3  | Планшет Tab Mini............24990\n 4  | Кабель USB-C................590\n 5  | Клавиатура механическая.....8990\n 6  | Игровая приставка...........49990\n 7  | Геймпад.....................5990\n 8  | Сумка для ноутбука..........2990\n(8 строк)",
  ],
  "sql-strings-email-domain": [
    " id | domain\n----+--------------\n 1  | mail.example\n 2  | mail.example\n 4  | mail.example\n 5  | mail.example\n 6  | mail.example\n(5 строк)",
    " id | domain\n----+--------------\n 1  | mail.example\n 3  | mail.example\n 4  | mail.example\n 5  | mail.example\n(4 строки)",
  ],
  "sql-strings-email-login": [
    " id | login\n----+---------\n 1  | olga\n 10 | alexey\n 11 | natalia\n 2  | igor\n 3  | maria\n 5  | anna\n 6  | sergey\n 7  | elena\n 9  | tatiana\n(9 строк)",
    " id | login\n----+----------\n 1  | kirill\n 10 | vera\n 3  | roman\n 4  | svetlana\n 5  | artem\n 6  | irina\n 8  | ksenia\n(7 строк)",
  ],
  "sql-strings-email-not-lower": [
    " id | email\n----+--------------------------\n 1  | Anna.Belova@Mail.Example\n 3  | VERA@CORP.EXAMPLE\n(2 строки)",
    " id | email\n----+---------------------\n 1  | zhanna@Mail.example\n 3  | LUDA@CORP.EXAMPLE\n(2 строки)",
  ],
  "sql-strings-employee-code": [
    " id | code\n----+-----------\n 1  | EMP-00001\n 10 | EMP-00010\n 11 | EMP-00011\n 12 | EMP-00012\n 2  | EMP-00002\n 3  | EMP-00003\n 4  | EMP-00004\n 5  | EMP-00005\n 6  | EMP-00006\n 7  | EMP-00007\n 8  | EMP-00008\n 9  | EMP-00009\n(12 строк)",
    " id | code\n----+-----------\n 1  | EMP-00001\n 10 | EMP-00010\n 2  | EMP-00002\n 3  | EMP-00003\n 4  | EMP-00004\n 5  | EMP-00005\n 6  | EMP-00006\n 7  | EMP-00007\n 8  | EMP-00008\n 9  | EMP-00009\n(10 строк)",
  ],
  "sql-strings-employee-label": [
    " id | label\n----+------------------------------------------\n 1  | Ольга Смирнова - Руководитель разработки\n 10 | Алексей Попов - Специалист поддержки\n 11 | Наталья Кузнецова - Специалист поддержки\n 12 | Виктор Зайцев - Стажёр\n 2  | Игорь Петров - Бэкенд-разработчик\n 3  | Мария Козлова - Фронтенд-разработчик\n 4  | Денис Орлов - Тестировщик\n 5  | Анна Волкова - Руководитель маркетинга\n 6  | Сергей Лебедев - SMM-менеджер\n 7  | Елена Новикова - Руководитель продаж\n 8  | Павел Морозов - Менеджер по продажам\n 9  | Татьяна Соколова - Менеджер по продажам\n(12 строк)",
    " id | label\n----+------------------------------------------\n 1  | Кирилл Белов - Руководитель разработки\n 10 | Вера Медведева - Тестировщик\n 2  | Юлия Фёдорова - Бэкенд-разработчик\n 3  | Роман Егоров - Бэкенд-разработчик\n 4  | Светлана Павлова - Бухгалтер\n 5  | Артём Семёнов - Финансовый аналитик\n 6  | Ирина Голубева - Менеджер по продажам\n 7  | Максим Виноградов - Менеджер по продажам\n 8  | Ксения Богданова - Стажёр\n 9  | Глеб Воробьёв - Кладовщик\n(10 строк)",
  ],
  "sql-strings-first-name": [
    " id | first_name\n----+------------\n 1  | Ольга\n 10 | Алексей\n 11 | Наталья\n 12 | Виктор\n 2  | Игорь\n 3  | Мария\n 4  | Денис\n 5  | Анна\n 6  | Сергей\n 7  | Елена\n 8  | Павел\n 9  | Татьяна\n(12 строк)",
    " id | first_name\n----+------------\n 1  | Кирилл\n 10 | Вера\n 2  | Юлия\n 3  | Роман\n 4  | Светлана\n 5  | Артём\n 6  | Ирина\n 7  | Максим\n 8  | Ксения\n 9  | Глеб\n(10 строк)",
  ],
  "sql-strings-first-word-position": [
    " id | position                | first_word\n----+-------------------------+----------------------\n 1  | Руководитель разработки | Руководитель\n 10 | Специалист поддержки    | Специалист\n 11 | Специалист поддержки    | Специалист\n 12 | Стажёр                  | Стажёр\n 2  | Бэкенд-разработчик      | Бэкенд-разработчик\n 3  | Фронтенд-разработчик    | Фронтенд-разработчик\n 4  | Тестировщик             | Тестировщик\n 5  | Руководитель маркетинга | Руководитель\n 6  | SMM-менеджер            | SMM-менеджер\n 7  | Руководитель продаж     | Руководитель\n 8  | Менеджер по продажам    | Менеджер\n 9  | Менеджер по продажам    | Менеджер\n(12 строк)",
    " id | position                | first_word\n----+-------------------------+--------------------\n 1  | Руководитель разработки | Руководитель\n 10 | Тестировщик             | Тестировщик\n 2  | Бэкенд-разработчик      | Бэкенд-разработчик\n 3  | Бэкенд-разработчик      | Бэкенд-разработчик\n 4  | Бухгалтер               | Бухгалтер\n 5  | Финансовый аналитик     | Финансовый\n 6  | Менеджер по продажам    | Менеджер\n 7  | Менеджер по продажам    | Менеджер\n 8  | Стажёр                  | Стажёр\n 9  | Кладовщик               | Кладовщик\n(10 строк)",
  ],
  "sql-strings-has-tag": [
    " id | title\n----+-------------------------\n 1  | ' Обзор ноутбуков '\n 3  | Как выбрать смартфон!!!\n(2 строки)",
    " id | title\n----+------------------\n 2  | ' Что нового '\n 3  | Гид по зарядкам!\n(2 строки)",
  ],
  "sql-strings-initcap-name": [
    " id | name_proper\n----+------------------\n 1  | '  Анна Белова '\n 2  | Борис  Громов\n 3  | Вера Сорокина\n 4  | Глеб Дроздов\n 5  | Дарья Ежова\n 6  | Егор Жуков\n(6 строк)",
    " id | name_proper\n----+-------------------\n 1  | Жанна Зайцева\n 2  | ' Иван  Карпов  '\n 3  | Людмила Орлова\n 4  | Максим Пирогов\n 5  | Нина Рогова\n(5 строк)",
  ],
  "sql-strings-laptop-inside": [
    " id | title\n----+------------------------\n 9  | Подставка для ноутбука\n(1 строка)",
    " id | title\n----+--------------------\n 8  | Сумка для ноутбука\n(1 строка)",
  ],
  "sql-strings-last-word": [
    " id | last_word\n----+----------------------\n 1  | разработки\n 10 | поддержки\n 11 | поддержки\n 12 | Стажёр\n 2  | Бэкенд-разработчик\n 3  | Фронтенд-разработчик\n 4  | Тестировщик\n 5  | маркетинга\n 6  | SMM-менеджер\n 7  | продаж\n 8  | продажам\n 9  | продажам\n(12 строк)",
    " id | last_word\n----+--------------------\n 1  | разработки\n 10 | Тестировщик\n 2  | Бэкенд-разработчик\n 3  | Бэкенд-разработчик\n 4  | Бухгалтер\n 5  | аналитик\n 6  | продажам\n 7  | продажам\n 8  | Стажёр\n 9  | Кладовщик\n(10 строк)",
  ],
  "sql-strings-long-titles": [
    " id | title                     | title_length\n----+---------------------------+--------------\n 5  | Чехол для смартфона       | 19\n 6  | Беспроводные наушники     | 21\n 7  | Зарядное устройство 65 Вт | 25\n 8  | Мышь беспроводная         | 17\n 9  | Подставка для ноутбука    | 22\n(5 строк)",
    " id | title                   | title_length\n----+-------------------------+--------------\n 1  | Ноутбук Office 14       | 17\n 3  | Планшет Tab Mini        | 16\n 5  | Клавиатура механическая | 23\n 6  | Игровая приставка       | 17\n 8  | Сумка для ноутбука      | 18\n(5 строк)",
  ],
  "sql-strings-mask-email": [
    " id | masked\n----+--------------------\n 1  | an***@mail.example\n 2  | ve***@mail.example\n 4  | da***@mail.example\n 5  | le***@mail.example\n 6  | po***@mail.example\n(5 строк)",
    " id | masked\n----+--------------------\n 1  | ti***@mail.example\n 3  | bo***@mail.example\n 4  | ev***@mail.example\n 5  | ya***@mail.example\n(4 строки)",
  ],
  "sql-strings-name-length": [
    " id | full_name         | name_length\n----+-------------------+-------------\n 11 | Наталья Кузнецова | 17\n 9  | Татьяна Соколова  | 16\n 1  | Ольга Смирнова    | 14\n 6  | Сергей Лебедев    | 14\n 7  | Елена Новикова    | 14\n 3  | Мария Козлова     | 13\n 8  | Павел Морозов     | 13\n 10 | Алексей Попов     | 13\n 12 | Виктор Зайцев     | 13\n 2  | Игорь Петров      | 12\n 5  | Анна Волкова      | 12\n 4  | Денис Орлов       | 11\n(12 строк)",
    " id | full_name         | name_length\n----+-------------------+-------------\n 7  | Максим Виноградов | 17\n 4  | Светлана Павлова  | 16\n 8  | Ксения Богданова  | 16\n 6  | Ирина Голубева    | 14\n 10 | Вера Медведева    | 14\n 2  | Юлия Фёдорова     | 13\n 5  | Артём Семёнов     | 13\n 9  | Глеб Воробьёв     | 13\n 1  | Кирилл Белов      | 12\n 3  | Роман Егоров      | 12\n(10 строк)",
  ],
  "sql-strings-novel-caption": [
    " id | caption\n----+---------------------------------\n 1  | Война и мир (1869)\n 2  | Анна Каренина (1878)\n 3  | Преступление и наказание (1866)\n 4  | Идиот (1869)\n 5  | Гордость и предубеждение (1813)\n 6  | Сто лет одиночества (1967)\n 7  | Норвежский лес (1987)\n 8  | Хроники заводной птицы (1995)\n(8 строк)",
    " id | caption\n----+---------------------------\n 3  | Мастер и Маргарита (1967)\n 5  | 1984 (1949)\n(2 строки)",
  ],
  "sql-strings-one-word-title": [
    " id | title\n----+-------\n 4  | Идиот\n(1 строка)",
    " id | title\n----+-------\n 5  | 1984\n(1 строка)",
  ],
  "sql-strings-phone-digits": [
    " id | digits\n----+-------------\n 1  | 79161234567\n 2  | 89035550102\n 3  | 78127654321\n 4  | 74950001122\n 5  | 89105550303\n 6  | 79169998877\n(6 строк)",
    " id | digits\n----+-------------\n 1  | 73431112233\n 2  | 79054445566\n 3  | 88002000000\n 4  | 73837651212\n 5  | 78463004050\n(5 строк)",
  ],
  "sql-strings-phone-format": [
    " id | phone\n----+--------------------\n 1  | +7 (916) 123-45-67\n 3  | +7 (812) 765-43-21\n 4  | +7 (495) 000-11-22\n 6  | +7 (916) 999-88-77\n(4 строки)",
    " id | phone\n----+--------------------\n 1  | +7 (343) 111-22-33\n 4  | +7 (383) 765-12-12\n 5  | +7 (846) 300-40-50\n(3 строки)",
  ],
  "sql-strings-price-line": [
    " id | line\n----+--------------------------------------\n 1  | Ноутбук Air 13: 89990 руб.\n 10 | Смартфон Mini: 39990 руб.\n 2  | Ноутбук Pro 16: 189990 руб.\n 3  | Смартфон Lite: 19990 руб.\n 4  | Смартфон Max: 74990 руб.\n 5  | Чехол для смартфона: 990 руб.\n 6  | Беспроводные наушники: 7490 руб.\n 7  | Зарядное устройство 65 Вт: 2490 руб.\n 8  | Мышь беспроводная: 1590 руб.\n 9  | Подставка для ноутбука: 3290 руб.\n(10 строк)",
    " id | line\n----+------------------------------------\n 1  | Ноутбук Office 14: 54990 руб.\n 2  | Планшет Tab 11: 32990 руб.\n 3  | Планшет Tab Mini: 24990 руб.\n 4  | Кабель USB-C: 590 руб.\n 5  | Клавиатура механическая: 8990 руб.\n 6  | Игровая приставка: 49990 руб.\n 7  | Геймпад: 5990 руб.\n 8  | Сумка для ноутбука: 2990 руб.\n(8 строк)",
  ],
  "sql-strings-regexp-digits": [
    " id | digits\n----+-------------\n 1  | 79161234567\n 2  | 89035550102\n 3  | 78127654321\n 4  | 74950001122\n 5  | 89105550303\n 6  | 79169998877\n(6 строк)",
    " id | digits\n----+-------------\n 1  | 73431112233\n 2  | 79054445566\n 3  | 88002000000\n 4  | 73837651212\n 5  | 78463004050\n(5 строк)",
  ],
  "sql-strings-rename-product": [
    " id | new_title\n----+---------------------------\n 1  | Ноутбук Air 13\n 10 | Телефон Mini\n 2  | Ноутбук Pro 16\n 3  | Телефон Lite\n 4  | Телефон Max\n 5  | Чехол для смартфона\n 6  | Беспроводные наушники\n 7  | Зарядное устройство 65 Вт\n 8  | Мышь беспроводная\n 9  | Подставка для ноутбука\n(10 строк)",
    " id | new_title\n----+-------------------------\n 1  | Ноутбук Office 14\n 2  | Планшет Tab 11\n 3  | Планшет Tab Mini\n 4  | Кабель USB-C\n 5  | Клавиатура механическая\n 6  | Игровая приставка\n 7  | Геймпад\n 8  | Сумка для ноутбука\n(8 строк)",
  ],
  "sql-strings-salary-bar": [
    " id | full_name         | bar\n----+-------------------+--------\n 1  | Ольга Смирнова    | ******\n 10 | Алексей Попов     | *\n 11 | Наталья Кузнецова | *\n 12 | Виктор Зайцев     | ''\n 2  | Игорь Петров      | ****\n 3  | Мария Козлова     | ***\n 4  | Денис Орлов       | **\n 5  | Анна Волкова      | ****\n 6  | Сергей Лебедев    | *\n 7  | Елена Новикова    | *****\n 8  | Павел Морозов     | **\n 9  | Татьяна Соколова  | **\n(12 строк)",
    " id | full_name         | bar\n----+-------------------+--------\n 1  | Кирилл Белов      | ******\n 10 | Вера Медведева    | *\n 2  | Юлия Фёдорова     | ****\n 3  | Роман Егоров      | ****\n 4  | Светлана Павлова  | **\n 5  | Артём Семёнов     | ***\n 6  | Ирина Голубева    | *\n 7  | Максим Виноградов | *\n 8  | Ксения Богданова  | ''\n 9  | Глеб Воробьёв     | *\n(10 строк)",
  ],
  "sql-strings-short-name": [
    " id | short_name\n----+--------------\n 1  | О. Смирнова\n 10 | А. Попов\n 11 | Н. Кузнецова\n 12 | В. Зайцев\n 2  | И. Петров\n 3  | М. Козлова\n 4  | Д. Орлов\n 5  | А. Волкова\n 6  | С. Лебедев\n 7  | Е. Новикова\n 8  | П. Морозов\n 9  | Т. Соколова\n(12 строк)",
    " id | short_name\n----+---------------\n 1  | К. Белов\n 10 | В. Медведева\n 2  | Ю. Фёдорова\n 3  | Р. Егоров\n 4  | С. Павлова\n 5  | А. Семёнов\n 6  | И. Голубева\n 7  | М. Виноградов\n 8  | К. Богданова\n 9  | Г. Воробьёв\n(10 строк)",
  ],
  "sql-strings-sku-parts": [
    " id | category | number | country\n----+----------+--------+---------\n 1  | LT       | 42     | RU\n 2  | LT       | 107    | DE\n 3  | PH       | 15     | RU\n 4  | PH       | 230    | CN\n 5  | AC       | 8      | RU\n(5 строк)",
    " id | category | number | country\n----+----------+--------+---------\n 1  | LT       | 900    | US\n 2  | PH       | 3      | RU\n 3  | AC       | 450    | DE\n 4  | TB       | 12     | CN\n(4 строки)",
  ],
  "sql-strings-sku-starts": [
    " id | sku\n----+------------\n 3  | PH-0015-RU\n 4  | PH-0230-CN\n(2 строки)",
    " id | sku\n----+------------\n 2  | PH-0003-RU\n(1 строка)",
  ],
  "sql-strings-tag-pairs": [
    " post_id | tag\n---------+-----------\n 1       | ноутбуки\n 1       | обзор\n 1       | советы\n 2       | акции\n 2       | скидки\n 3       | смартфоны\n 3       | советы\n 4       | новинки\n(8 строк)",
    " post_id | tag\n---------+----------\n 1       | акции\n 1       | ноутбуки\n 1       | скидки\n 2       | новинки\n 2       | советы\n 3       | советы\n(6 строк)",
  ],
  "sql-strings-title-preview": [
    " id | preview\n----+---------------\n 1  | Ноутбук Ai...\n 2  | Ноутбук Pr...\n 3  | Смартфон L...\n 4  | Смартфон M...\n 5  | Чехол для ...\n 6  | Беспроводн...\n 7  | Зарядное у...\n 8  | Мышь беспр...\n 9  | Подставка ...\n 10 | Смартфон M...\n(10 строк)",
    " id | preview\n----+---------------\n 1  | Ноутбук Of...\n 2  | Планшет Ta...\n 3  | Планшет Ta...\n 4  | Кабель USB...\n 5  | Клавиатура...\n 6  | Игровая пр...\n 8  | Сумка для ...\n(7 строк)",
  ],
  "sql-strings-title-words": [
    " id | title                    | words\n----+--------------------------+-------\n 1  | Война и мир              | 3\n 10 | Бедные люди              | 2\n 2  | Анна Каренина            | 2\n 3  | Преступление и наказание | 3\n 4  | Идиот                    | 1\n 5  | Гордость и предубеждение | 3\n 6  | Сто лет одиночества      | 3\n 7  | Норвежский лес           | 2\n 8  | Хроники заводной птицы   | 3\n 9  | Слово о полку Игореве    | 4\n(10 строк)",
    " id | title                            | words\n----+----------------------------------+-------\n 1  | Палата номер 6                   | 3\n 2  | Вишнёвый сад                     | 2\n 3  | Мастер и Маргарита               | 3\n 4  | Собачье сердце                   | 2\n 5  | 1984                             | 1\n 6  | Скотный двор                     | 2\n 7  | Убийство в «Восточном экспрессе» | 4\n 8  | И никого не стало                | 4\n 9  | Повесть временных лет            | 3\n(9 строк)",
  ],
  "sql-strings-trim-marks": [
    " id | title_clean\n----+----------------------\n 1  | Обзор ноутбуков\n 2  | Скидки недели\n 3  | Как выбрать смартфон\n 4  | Новинки месяца\n 5  | Гарантия и возврат\n(5 строк)",
    " id | title_clean\n----+-----------------\n 1  | Распродажа\n 2  | Что нового\n 3  | Гид по зарядкам\n 4  | Доставка\n(4 строки)",
  ],
  "sql-strings-word-count": [
    " id | word_count\n----+------------\n 1  | 7\n 2  | 6\n 3  | 5\n 4  | 6\n 5  | 6\n(5 строк)",
    " id | word_count\n----+------------\n 1  | 8\n 2  | 3\n 3  | 5\n 4  | 6\n(4 строки)",
  ],
  "sql-subqueries-all-above-support": [
    " full_name        | salary\n------------------+--------\n Ольга Смирнова   | 320000\n Игорь Петров     | 210000\n Мария Козлова    | 185000\n Денис Орлов      | 120000\n Анна Волкова     | 240000\n Сергей Лебедев   | 95000\n Елена Новикова   | 260000\n Павел Морозов    | 110000\n Татьяна Соколова | 115000\n(9 строк)",
    " full_name         | salary\n-------------------+--------\n Кирилл Белов      | 300000\n Юлия Фёдорова     | 230000\n Роман Егоров      | 230000\n Светлана Павлова  | 130000\n Артём Семёнов     | 150000\n Ирина Голубева    | 90000\n Максим Виноградов | 98000\n Вера Медведева    | 98000\n(8 строк)",
  ],
  "sql-subqueries-all-best-points": [
    " student | points\n---------+--------\n Аня     | 90\n Вика    | 90\n(2 строки)",
    " student | points\n---------+--------\n Рита    | 100\n(1 строка)",
  ],
  "sql-subqueries-all-longer-than-novellas": [
    " title                    | pages\n--------------------------+-------\n Война и мир              | 1300\n Анна Каренина            | 864\n Преступление и наказание | 672\n Идиот                    | 640\n Гордость и предубеждение | 416\n Сто лет одиночества      | 480\n Норвежский лес           | 384\n Хроники заводной птицы   | 896\n(8 строк)",
    " title                            | pages\n----------------------------------+-------\n Мастер и Маргарита               | 480\n 1984                             | 328\n Убийство в «Восточном экспрессе» | 256\n И никого не стало                | 288\n Повесть временных лет            | 220\n(5 строк)",
  ],
  "sql-subqueries-all-registered-after-moscow": [
    " full_name     | registered_on\n---------------+---------------\n Дарья Ершова  | 2025-06-18\n Лев Комаров   | 2025-10-09\n Полина Гусева | 2026-03-27\n(3 строки)",
    " full_name      | registered_on\n----------------+---------------\n Борис Лапин    | 2025-02-28\n Ева Миронова   | 2025-08-08\n Яна Кудрявцева | 2026-01-31\n(3 строки)",
  ],
  "sql-subqueries-any-array-genres": [
    " title                 | genre\n-----------------------+---------\n Слово о полку Игореве | поэма\n Бедные люди           | повесть\n(2 строки)",
    " title          | genre\n----------------+---------\n Палата номер 6 | повесть\n Вишнёвый сад   | пьеса\n Собачье сердце | повесть\n Скотный двор   | повесть\n(4 строки)",
  ],
  "sql-subqueries-any-cheaper-than-laptop": [
    " title                     | price\n---------------------------+-------\n Ноутбук Air 13            | 89990\n Смартфон Lite             | 19990\n Смартфон Max              | 74990\n Чехол для смартфона       | 990\n Беспроводные наушники     | 7490\n Зарядное устройство 65 Вт | 2490\n Мышь беспроводная         | 1590\n Подставка для ноутбука    | 3290\n Смартфон Mini             | 39990\n(9 строк)",
    " title                   | price\n-------------------------+-------\n Планшет Tab 11          | 32990\n Планшет Tab Mini        | 24990\n Кабель USB-C            | 590\n Клавиатура механическая | 8990\n Игровая приставка       | 49990\n Геймпад                 | 5990\n Сумка для ноутбука      | 2990\n(7 строк)",
  ],
  "sql-subqueries-corr-above-dept-avg": [
    " full_name         | department_id | salary\n-------------------+---------------+--------\n Ольга Смирнова    | 1             | 320000\n Игорь Петров      | 1             | 210000\n Анна Волкова      | 2             | 240000\n Елена Новикова    | 3             | 260000\n Наталья Кузнецова | 4             | 72000\n(5 строк)",
    " full_name         | department_id | salary\n-------------------+---------------+--------\n Кирилл Белов      | 1             | 300000\n Юлия Фёдорова     | 1             | 230000\n Роман Егоров      | 1             | 230000\n Артём Семёнов     | 2             | 150000\n Максим Виноградов | 3             | 98000\n(5 строк)",
  ],
  "sql-subqueries-corr-best-per-subject-ties": [
    " subject    | student | points\n------------+---------+--------\n математика | Аня     | 90\n математика | Вика    | 90\n физика     | Даня    | 88\n химия      | Жора    | 60\n химия      | Зоя     | 60\n(5 строк)",
    " subject     | student | points\n-------------+---------+--------\n информатика | Рита    | 100\n математика  | Лена    | 95\n математика  | Макс    | 95\n математика  | Нина    | 95\n физика      | Олег    | 80\n физика      | Паша    | 80\n химия       | Тоня    | 72\n(7 строк)",
  ],
  "sql-subqueries-corr-cheapest-in-category": [
    " title               | category_id | price\n---------------------+-------------+-------\n Ноутбук Air 13      | 1           | 89990\n Смартфон Lite       | 2           | 19990\n Чехол для смартфона | 3           | 990\n(3 строки)",
    " title             | category_id | price\n-------------------+-------------+-------\n Ноутбук Office 14 | 1           | 54990\n Планшет Tab Mini  | 2           | 24990\n Кабель USB-C      | 3           | 590\n Геймпад           | 5           | 5990\n(4 строки)",
  ],
  "sql-subqueries-corr-distinct-on": [
    " subject    | student | points\n------------+---------+--------\n математика | Аня     | 90\n физика     | Даня    | 88\n химия      | Жора    | 60\n(3 строки)",
    " subject     | student | points\n-------------+---------+--------\n информатика | Рита    | 100\n математика  | Лена    | 95\n физика      | Олег    | 80\n химия       | Тоня    | 72\n(4 строки)",
  ],
  "sql-subqueries-corr-last-order": [
    " full_name      | last_order_at\n----------------+---------------------\n Андрей Кравцов | 2026-04-02 19:10:00\n Вера Тихонова  | 2026-03-08 15:20:00\n Олег Савин     | 2026-02-14 21:30:00\n Дарья Ершова   | 2026-03-01 12:00:00\n Лев Комаров    | 2026-03-15 08:45:00\n Полина Гусева  | NULL\n(6 строк)",
    " full_name      | last_order_at\n----------------+---------------------\n Тимур Абрамов  | 2026-04-11 20:20:00\n Алина Зуева    | 2026-02-17 16:30:00\n Борис Лапин    | 2026-04-30 07:30:00\n Ева Миронова   | 2026-03-22 10:05:00\n Яна Кудрявцева | NULL\n(5 строк)",
  ],
  "sql-subqueries-corr-latest-book": [
    " title                    | author_id | published_year\n--------------------------+-----------+----------------\n Анна Каренина            | 1         | 1878\n Идиот                    | 2         | 1869\n Гордость и предубеждение | 3         | 1813\n Сто лет одиночества      | 4         | 1967\n Хроники заводной птицы   | 5         | 1995\n Слово о полку Игореве    | NULL      | 1800\n(6 строк)",
    " title                 | author_id | published_year\n-----------------------+-----------+----------------\n Вишнёвый сад          | 1         | 1904\n Собачье сердце        | 2         | 1987\n 1984                  | 3         | 1949\n И никого не стало     | 4         | 1939\n Повесть временных лет | NULL      | 1767\n(5 строк)",
  ],
  "sql-subqueries-corr-staff-count": [
    " name       | staff_count\n------------+-------------\n Разработка | 4\n Маркетинг  | 2\n Продажи    | 3\n Поддержка  | 2\n Аналитика  | 0\n(5 строк)",
    " name         | staff_count\n--------------+-------------\n Разработка   | 4\n Финансы      | 2\n Продажи      | 2\n Логистика    | 1\n Юридический  | 0\n Безопасность | 0\n(6 строк)",
  ],
  "sql-subqueries-exists-empty-departments": [
    " name\n-----------\n Аналитика\n(1 строка)",
    " name\n--------------\n Юридический\n Безопасность\n(2 строки)",
  ],
  "sql-subqueries-exists-high-paid-departments": [
    " name\n------------\n Разработка\n Маркетинг\n Продажи\n(3 строки)",
    " name\n------------\n Разработка\n(1 строка)",
  ],
  "sql-subqueries-exists-shipped-customers": [
    " full_name\n----------------\n Андрей Кравцов\n Вера Тихонова\n Олег Савин\n(3 строки)",
    " full_name\n---------------\n Тимур Абрамов\n Алина Зуева\n Ева Миронова\n(3 строки)",
  ],
  "sql-subqueries-from-avg-of-avg": [
    " avg_of_avg\n------------\n 152229.17\n(1 строка)",
    " avg_of_avg\n------------\n 128375\n(1 строка)",
  ],
  "sql-subqueries-from-avg-order-total": [
    " avg_order_total\n-----------------\n 67677.5\n(1 строка)",
    " avg_order_total\n-----------------\n 35550\n(1 строка)",
  ],
  "sql-subqueries-from-big-categories": [
    " category_id | avg_price\n-------------+-----------\n 1           | 139990\n 2           | 44990\n(2 строки)",
    " category_id | avg_price\n-------------+-----------\n 1           | 54990\n 2           | 28990\n 5           | 27990\n(3 строки)",
  ],
  "sql-subqueries-from-big-departments": [
    " big_departments\n-----------------\n 4\n(1 строка)",
    " big_departments\n-----------------\n 3\n(1 строка)",
  ],
  "sql-subqueries-in-authors-without-books": [
    " full_name\n---------------\n Анна Ахматова\n(1 строка)",
    " full_name\n--------------\n Рэй Брэдбери\n(1 строка)",
  ],
  "sql-subqueries-in-managers": [
    " full_name      | position\n----------------+-------------------------\n Ольга Смирнова | Руководитель разработки\n Анна Волкова   | Руководитель маркетинга\n Елена Новикова | Руководитель продаж\n Алексей Попов  | Специалист поддержки\n(4 строки)",
    " full_name        | position\n------------------+-------------------------\n Кирилл Белов     | Руководитель разработки\n Светлана Павлова | Бухгалтер\n Ирина Голубева   | Менеджер по продажам\n(3 строки)",
  ],
  "sql-subqueries-in-moscow-staff": [
    " full_name        | position\n------------------+-------------------------\n Ольга Смирнова   | Руководитель разработки\n Игорь Петров     | Бэкенд-разработчик\n Мария Козлова    | Фронтенд-разработчик\n Денис Орлов      | Тестировщик\n Елена Новикова   | Руководитель продаж\n Павел Морозов    | Менеджер по продажам\n Татьяна Соколова | Менеджер по продажам\n(7 строк)",
    " full_name        | position\n------------------+---------------------\n Светлана Павлова | Бухгалтер\n Артём Семёнов    | Финансовый аналитик\n(2 строки)",
  ],
  "sql-subqueries-in-not-ordered-products": [
    " title\n------------------------\n Ноутбук Pro 16\n Подставка для ноутбука\n(2 строки)",
    " title\n----------------\n Планшет Tab 11\n(1 строка)",
  ],
  "sql-subqueries-scalar-above-avg": [
    " full_name      | salary\n----------------+--------\n Ольга Смирнова | 320000\n Елена Новикова | 260000\n Анна Волкова   | 240000\n Игорь Петров   | 210000\n Мария Козлова  | 185000\n(5 строк)",
    " full_name     | salary\n---------------+--------\n Кирилл Белов  | 300000\n Юлия Фёдорова | 230000\n Роман Егоров  | 230000\n Артём Семёнов | 150000\n(4 строки)",
  ],
  "sql-subqueries-scalar-above-dept-max": [
    " full_name      | salary\n----------------+--------\n Ольга Смирнова | 320000\n(1 строка)",
    " full_name        | salary\n------------------+--------\n Кирилл Белов     | 300000\n Юлия Фёдорова    | 230000\n Роман Егоров     | 230000\n Светлана Павлова | 130000\n Артём Семёнов    | 150000\n(5 строк)",
  ],
  "sql-subqueries-scalar-cheaper-than-avg": [
    " title                     | price\n---------------------------+-------\n Чехол для смартфона       | 990\n Мышь беспроводная         | 1590\n Зарядное устройство 65 Вт | 2490\n Подставка для ноутбука    | 3290\n Беспроводные наушники     | 7490\n Смартфон Lite             | 19990\n Смартфон Mini             | 39990\n(7 строк)",
    " title                   | price\n-------------------------+-------\n Кабель USB-C            | 590\n Сумка для ноутбука      | 2990\n Геймпад                 | 5990\n Клавиатура механическая | 8990\n(4 строки)",
  ],
  "sql-subqueries-scalar-latest-registered": [
    " full_name     | registered_on\n---------------+---------------\n Полина Гусева | 2026-03-27\n(1 строка)",
    " full_name      | registered_on\n----------------+---------------\n Яна Кудрявцева | 2026-01-31\n(1 строка)",
  ],
  "sql-subqueries-scalar-long-books": [
    " title                    | pages\n--------------------------+-------\n Война и мир              | 1300\n Хроники заводной птицы   | 896\n Анна Каренина            | 864\n Преступление и наказание | 672\n Идиот                    | 640\n(5 строк)",
    " title                            | pages\n----------------------------------+-------\n Мастер и Маргарита               | 480\n 1984                             | 328\n И никого не стало                | 288\n Убийство в «Восточном экспрессе» | 256\n(4 строки)",
  ],
  "sql-subqueries-scalar-second-salary": [
    " second_salary\n---------------\n 260000\n(1 строка)",
    " second_salary\n---------------\n 230000\n(1 строка)",
  ],
  "sql-subqueries-scalar-top-ties": [
    " student | points\n---------+--------\n Аня     | 90\n Вика    | 90\n(2 строки)",
    " student | points\n---------+--------\n Рита    | 100\n(1 строка)",
  ],
  "sql-subqueries-select-diff-from-avg": [
    " full_name         | salary | diff\n-------------------+--------+---------\n Ольга Смирнова    | 320000 | 166500\n Игорь Петров      | 210000 | 56500\n Мария Козлова     | 185000 | 31500\n Денис Орлов       | 120000 | -33500\n Анна Волкова      | 240000 | 86500\n Сергей Лебедев    | 95000  | -58500\n Елена Новикова    | 260000 | 106500\n Павел Морозов     | 110000 | -43500\n Татьяна Соколова  | 115000 | -38500\n Алексей Попов     | 70000  | -83500\n Наталья Кузнецова | 72000  | -81500\n Виктор Зайцев     | 45000  | -108500\n(12 строк)",
    " full_name         | salary | diff\n-------------------+--------+---------\n Кирилл Белов      | 300000 | 156900\n Юлия Фёдорова     | 230000 | 86900\n Роман Егоров      | 230000 | 86900\n Светлана Павлова  | 130000 | -13100\n Артём Семёнов     | 150000 | 6900\n Ирина Голубева    | 90000  | -53100\n Максим Виноградов | 98000  | -45100\n Ксения Богданова  | 40000  | -103100\n Глеб Воробьёв     | 65000  | -78100\n Вера Медведева    | 98000  | -45100\n(10 строк)",
  ],
  "sql-subqueries-select-pages-share": [
    " title                    | pages | share_percent\n--------------------------+-------+---------------\n Война и мир              | 1300  | 22\n Анна Каренина            | 864   | 14.6\n Преступление и наказание | 672   | 11.4\n Идиот                    | 640   | 10.8\n Гордость и предубеждение | 416   | 7\n Сто лет одиночества      | 480   | 8.1\n Норвежский лес           | 384   | 6.5\n Хроники заводной птицы   | 896   | 15.2\n Слово о полку Игореве    | 96    | 1.6\n Бедные люди              | 160   | 2.7\n(10 строк)",
    " title                            | pages | share_percent\n----------------------------------+-------+---------------\n Палата номер 6                   | 96    | 4.6\n Вишнёвый сад                     | 128   | 6.1\n Мастер и Маргарита               | 480   | 22.9\n Собачье сердце                   | 160   | 7.6\n 1984                             | 328   | 15.6\n Скотный двор                     | 144   | 6.9\n Убийство в «Восточном экспрессе» | 256   | 12.2\n И никого не стало                | 288   | 13.7\n Повесть временных лет            | 220   | 10.5\n(9 строк)",
  ],
  "sql-subqueries-with-above-avg-of-depts": [
    " full_name      | salary\n----------------+--------\n Ольга Смирнова | 320000\n Игорь Петров   | 210000\n Мария Козлова  | 185000\n Анна Волкова   | 240000\n Елена Новикова | 260000\n(5 строк)",
    " full_name        | salary\n------------------+--------\n Кирилл Белов     | 300000\n Юлия Фёдорова    | 230000\n Роман Егоров     | 230000\n Светлана Павлова | 130000\n Артём Семёнов    | 150000\n(5 строк)",
  ],
  "sql-subqueries-with-between-avg-and-max": [
    " title               | price\n---------------------+-------\n Анна Каренина       | 990\n Сто лет одиночества | 890\n Идиот               | 750\n(3 строки)",
    " title                            | price\n----------------------------------+-------\n 1984                             | 650\n Убийство в «Восточном экспрессе» | 540\n И никого не стало                | 540\n(3 строки)",
  ],
  "sql-subqueries-with-recursive-free-days": [
    " day\n------------\n 2026-03-02\n 2026-03-03\n 2026-03-04\n 2026-03-05\n 2026-03-06\n 2026-03-07\n 2026-03-09\n 2026-03-10\n(8 строк)",
    " day\n------------\n 2026-03-01\n 2026-03-02\n 2026-03-03\n 2026-03-04\n 2026-03-05\n 2026-03-06\n 2026-03-07\n 2026-03-08\n 2026-03-09\n 2026-03-10\n(10 строк)",
  ],
  "sql-subqueries-with-recursive-months": [
    " month_start | orders_count\n-------------+--------------\n 2025-11-01  | 0\n 2025-12-01  | 0\n 2026-01-01  | 2\n 2026-02-01  | 2\n 2026-03-01  | 3\n 2026-04-01  | 1\n 2026-05-01  | 0\n(7 строк)",
    " month_start | orders_count\n-------------+--------------\n 2025-11-01  | 0\n 2025-12-01  | 1\n 2026-01-01  | 1\n 2026-02-01  | 2\n 2026-03-01  | 1\n 2026-04-01  | 2\n 2026-05-01  | 0\n(7 строк)",
  ],
  "sql-subqueries-with-top-payroll": [
    " department_id | total\n---------------+--------\n 1             | 835000\n(1 строка)",
    " department_id | total\n---------------+--------\n 1             | 858000\n(1 строка)",
  ],
  "sql-subqueries-with-two-ctes": [
    " customer_id | spent\n-------------+--------\n 1           | 184450\n 3           | 79970\n(2 строки)",
    " customer_id | spent\n-------------+-------\n 1           | 64960\n 2           | 56760\n 3           | 83970\n(3 строки)",
  ],
  "sql-transactions-chain": [
    " what  | balance\n-------+---------\n 1     | 9000\n 2     | 5300\n 3     | 200\n 4     | 3000\n 9     | 0\n total | 17500\n(6 строк)",
    " what  | balance\n-------+---------\n 1     | 3000\n 2     | 300\n 3     | 7700\n 4     | 3000\n 9     | 150\n total | 14150\n(6 строк)",
  ],
  "sql-transactions-conditional": [
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 2000\n 2  | Борис Климов  | 13000\n 3  | Вера Суслова  | 0\n 4  | Глеб Ионов    | 2500\n 9  | Комиссии      | 0\n(5 строк)",
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 4000\n 2  | Борис Климов  | 0\n 3  | Вера Суслова  | 7500\n 4  | Глеб Ионов    | 2500\n 9  | Комиссии      | 150\n(5 строк)",
  ],
  "sql-transactions-fee": [
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 8950\n 2  | Борис Климов  | 6000\n 3  | Вера Суслова  | 0\n 4  | Глеб Ионов    | 2500\n 9  | Комиссии      | 50\n(5 строк)",
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 2950\n 2  | Борис Климов  | 1000\n 3  | Вера Суслова  | 7500\n 4  | Глеб Ионов    | 2500\n 9  | Комиссии      | 200\n(5 строк)",
  ],
  "sql-transactions-for-share": [
    " kind     | id | balance\n----------+----+---------\n account  | 1  | 10000\n account  | 2  | 5000\n account  | 3  | 0\n account  | 4  | 2500\n account  | 9  | 0\n transfer | 1  | 300\n transfer | 2  | 400\n(7 строк)",
    " kind     | id | balance\n----------+----+---------\n account  | 1  | 4000\n account  | 2  | 0\n account  | 3  | 7500\n account  | 4  | 2500\n account  | 9  | 150\n transfer | 1  | 100\n transfer | 2  | 50\n transfer | 3  | 400\n(8 строк)",
  ],
  "sql-transactions-for-update": [
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 10000\n 2  | Борис Климов  | 0\n 3  | Вера Суслова  | 5000\n 4  | Глеб Ионов    | 2500\n 9  | Комиссии      | 0\n(5 строк)",
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 4000\n 2  | Борис Климов  | 0\n 3  | Вера Суслова  | 7500\n 4  | Глеб Ионов    | 2500\n 9  | Комиссии      | 150\n(5 строк)",
  ],
  "sql-transactions-lock-table": [
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 10200\n 2  | Борис Климов  | 5100\n 3  | Вера Суслова  | 0\n 4  | Глеб Ионов    | 2550\n 9  | Комиссии      | 0\n(5 строк)",
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 4080\n 2  | Борис Климов  | 0\n 3  | Вера Суслова  | 7650\n 4  | Глеб Ионов    | 2550\n 9  | Комиссии      | 150\n(5 строк)",
  ],
  "sql-transactions-log": [
    " kind     | id | balance\n----------+----+---------\n account  | 1  | 9300\n account  | 2  | 5000\n account  | 3  | 0\n account  | 4  | 3200\n account  | 9  | 0\n transfer | 1  | 300\n transfer | 2  | 700\n(7 строк)",
    " kind     | id | balance\n----------+----+---------\n account  | 1  | 3300\n account  | 2  | 0\n account  | 3  | 7500\n account  | 4  | 3200\n account  | 9  | 150\n transfer | 1  | 100\n transfer | 2  | 50\n transfer | 3  | 700\n(8 строк)",
  ],
  "sql-transactions-open-account": [
    " kind     | id | balance\n----------+----+---------\n account  | 1  | 9000\n account  | 2  | 5000\n account  | 3  | 0\n account  | 4  | 2500\n account  | 5  | 1000\n account  | 9  | 0\n transfer | 1  | 300\n transfer | 2  | 1000\n(8 строк)",
    " kind     | id | balance\n----------+----+---------\n account  | 1  | 3000\n account  | 2  | 0\n account  | 3  | 7500\n account  | 4  | 2500\n account  | 5  | 1000\n account  | 9  | 150\n transfer | 1  | 100\n transfer | 2  | 50\n transfer | 3  | 1000\n(9 строк)",
  ],
  "sql-transactions-read-only": [
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 9750\n 2  | Борис Климов  | 5000\n 3  | Вера Суслова  | 0\n 4  | Глеб Ионов    | 2750\n 9  | Комиссии      | 0\n(5 строк)",
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 3750\n 2  | Борис Климов  | 0\n 3  | Вера Суслова  | 7500\n 4  | Глеб Ионов    | 2750\n 9  | Комиссии      | 150\n(5 строк)",
  ],
  "sql-transactions-repeatable-read": [
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 9500\n 2  | Борис Климов  | 5500\n 3  | Вера Суслова  | 0\n 4  | Глеб Ионов    | 2500\n 9  | Комиссии      | 0\n(5 строк)",
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 3500\n 2  | Борис Климов  | 500\n 3  | Вера Суслова  | 7500\n 4  | Глеб Ионов    | 2500\n 9  | Комиссии      | 150\n(5 строк)",
  ],
  "sql-transactions-rollback-part": [
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 8500\n 2  | Борис Климов  | 5000\n 3  | Вера Суслова  | 1500\n 4  | Глеб Ионов    | 2500\n 9  | Комиссии      | 0\n(5 строк)",
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 2500\n 2  | Борис Климов  | 0\n 3  | Вера Суслова  | 9000\n 4  | Глеб Ионов    | 2500\n 9  | Комиссии      | 150\n(5 строк)",
  ],
  "sql-transactions-savepoint-basic": [
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 9500\n 2  | Борис Климов  | 5000\n 3  | Вера Суслова  | 500\n 4  | Глеб Ионов    | 2500\n 9  | Комиссии      | 0\n(5 строк)",
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 3500\n 2  | Борис Климов  | 0\n 3  | Вера Суслова  | 8000\n 4  | Глеб Ионов    | 2500\n 9  | Комиссии      | 150\n(5 строк)",
  ],
  "sql-transactions-savepoint-bonus": [
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 10100\n 2  | Борис Климов  | 5100\n 3  | Вера Суслова  | 0\n 4  | Глеб Ионов    | 2600\n 9  | Комиссии      | 0\n(5 строк)",
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 4100\n 2  | Борис Климов  | 100\n 3  | Вера Суслова  | 7500\n 4  | Глеб Ионов    | 2600\n 9  | Комиссии      | 150\n(5 строк)",
  ],
  "sql-transactions-savepoint-nested": [
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 10100\n 2  | Борис Климов  | 5000\n 3  | Вера Суслова  | 0\n 4  | Глеб Ионов    | 2900\n 9  | Комиссии      | 0\n(5 строк)",
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 4100\n 2  | Борис Климов  | 0\n 3  | Вера Суслова  | 7500\n 4  | Глеб Ионов    | 2900\n 9  | Комиссии      | 150\n(5 строк)",
  ],
  "sql-transactions-savepoint-release": [
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 10000\n 2  | Борис Климов  | 5000\n 3  | Вера Суслова  | 0\n 4  | Глеб Ионов    | 2200\n 9  | Комиссии      | 0\n(5 строк)",
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 4000\n 2  | Борис Климов  | 0\n 3  | Вера Суслова  | 7500\n 4  | Глеб Ионов    | 2200\n 9  | Комиссии      | 150\n(5 строк)",
  ],
  "sql-transactions-serializable-log": [
    " kind     | id | balance\n----------+----+---------\n account  | 1  | 10000\n account  | 2  | 5000\n account  | 3  | 300\n account  | 4  | 2200\n account  | 9  | 0\n transfer | 1  | 300\n transfer | 2  | 300\n(7 строк)",
    " kind     | id | balance\n----------+----+---------\n account  | 1  | 4000\n account  | 2  | 0\n account  | 3  | 7800\n account  | 4  | 2200\n account  | 9  | 150\n transfer | 1  | 100\n transfer | 2  | 50\n transfer | 3  | 300\n(8 строк)",
  ],
  "sql-transactions-set-transaction": [
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 9900\n 2  | Борис Климов  | 4900\n 3  | Вера Суслова  | 0\n 4  | Глеб Ионов    | 2500\n 9  | Комиссии      | 200\n(5 строк)",
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 4000\n 2  | Борис Климов  | 0\n 3  | Вера Суслова  | 7400\n 4  | Глеб Ионов    | 2500\n 9  | Комиссии      | 250\n(5 строк)",
  ],
  "sql-transactions-skip-batch": [
    " id | payload\n----+-----------------\n 2  | Отчёт за март\n 3  | Резервная копия\n(2 строки)",
    " id | payload\n----+----------\n 1  | Рассылка\n 3  | Пересчёт\n(2 строки)",
  ],
  "sql-transactions-skip-one": [
    " id | status | worker\n----+--------+--------\n 1  | done   | w2\n 2  | taken  | w1\n 3  | new    | NULL\n 4  | new    | NULL\n 5  | new    | NULL\n(5 строк)",
    " id | status | worker\n----+--------+--------\n 1  | taken  | w1\n 2  | taken  | w3\n 3  | new    | NULL\n 4  | new    | NULL\n(4 строки)",
  ],
  "sql-transactions-transfer": [
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 8000\n 2  | Борис Климов  | 7000\n 3  | Вера Суслова  | 0\n 4  | Глеб Ионов    | 2500\n 9  | Комиссии      | 0\n(5 строк)",
    " id | owner         | balance\n----+---------------+---------\n 1  | Анна Лебедева | 2000\n 2  | Борис Климов  | 2000\n 3  | Вера Суслова  | 7500\n 4  | Глеб Ионов    | 2500\n 9  | Комиссии      | 150\n(5 строк)",
  ],
  "sql-union-dedupe": [
    " full_name\n----------------\n Анна Волкова\n Елена Новикова\n Игорь Петров\n Ольга Смирнова\n(4 строки)",
    " full_name\n---------------\n Глеб Воробьёв\n Кирилл Белов\n Роман Егоров\n Юлия Фёдорова\n(4 строки)",
  ],
  "sql-union-except-no-orders": [
    " id\n----\n 6\n(1 строка)",
    " id\n----\n 5\n(1 строка)",
  ],
  "sql-union-except-quiet-genres": [
    " genre\n---------\n повесть\n поэма\n(2 строки)",
    " genre\n----------\n детектив\n летопись\n повесть\n пьеса\n(4 строки)",
  ],
  "sql-union-intersect-authors-genres": [
    " author_id\n-----------\n 2\n(1 строка)",
    " author_id\n-----------\n 2\n 3\n(2 строки)",
  ],
  "sql-union-intersect-both-statuses": [
    " customer_id\n-------------\n 1\n(1 строка)",
    " customer_id\n-------------\n 2\n(1 строка)",
  ],
  "sql-union-newest-and-oldest": [
    " full_name         | hire_date\n-------------------+------------\n Елена Новикова    | 2016-10-03\n Ольга Смирнова    | 2017-03-01\n Анна Волкова      | 2018-01-15\n Сергей Лебедев    | 2023-02-20\n Наталья Кузнецова | 2024-06-03\n Виктор Зайцев     | 2025-09-01\n(6 строк)",
    " full_name         | hire_date\n-------------------+------------\n Кирилл Белов      | 2015-05-12\n Глеб Воробьёв     | 2018-12-10\n Светлана Павлова  | 2019-04-01\n Максим Виноградов | 2024-03-04\n Вера Медведева    | 2025-05-19\n Ксения Богданова  | 2026-02-02\n(6 строк)",
  ],
  "sql-union-reasons": [
    " full_name      | reason\n----------------+------------------\n Анна Волкова   | ветеран\n Анна Волкова   | высокая зарплата\n Елена Новикова | ветеран\n Елена Новикова | высокая зарплата\n Игорь Петров   | высокая зарплата\n Ольга Смирнова | ветеран\n Ольга Смирнова | высокая зарплата\n(7 строк)",
    " full_name     | reason\n---------------+------------------\n Глеб Воробьёв | ветеран\n Кирилл Белов  | ветеран\n Кирилл Белов  | высокая зарплата\n Роман Егоров  | высокая зарплата\n Юлия Фёдорова | высокая зарплата\n(5 строк)",
  ],
  "sql-union-search-index": [
    " name                     | kind\n--------------------------+-------\n Анна Ахматова            | автор\n Анна Каренина            | книга\n Бедные люди              | книга\n Война и мир              | книга\n Габриэль Гарсиа Маркес   | автор\n Гордость и предубеждение | книга\n Джейн Остин              | автор\n Идиот                    | книга\n Лев Толстой              | автор\n Норвежский лес           | книга\n Преступление и наказание | книга\n Слово о полку Игореве    | книга\n Сто лет одиночества      | книга\n Фёдор Достоевский        | автор\n Харуки Мураками          | автор\n Хроники заводной птицы   | книга\n(16 строк)",
    " name                             | kind\n----------------------------------+-------\n 1984                             | книга\n Агата Кристи                     | автор\n Антон Чехов                      | автор\n Вишнёвый сад                     | книга\n Джордж Оруэлл                    | автор\n И никого не стало                | книга\n Мастер и Маргарита               | книга\n Михаил Булгаков                  | автор\n Палата номер 6                   | книга\n Повесть временных лет            | книга\n Рэй Брэдбери                     | автор\n Скотный двор                     | книга\n Собачье сердце                   | книга\n Убийство в «Восточном экспрессе» | книга\n(14 строк)",
  ],
  "sql-union-symmetric-difference": [
    " product_id\n------------\n 2\n 3\n 4\n 8\n 10\n(5 строк)",
    " product_id\n------------\n 2\n 3\n 5\n 6\n 8\n(5 строк)",
  ],
  "sql-union-total-row": [
    " label      | total\n------------+---------\n 1          | 835000\n 2          | 335000\n 3          | 485000\n 4          | 142000\n без отдела | 45000\n Итого      | 1842000\n(6 строк)",
    " label      | total\n------------+---------\n 1          | 858000\n 2          | 280000\n 3          | 188000\n 4          | 65000\n без отдела | 40000\n Итого      | 1431000\n(6 строк)",
  ],
  "sql-where-books-long": [
    " title                    | pages\n--------------------------+-------\n Анна Каренина            | 864\n Война и мир              | 1300\n Идиот                    | 640\n Преступление и наказание | 672\n Хроники заводной птицы   | 896\n(5 строк)",
    " title | pages\n-------+-------\n(0 строк)",
  ],
  "sql-where-cities-in": [
    " full_name      | city\n----------------+--------\n Андрей Кравцов | Москва\n Олег Савин     | Москва\n(2 строки)",
    " full_name      | city\n----------------+--------\n Алина Зуева    | Москва\n Борис Лапин    | Самара\n Тимур Абрамов  | Самара\n Яна Кудрявцева | Пермь\n(4 строки)",
  ],
  "sql-where-cities-not-in-null": [
    " name      | city\n-----------+-----------------\n Маркетинг | Санкт-Петербург\n(1 строка)",
    " name       | city\n------------+--------------\n Продажи    | Екатеринбург\n Разработка | Новосибирск\n(2 строки)",
  ],
  "sql-where-cities-or": [
    " full_name      | city\n----------------+--------\n Андрей Кравцов | Москва\n Вера Тихонова  | Казань\n Олег Савин     | Москва\n Полина Гусева  | Казань\n(4 строки)",
    " full_name   | city\n-------------+--------\n Алина Зуева | Москва\n(1 строка)",
  ],
  "sql-where-city-equal": [
    " full_name      | city\n----------------+--------\n Андрей Кравцов | Москва\n Олег Савин     | Москва\n(2 строки)",
    " full_name   | city\n-------------+--------\n Алина Зуева | Москва\n(1 строка)",
  ],
  "sql-where-code-has-digit": [
    " id | code\n----+-----------\n 1  | SALE_10\n 2  | SALE10\n 3  | sale_15\n 5  | VIP%20\n 6  | Summer-25\n 7  | WINTER_5\n(6 строк)",
    " id | code\n----+---------\n 3  | sale_5\n 5  | SALE50%\n(2 строки)",
  ],
  "sql-where-code-ilike-sale": [
    " id | code\n----+---------\n 1  | SALE_10\n 2  | SALE10\n 3  | sale_15\n(3 строки)",
    " id | code\n----+---------\n 3  | sale_5\n 5  | SALE50%\n(2 строки)",
  ],
  "sql-where-code-no-symbols": [
    " id | code\n----+---------\n 2  | SALE10\n 4  | WELCOME\n(2 строки)",
    " id | code\n----+-------------\n 2  | BLACKFRIDAY\n 4  | NEWYEAR\n(2 строки)",
  ],
  "sql-where-code-only-upper": [
    " id | code\n----+---------\n 4  | WELCOME\n(1 строка)",
    " id | code\n----+-------------\n 2  | BLACKFRIDAY\n 4  | NEWYEAR\n(2 строки)",
  ],
  "sql-where-code-percent-escape": [
    " id | code\n----+--------\n 5  | VIP%20\n(1 строка)",
    " id | code\n----+---------\n 5  | SALE50%\n(1 строка)",
  ],
  "sql-where-code-sale-or-vip": [
    " id | code\n----+---------\n 1  | SALE_10\n 2  | SALE10\n 3  | sale_15\n 5  | VIP%20\n(4 строки)",
    " id | code\n----+----------\n 3  | sale_5\n 5  | SALE50%\n 6  | VIP_GOLD\n(3 строки)",
  ],
  "sql-where-code-underscore": [
    " id | code\n----+----------\n 1  | SALE_10\n 3  | sale_15\n 7  | WINTER_5\n(3 строки)",
    " id | code\n----+--------------\n 1  | BLACK_FRIDAY\n 3  | sale_5\n 6  | VIP_GOLD\n(3 строки)",
  ],
  "sql-where-de-morgan": [
    " full_name         | department_id | salary\n-------------------+---------------+--------\n Алексей Попов     | 4             | 70000\n Анна Волкова      | 2             | 240000\n Виктор Зайцев     | NULL          | 45000\n Денис Орлов       | 1             | 120000\n Елена Новикова    | 3             | 260000\n Наталья Кузнецова | 4             | 72000\n Павел Морозов     | 3             | 110000\n Сергей Лебедев    | 2             | 95000\n Татьяна Соколова  | 3             | 115000\n(9 строк)",
    " full_name         | department_id | salary\n-------------------+---------------+--------\n Артём Семёнов     | 2             | 150000\n Вера Медведева    | 1             | 98000\n Глеб Воробьёв     | 4             | 65000\n Ирина Голубева    | 3             | 90000\n Ксения Богданова  | NULL          | 40000\n Максим Виноградов | 3             | 98000\n Светлана Павлова  | 2             | 130000\n(7 строк)",
  ],
  "sql-where-dev-high-salary": [
    " full_name      | salary\n----------------+--------\n Игорь Петров   | 210000\n Ольга Смирнова | 320000\n(2 строки)",
    " full_name     | salary\n---------------+--------\n Кирилл Белов  | 300000\n Роман Егоров  | 230000\n Юлия Фёдорова | 230000\n(3 строки)",
  ],
  "sql-where-email-four-letters": [
    " full_name      | email\n----------------+-------------------\n Анна Волкова   | anna@corp.example\n Игорь Петров   | igor@corp.example\n Ольга Смирнова | olga@corp.example\n(3 строки)",
    " full_name      | email\n----------------+-------------------\n Вера Медведева | vera@corp.example\n(1 строка)",
  ],
  "sql-where-hired-after": [
    " full_name         | hire_date\n-------------------+------------\n Алексей Попов     | 2022-03-28\n Виктор Зайцев     | 2025-09-01\n Денис Орлов       | 2022-07-11\n Мария Козлова     | 2021-04-05\n Наталья Кузнецова | 2024-06-03\n Сергей Лебедев    | 2023-02-20\n Татьяна Соколова  | 2021-11-01\n(7 строк)",
    " full_name         | hire_date\n-------------------+------------\n Артём Семёнов     | 2023-10-09\n Вера Медведева    | 2025-05-19\n Ирина Голубева    | 2022-01-17\n Ксения Богданова  | 2026-02-02\n Максим Виноградов | 2024-03-04\n Роман Егоров      | 2021-08-23\n(6 строк)",
  ],
  "sql-where-manager-distinct": [
    " full_name         | manager_id\n-------------------+------------\n Алексей Попов     | NULL\n Анна Волкова      | NULL\n Виктор Зайцев     | NULL\n Елена Новикова    | NULL\n Наталья Кузнецова | 10\n Ольга Смирнова    | NULL\n Павел Морозов     | 7\n Сергей Лебедев    | 5\n Татьяна Соколова  | 7\n(9 строк)",
    " full_name         | manager_id\n-------------------+------------\n Артём Семёнов     | 4\n Глеб Воробьёв     | NULL\n Ирина Голубева    | NULL\n Кирилл Белов      | NULL\n Ксения Богданова  | NULL\n Максим Виноградов | 6\n Светлана Павлова  | NULL\n(7 строк)",
  ],
  "sql-where-missing-contact": [
    " full_name   | city   | email\n-------------+--------+------------------\n Лев Комаров | NULL   | lev@mail.example\n Олег Савин  | Москва | NULL\n(2 строки)",
    " full_name    | city   | email\n--------------+--------+------------------\n Алина Зуева  | Москва | NULL\n Ева Миронова | NULL   | eva@mail.example\n(2 строки)",
  ],
  "sql-where-mixed-conditions": [
    " title                    | genre   | pages | price\n--------------------------+---------+-------+-------\n Анна Каренина            | роман   | 864   | 990\n Бедные люди              | повесть | 160   | 390\n Война и мир              | роман   | 1300  | 1290\n Идиот                    | роман   | 640   | 750\n Преступление и наказание | роман   | 672   | 690\n Слово о полку Игореве    | поэма   | 96    | 350\n Хроники заводной птицы   | роман   | 896   | NULL\n(7 строк)",
    " title          | genre   | pages | price\n----------------+---------+-------+-------\n Вишнёвый сад   | пьеса   | 128   | 280\n Палата номер 6 | повесть | 96    | 320\n(2 строки)",
  ],
  "sql-where-name-starts-a": [
    " full_name\n---------------\n Алексей Попов\n Анна Волкова\n(2 строки)",
    " full_name\n---------------\n Артём Семёнов\n(1 строка)",
  ],
  "sql-where-no-email": [
    " full_name\n---------------\n Виктор Зайцев\n Денис Орлов\n Павел Морозов\n(3 строки)",
    " full_name\n-------------------\n Глеб Воробьёв\n Максим Виноградов\n Юлия Фёдорова\n(3 строки)",
  ],
  "sql-where-no-price": [
    " id | title\n----+------------------------\n 8  | Хроники заводной птицы\n(1 строка)",
    " id | title\n----+--------------\n 6  | Скотный двор\n(1 строка)",
  ],
  "sql-where-not-managers": [
    " full_name\n-------------------\n Виктор Зайцев\n Денис Орлов\n Игорь Петров\n Мария Козлова\n Наталья Кузнецова\n Павел Морозов\n Сергей Лебедев\n Татьяна Соколова\n(8 строк)",
    " full_name\n-------------------\n Артём Семёнов\n Вера Медведева\n Глеб Воробьёв\n Ксения Богданова\n Максим Виноградов\n Роман Егоров\n Юлия Фёдорова\n(7 строк)",
  ],
  "sql-where-not-novel": [
    " title                 | genre\n-----------------------+---------\n Бедные люди           | повесть\n Слово о полку Игореве | поэма\n(2 строки)",
    " title                            | genre\n----------------------------------+----------\n Вишнёвый сад                     | пьеса\n И никого не стало                | детектив\n Палата номер 6                   | повесть\n Повесть временных лет            | летопись\n Скотный двор                     | повесть\n Собачье сердце                   | повесть\n Убийство в «Восточном экспрессе» | детектив\n(7 строк)",
  ],
  "sql-where-ordered-after-moment": [
    " id | ordered_at\n----+---------------------\n 5  | 2026-03-01 12:00:00\n 6  | 2026-03-08 15:20:00\n 7  | 2026-03-15 08:45:00\n 8  | 2026-04-02 19:10:00\n(4 строки)",
    " id | ordered_at\n----+---------------------\n 3  | 2026-02-17 14:00:00\n 4  | 2026-02-17 16:30:00\n 5  | 2026-03-22 10:05:00\n 6  | 2026-04-11 20:20:00\n 7  | 2026-04-30 07:30:00\n(5 строк)",
  ],
  "sql-where-orders-march": [
    " id | ordered_at\n----+---------------------\n 5  | 2026-03-01 12:00:00\n 6  | 2026-03-08 15:20:00\n 7  | 2026-03-15 08:45:00\n(3 строки)",
    " id | ordered_at\n----+---------------------\n 5  | 2026-03-22 10:05:00\n(1 строка)",
  ],
  "sql-where-other-department": [
    " full_name         | department_id\n-------------------+---------------\n Алексей Попов     | 4\n Анна Волкова      | 2\n Виктор Зайцев     | NULL\n Елена Новикова    | 3\n Наталья Кузнецова | 4\n Павел Морозов     | 3\n Сергей Лебедев    | 2\n Татьяна Соколова  | 3\n(8 строк)",
    " full_name         | department_id\n-------------------+---------------\n Артём Семёнов     | 2\n Глеб Воробьёв     | 4\n Ирина Голубева    | 3\n Ксения Богданова  | NULL\n Максим Виноградов | 3\n Светлана Павлова  | 2\n(6 строк)",
  ],
  "sql-where-out-of-stock": [
    " title             | price\n-------------------+-------\n Мышь беспроводная | 1590\n Смартфон Max      | 74990\n(2 строки)",
    " title          | price\n----------------+-------\n Геймпад        | 5990\n Планшет Tab 11 | 32990\n(2 строки)",
  ],
  "sql-where-positions-in": [
    " full_name     | position\n---------------+-------------\n Виктор Зайцев | Стажёр\n Денис Орлов   | Тестировщик\n(2 строки)",
    " full_name        | position\n------------------+-------------\n Вера Медведева   | Тестировщик\n Ксения Богданова | Стажёр\n Светлана Павлова | Бухгалтер\n(3 строки)",
  ],
  "sql-where-precedence": [
    " title                     | category_id | price\n---------------------------+-------------+-------\n Беспроводные наушники     | 3           | 7490\n Зарядное устройство 65 Вт | 3           | 2490\n Мышь беспроводная         | 3           | 1590\n Чехол для смартфона       | 3           | 990\n(4 строки)",
    " title                   | category_id | price\n-------------------------+-------------+-------\n Кабель USB-C            | 3           | 590\n Клавиатура механическая | 3           | 8990\n(2 строки)",
  ],
  "sql-where-price-between": [
    " title                     | price\n---------------------------+-------\n Беспроводные наушники     | 7490\n Зарядное устройство 65 Вт | 2490\n Мышь беспроводная         | 1590\n Подставка для ноутбука    | 3290\n(4 строки)",
    " title                   | price\n-------------------------+-------\n Геймпад                 | 5990\n Клавиатура механическая | 8990\n Сумка для ноутбука      | 2990\n(3 строки)",
  ],
  "sql-where-price-between-null": [
    " title                    | price\n--------------------------+-------\n Гордость и предубеждение | 590\n Идиот                    | 750\n Норвежский лес           | 720\n Преступление и наказание | 690\n(4 строки)",
    " title                            | price\n----------------------------------+-------\n 1984                             | 650\n И никого не стало                | 540\n Мастер и Маргарита               | 790\n Убийство в «Восточном экспрессе» | 540\n(4 строки)",
  ],
  "sql-where-registered-2025": [
    " full_name    | registered_on\n--------------+---------------\n Дарья Ершова | 2025-06-18\n Лев Комаров  | 2025-10-09\n Олег Савин   | 2025-01-05\n(3 строки)",
    " full_name    | registered_on\n--------------+---------------\n Борис Лапин  | 2025-02-28\n Ева Миронова | 2025-08-08\n(2 строки)",
  ],
  "sql-where-salary-between": [
    " full_name        | salary\n------------------+--------\n Денис Орлов      | 120000\n Мария Козлова    | 185000\n Павел Морозов    | 110000\n Татьяна Соколова | 115000\n(4 строки)",
    " full_name        | salary\n------------------+--------\n Артём Семёнов    | 150000\n Светлана Павлова | 130000\n(2 строки)",
  ],
  "sql-where-salary-over": [
    " full_name      | salary\n----------------+--------\n Анна Волкова   | 240000\n Елена Новикова | 260000\n Игорь Петров   | 210000\n Мария Козлова  | 185000\n Ольга Смирнова | 320000\n(5 строк)",
    " full_name     | salary\n---------------+--------\n Кирилл Белов  | 300000\n Роман Егоров  | 230000\n Юлия Фёдорова | 230000\n(3 строки)",
  ],
  "sql-where-status-not-cancelled": [
    " id | status\n----+---------\n 1  | shipped\n 2  | paid\n 4  | shipped\n 5  | new\n 6  | shipped\n 7  | paid\n 8  | new\n(7 строк)",
    " id | status\n----+---------\n 1  | shipped\n 2  | shipped\n 3  | paid\n 5  | shipped\n 6  | new\n 7  | paid\n(6 строк)",
  ],
  "sql-where-status-not-in": [
    " id | status\n----+---------\n 1  | shipped\n 2  | paid\n 4  | shipped\n 6  | shipped\n 7  | paid\n(5 строк)",
    " id | status\n----+---------\n 1  | shipped\n 2  | shipped\n 3  | paid\n 5  | shipped\n 7  | paid\n(5 строк)",
  ],
  "sql-where-surname-ov": [
    " full_name\n-------------------\n Алексей Попов\n Анна Волкова\n Денис Орлов\n Елена Новикова\n Игорь Петров\n Мария Козлова\n Наталья Кузнецова\n Ольга Смирнова\n Павел Морозов\n Татьяна Соколова\n(10 строк)",
    " full_name\n-------------------\n Артём Семёнов\n Кирилл Белов\n Ксения Богданова\n Максим Виноградов\n Роман Егоров\n Светлана Павлова\n Юлия Фёдорова\n(7 строк)",
  ],
  "sql-where-title-contains": [
    " title\n------------------------\n Подставка для ноутбука\n(1 строка)",
    " title\n--------------------\n Сумка для ноутбука\n(1 строка)",
  ],
  "sql-where-title-one-word": [
    " title\n-------\n Идиот\n(1 строка)",
    " title\n-------\n 1984\n(1 строка)",
  ],
  "sql-where-title-two-words": [
    " title\n----------------\n Анна Каренина\n Бедные люди\n Норвежский лес\n(3 строки)",
    " title\n----------------\n Вишнёвый сад\n Скотный двор\n Собачье сердце\n(3 строки)",
  ],
  "sql-where-with-email": [
    " full_name      | email\n----------------+---------------------\n Андрей Кравцов | andrey@mail.example\n Вера Тихонова  | vera@mail.example\n Дарья Ершова   | darya@mail.example\n Лев Комаров    | lev@mail.example\n Полина Гусева  | polina@mail.example\n(5 строк)",
    " full_name      | email\n----------------+--------------------\n Борис Лапин    | boris@mail.example\n Ева Миронова   | eva@mail.example\n Тимур Абрамов  | timur@mail.example\n Яна Кудрявцева | yana@mail.example\n(4 строки)",
  ],
  "sql-where-year-not-between": [
    " title                    | published_year\n--------------------------+----------------\n Бедные люди              | 1846\n Гордость и предубеждение | 1813\n Норвежский лес           | 1987\n Слово о полку Игореве    | 1800\n Сто лет одиночества      | 1967\n Хроники заводной птицы   | 1995\n(6 строк)",
    " title                 | published_year\n-----------------------+----------------\n Мастер и Маргарита    | 1967\n Повесть временных лет | 1767\n Собачье сердце        | 1987\n(3 строки)",
  ],
  "sql-where-years-in": [
    " title               | published_year\n---------------------+----------------\n Война и мир         | 1869\n Идиот               | 1869\n Норвежский лес      | 1987\n Сто лет одиночества | 1967\n(4 строки)",
    " title              | published_year\n--------------------+----------------\n Мастер и Маргарита | 1967\n Собачье сердце     | 1987\n(2 строки)",
  ],
}
