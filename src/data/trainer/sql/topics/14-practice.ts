import { company, library, shop } from '../datasets'
import type { SqlFixture } from '../fixture'
import { sqlTask, sqlTopic } from '../task'

/** Люди и дружеские связи: каждая пара хранится один раз, меньший номер первым. */
const practiceNetwork: SqlFixture = {
  slug: 'practice-network',
  title: 'Люди и дружба',
  tables: [
    { name: 'people', columns: [['id', 'integer PRIMARY KEY'], ['name', 'text NOT NULL']] },
    {
      name: 'friendships',
      columns: [['person_a', 'integer NOT NULL REFERENCES people (id)'], ['person_b', 'integer NOT NULL REFERENCES people (id)']],
      constraints: ['PRIMARY KEY (person_a, person_b)', 'CHECK (person_a < person_b)'],
    },
  ],
  rows: {
    people: [[1, 'Аня'], [2, 'Боря'], [3, 'Вика'], [4, 'Гоша'], [5, 'Даша'], [6, 'Егор'], [7, 'Жанна'], [8, 'Зоя']],
    friendships: [[1, 2], [1, 3], [2, 3], [2, 4], [3, 5], [4, 5], [4, 6], [5, 7]],
  },
  hidden: [{
    people: [[1, 'Иван'], [2, 'Лена'], [3, 'Макс'], [4, 'Нина'], [5, 'Олег'], [6, 'Петя'], [7, 'Рита'], [8, 'Тоня']],
    friendships: [[1, 2], [1, 3], [2, 4], [3, 4], [4, 5], [5, 6], [2, 7]],
  }],
}

/** Выручка по товарам и месяцам. */
const practiceSales: SqlFixture = {
  slug: 'practice-sales',
  title: 'Выручка по месяцам',
  tables: [{
    name: 'monthly_sales',
    columns: [['id', 'integer PRIMARY KEY'], ['product', 'text NOT NULL'], ['month', 'date NOT NULL'], ['revenue', 'numeric(10, 2) NOT NULL']],
    constraints: ['UNIQUE (product, month)'],
  }],
  rows: {
    monthly_sales: [
      [1, 'Тетради', '2025-10-01', 120000], [2, 'Тетради', '2025-11-01', 135000], [3, 'Тетради', '2025-12-01', 150000],
      [4, 'Тетради', '2026-01-01', 140000], [5, 'Тетради', '2026-02-01', 160000], [6, 'Тетради', '2026-03-01', 175000],
      [7, 'Ручки', '2025-10-01', 80000], [8, 'Ручки', '2025-11-01', 80000], [9, 'Ручки', '2025-12-01', 95000],
      [10, 'Ручки', '2026-01-01', 70000], [11, 'Ручки', '2026-02-01', 90000], [12, 'Ручки', '2026-03-01', 90000],
    ],
  },
  hidden: [{
    monthly_sales: [
      [1, 'Тетради', '2026-01-01', 100000], [2, 'Тетради', '2026-02-01', 90000], [3, 'Тетради', '2026-03-01', 110000], [4, 'Тетради', '2026-04-01', 120000],
      [5, 'Папки', '2026-02-01', 50000], [6, 'Папки', '2026-03-01', 50000], [7, 'Папки', '2026-04-01', 50000],
      [8, 'Маркеры', '2026-04-01', 30000],
    ],
  }],
}

/** Студенты, курсы и результаты: нужен для реляционного деления. */
const practiceCourses: SqlFixture = {
  slug: 'practice-courses',
  title: 'Студенты и курсы',
  tables: [
    { name: 'students', columns: [['id', 'integer PRIMARY KEY'], ['name', 'text NOT NULL']] },
    { name: 'courses', columns: [['id', 'integer PRIMARY KEY'], ['title', 'text NOT NULL'], ['track', 'text NOT NULL']] },
    {
      name: 'enrollments',
      columns: [['student_id', 'integer NOT NULL REFERENCES students (id)'], ['course_id', 'integer NOT NULL REFERENCES courses (id)'], ['passed', 'boolean NOT NULL']],
      constraints: ['PRIMARY KEY (student_id, course_id)'],
    },
  ],
  rows: {
    students: [[1, 'Аня'], [2, 'Боря'], [3, 'Вика'], [4, 'Гоша']],
    courses: [[1, 'SQL', 'backend'], [2, 'Node.js', 'backend'], [3, 'Docker', 'backend'], [4, 'React', 'frontend'], [5, 'CSS', 'frontend']],
    enrollments: [
      [1, 1, true], [1, 2, true], [1, 3, true], [1, 4, true],
      [2, 1, true], [2, 2, true], [2, 3, false],
      [3, 1, true], [3, 2, true], [3, 3, true],
      [4, 4, true], [4, 5, true],
    ],
  },
  hidden: [{
    students: [[1, 'Ира'], [2, 'Костя'], [3, 'Лара'], [4, 'Миша']],
    courses: [[1, 'SQL', 'backend'], [2, 'Redis', 'backend'], [3, 'Docker', 'backend'], [4, 'Vue', 'frontend']],
    enrollments: [
      [1, 1, true], [1, 2, true], [1, 3, true],
      [2, 1, true], [2, 2, true],
      [3, 1, true], [3, 2, false], [3, 3, true],
      [4, 4, true],
    ],
  }],
}

export const sqlPractice = sqlTopic({
  slug: 'sql-practice',
  title: 'SQL: сборные задачи',
  description: 'Отчёты, где соединения, группировка, подзапросы и функции нужны вместе, и оконные функции',
  order: 38,
  tasks: [
    // Магазин
    sqlTask({
      slug: 'sql-practice-shop-customer-totals',
      title: 'Сумма и число заказов покупателя',
      difficulty: 'medium',
      fixture: shop,
      tables: ['customers', 'orders', 'order_items'],
      task: 'Для каждого покупателя выведите имя (`full_name`), число его заказов (`orders_count`) и сумму покупок (`total_spent`), то есть сумму `quantity * price` по всем позициям. Отменённые заказы (`status = \'cancelled\'`) не учитывайте. Покупатели без подходящих заказов должны остаться в результате: у них `orders_count` равен 0, а `total_spent` равен 0. Отсортируйте по `total_spent` от большего к меньшему, при равенстве по `full_name`.',
      solution: `SELECT c.full_name, COUNT(DISTINCT o.id) AS orders_count, COALESCE(SUM(oi.quantity * oi.price), 0) AS total_spent
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id AND o.status <> 'cancelled'
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY c.id, c.full_name
ORDER BY total_spent DESC, c.full_name`,
      ordered: true,
      hints: ['Условие про отменённые заказы нужно положить в ON, а не в WHERE: иначе покупатели без заказов пропадут.', 'После присоединения позиций заказ повторяется по разу на каждую позицию, поэтому заказы считайте через COUNT(DISTINCT ...).'],
      notes: 'LEFT JOIN оставляет покупателей без заказов, а фильтр по статусу в ON не даёт отменённым заказам попасть в сумму. Если вынести его в WHERE, строки с NULL в статусе отсеются, и Полина Гусева исчезнет из отчёта. Заказ с двумя позициями после присоединения занимает две строки, поэтому COUNT(*) завысил бы число заказов, а COUNT(DISTINCT o.id) считает верно. COALESCE превращает NULL суммы в 0.',
      tags: ['sql-joins', 'sql-aggregates'],
    }),
    sqlTask({
      slug: 'sql-practice-shop-not-bought-in-march',
      title: 'Товары без покупок в марте',
      difficulty: 'medium',
      fixture: shop,
      tables: ['products', 'orders', 'order_items'],
      task: 'Выведите номер (`id`) и название (`title`) товаров, которых не было ни в одном заказе, оформленном в марте 2026 года (с 1 марта включительно до 1 апреля). Статус заказа не важен. Отсортируйте по `id`.',
      solution: `SELECT p.id, p.title
FROM products p
WHERE NOT EXISTS (
  SELECT 1
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.product_id = p.id
    AND o.ordered_at >= DATE '2026-03-01'
    AND o.ordered_at < DATE '2026-04-01'
)
ORDER BY p.id`,
      ordered: true,
      hints: ['Границу месяца удобно задавать полуинтервалом: не меньше первого марта и строго меньше первого апреля.'],
      notes: 'NOT EXISTS не боится NULL и не размножает строки. Версия с NOT IN тоже сработает, пока в подзапросе нет NULL, но это случайность данных. Полуинтервал по ordered_at надёжнее BETWEEN: заказ 31 марта в 15:00 при BETWEEN \'2026-03-01\' AND \'2026-03-31\' не попал бы в март.',
      tags: ['sql-subqueries', 'sql-joins'],
    }),
    sqlTask({
      slug: 'sql-practice-shop-category-revenue',
      title: 'Выручка по категориям с пустыми',
      difficulty: 'hard',
      fixture: shop,
      tables: ['categories', 'products', 'orders', 'order_items'],
      task: 'Выведите для каждой категории её название (`title`) и выручку (`revenue`): сумму `quantity * price` по позициям товаров этой категории в заказах, кроме отменённых. Категории без продаж должны остаться в результате с выручкой 0. Товары без категории в отчёт не входят. Отсортируйте по `revenue` от большего к меньшему, при равенстве по `title`.',
      solution: `SELECT cat.title, COALESCE(SUM(s.amount), 0) AS revenue
FROM categories cat
LEFT JOIN products p ON p.category_id = cat.id
LEFT JOIN (
  SELECT oi.product_id, oi.quantity * oi.price AS amount
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.status <> 'cancelled'
) s ON s.product_id = p.id
GROUP BY cat.id, cat.title
ORDER BY revenue DESC, cat.title`,
      ordered: true,
      hints: ['Сначала соберите подзапрос: позиции только неотменённых заказов с суммой по каждой. Потом присоедините его к товарам левым соединением.'],
      notes: 'Если присоединять orders левым соединением после order_items и ставить статус в ON, позиции отменённого заказа всё равно останутся в сумме: у них просто будет пустой заказ. Поэтому фильтр делается внутри подзапроса, где позиции уже связаны с заказами внутренним соединением. Категория без товаров или без продаж даёт одну строку с NULL, а COALESCE делает из неё 0.',
      tags: ['sql-joins', 'sql-subqueries', 'sql-aggregates'],
    }),
    sqlTask({
      slug: 'sql-practice-shop-orders-above-average',
      title: 'Заказы крупнее среднего',
      difficulty: 'medium',
      fixture: shop,
      tables: ['orders', 'order_items'],
      task: 'Посчитайте сумму каждого заказа как сумму `quantity * price` по его позициям, не учитывая отменённые заказы. Выведите номер заказа (`order_id`) и сумму (`total`) для заказов, чья сумма строго больше средней суммы заказа среди тех же неотменённых заказов. Отсортируйте по `total` от большего к меньшему, при равенстве по `order_id`.',
      solution: `WITH totals AS (
  SELECT o.id AS order_id, SUM(oi.quantity * oi.price) AS total
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.status <> 'cancelled'
  GROUP BY o.id
)
SELECT order_id, total
FROM totals
WHERE total > (SELECT AVG(total) FROM totals)
ORDER BY total DESC, order_id`,
      ordered: true,
      hints: ['Среднее считается по суммам заказов, а не по позициям: сначала нужен запрос с одной строкой на заказ.'],
      notes: 'Агрегат над агрегатом: AVG(SUM(...)) в PostgreSQL написать нельзя, поэтому суммы заказов выносят в CTE, и среднее берут уже от них. Частая ошибка - взять AVG(quantity * price) по позициям: получится средняя позиция, а не средний заказ.',
      tags: ['sql-subqueries', 'sql-aggregates'],
    }),
    sqlTask({
      slug: 'sql-practice-shop-above-category-average',
      title: 'Товары дороже среднего по категории',
      difficulty: 'medium',
      fixture: shop,
      tables: ['categories', 'products'],
      task: 'Выведите товары, цена которых выше средней цены товаров их категории: название товара (`product`), название категории (`category`) и цену (`price`). Товары без категории пропустите. Отсортируйте по `category`, затем по `price` от большего к меньшему.',
      solution: `SELECT p.title AS product, c.title AS category, p.price
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE p.price > (SELECT AVG(p2.price) FROM products p2 WHERE p2.category_id = p.category_id)
ORDER BY c.title, p.price DESC`,
      ordered: true,
      hints: ['Подзапрос, который ссылается на строку внешнего запроса, считается заново для каждой строки.'],
      notes: 'Коррелированный подзапрос берёт среднее по той же категории, что и текущий товар. У товара без категории условие category_id = NULL не выполняется, среднее остаётся NULL, и сравнение отбрасывает строку; соединение с categories сделало бы то же самое. Если в категории один товар, он не больше собственного среднего и в ответ не попадёт.',
      tags: ['sql-subqueries', 'sql-joins'],
    }),
    sqlTask({
      slug: 'sql-practice-shop-active-months',
      title: 'Покупатели, заказывавшие в разные месяцы',
      difficulty: 'medium',
      fixture: shop,
      tables: ['customers', 'orders'],
      task: 'Выведите покупателей, у которых неотменённые заказы приходятся минимум на два разных календарных месяца: имя (`full_name`) и число таких месяцев (`active_months`). Месяцы считайте вместе с годом: январь 2026 и январь 2027 - разные месяцы. Отсортируйте по `active_months` от большего к меньшему, при равенстве по `full_name`.',
      solution: `SELECT c.full_name, COUNT(DISTINCT date_trunc('month', o.ordered_at)) AS active_months
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.status <> 'cancelled'
GROUP BY c.id, c.full_name
HAVING COUNT(DISTINCT date_trunc('month', o.ordered_at)) >= 2
ORDER BY active_months DESC, c.full_name`,
      ordered: true,
      hints: ['date_trunc(\'month\', дата) обрезает дату до первого числа месяца вместе с годом.'],
      notes: 'Если взять только EXTRACT(MONTH ...), январь разных лет сольётся в один месяц. date_trunc сохраняет год. Два заказа в одном месяце считаются один раз благодаря DISTINCT, а HAVING отбирает группы после подсчёта.',
      tags: ['sql-aggregates', 'sql-functions'],
    }),
    sqlTask({
      slug: 'sql-practice-shop-order-composition',
      title: 'Состав заказов в одну строку',
      difficulty: 'medium',
      fixture: shop,
      tables: ['products', 'orders', 'order_items'],
      task: 'Для заказов со статусом `shipped` или `paid` выведите номер заказа (`order_id`), названия товаров через запятую с пробелом в алфавитном порядке (`items`) и сумму заказа (`total`) как сумму `quantity * price`. Отсортируйте по `order_id`.',
      solution: `SELECT o.id AS order_id,
       string_agg(p.title, ', ' ORDER BY p.title) AS items,
       SUM(oi.quantity * oi.price) AS total
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN products p ON p.id = oi.product_id
WHERE o.status IN ('shipped', 'paid')
GROUP BY o.id
ORDER BY o.id`,
      ordered: true,
      hints: ['Порядок внутри склейки задаётся ORDER BY прямо в скобках string_agg.'],
      notes: 'string_agg склеивает значения группы в одну строку. Без ORDER BY внутри скобок порядок названий не определён и может поменяться между запусками. Сумма и склейка считаются в одном проходе по трём таблицам, потому что у каждой позиции ровно один товар и ровно один заказ, строки не размножаются.',
      tags: ['sql-aggregates', 'sql-joins', 'strings'],
    }),
    sqlTask({
      slug: 'sql-practice-shop-days-to-first-order',
      title: 'Дней от регистрации до первого заказа',
      difficulty: 'medium',
      fixture: shop,
      tables: ['customers', 'orders'],
      task: 'Для каждого покупателя, у которого есть хотя бы один заказ любого статуса, выведите имя (`full_name`) и число дней от даты регистрации (`registered_on`) до даты первого заказа (`days_to_first_order`). Отсортируйте по `days_to_first_order` от большего к меньшему, при равенстве по `full_name`.',
      solution: `SELECT c.full_name, MIN(o.ordered_at)::date - c.registered_on AS days_to_first_order
FROM customers c
JOIN orders o ON o.customer_id = c.id
GROUP BY c.id, c.full_name, c.registered_on
ORDER BY days_to_first_order DESC, c.full_name`,
      ordered: true,
      hints: ['Разность двух значений типа date в PostgreSQL - целое число дней. Время суток нужно отбросить приведением ::date.'],
      notes: 'MIN по ordered_at находит первый заказ, приведение к date убирает время. Столбец registered_on не агрегируется, поэтому он обязан войти в GROUP BY. Покупатели без заказов отсеиваются внутренним соединением.',
      tags: ['sql-aggregates', 'sql-functions'],
    }),
    sqlTask({
      slug: 'sql-practice-shop-cancelled-share',
      title: 'Доля отменённых заказов',
      difficulty: 'medium',
      fixture: shop,
      tables: ['customers', 'orders'],
      task: 'Для покупателей, у которых есть хотя бы один отменённый заказ, выведите имя (`full_name`) и долю отменённых заказов среди всех их заказов в процентах, округлённую до одного знака после запятой (`cancelled_percent`). Отсортируйте по `cancelled_percent` от большего к меньшему, при равенстве по `full_name`.',
      solution: `SELECT c.full_name,
       ROUND(100.0 * COUNT(*) FILTER (WHERE o.status = 'cancelled') / COUNT(*), 1) AS cancelled_percent
FROM customers c
JOIN orders o ON o.customer_id = c.id
GROUP BY c.id, c.full_name
HAVING COUNT(*) FILTER (WHERE o.status = 'cancelled') > 0
ORDER BY cancelled_percent DESC, c.full_name`,
      ordered: true,
      hints: ['COUNT(*) FILTER (WHERE условие) считает только строки, подходящие под условие, внутри одной группы.'],
      notes: 'Здесь нужны две цифры из одной группы: все заказы и отменённые. Фильтр в WHERE убрал бы лишнее для обеих, поэтому условие встроено в агрегат через FILTER. Число 100.0 с десятичной точкой нужно, чтобы деление не стало целочисленным и не обнулилось.',
      tags: ['sql-aggregates'],
    }),
    sqlTask({
      slug: 'sql-practice-shop-city-report',
      title: 'Отчёт по городам',
      difficulty: 'medium',
      fixture: shop,
      tables: ['customers', 'orders'],
      task: 'Для каждого города выведите его название (`city`), число покупателей (`customers_count`) и число неотменённых заказов этих покупателей (`orders_count`). Покупателей без города объедините в одну строку с названием `не указан`. Города без заказов остаются с нулём. Отсортируйте по `orders_count` от большего к меньшему, при равенстве по `city`.',
      solution: `SELECT COALESCE(c.city, 'не указан') AS city,
       COUNT(DISTINCT c.id) AS customers_count,
       COUNT(o.id) AS orders_count
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id AND o.status <> 'cancelled'
GROUP BY COALESCE(c.city, 'не указан')
ORDER BY orders_count DESC, city`,
      ordered: true,
      hints: ['Группировать можно по выражению. NULL-значения города попадают в одну группу и без COALESCE, но имя у неё будет пустым.'],
      notes: 'Покупатели считаются через COUNT(DISTINCT c.id), потому что после присоединения заказов покупатель повторяется по разу на заказ. Заказы считаются через COUNT(o.id): у покупателя без заказов в этом столбце NULL, и он не добавляет единицу. COUNT(*) тут дал бы 1 для города без заказов.',
      tags: ['sql-joins', 'sql-aggregates'],
    }),
    // Компания
    sqlTask({
      slug: 'sql-practice-company-departments-above-average',
      title: 'Отделы с зарплатой выше общей средней',
      difficulty: 'medium',
      fixture: company,
      tables: ['departments', 'employees'],
      task: 'Выведите отделы, у которых средняя зарплата сотрудников выше средней зарплаты по всей компании (по всем сотрудникам, в том числе без отдела). Столбцы: название отдела (`department`) и средняя зарплата отдела, округлённая до двух знаков (`avg_salary`). Отсортируйте по `avg_salary` от большего к меньшему, при равенстве по `department`.',
      solution: `SELECT d.name AS department, ROUND(AVG(e.salary), 2) AS avg_salary
FROM departments d
JOIN employees e ON e.department_id = d.id
GROUP BY d.id, d.name
HAVING AVG(e.salary) > (SELECT AVG(salary) FROM employees)
ORDER BY avg_salary DESC, d.name`,
      ordered: true,
      hints: ['Условие на среднее по группе пишется в HAVING, а общее среднее берётся скалярным подзапросом.'],
      notes: 'WHERE работает до группировки и не видит AVG по группе, поэтому условие стоит в HAVING. Общее среднее считается отдельным подзапросом по всей таблице, без соединения: иначе сотрудник без отдела выпал бы из подсчёта и среднее сместилось.',
      tags: ['sql-aggregates', 'sql-subqueries'],
    }),
    sqlTask({
      slug: 'sql-practice-company-above-department-average',
      title: 'Зарплата выше средней по отделу',
      difficulty: 'medium',
      fixture: company,
      tables: ['departments', 'employees'],
      task: 'Выведите сотрудников, чья зарплата выше средней зарплаты их отдела: имя (`full_name`), название отдела (`department`) и зарплату (`salary`). Сотрудников без отдела пропустите. Отсортируйте по `department`, затем по `salary` от большего к меньшему, затем по `full_name`.',
      solution: `SELECT e.full_name, d.name AS department, e.salary
FROM employees e
JOIN departments d ON d.id = e.department_id
WHERE e.salary > (SELECT AVG(e2.salary) FROM employees e2 WHERE e2.department_id = e.department_id)
ORDER BY d.name, e.salary DESC, e.full_name`,
      ordered: true,
      notes: 'Подзапрос ссылается на department_id внешней строки и поэтому считает среднее по отделу именно этого сотрудника. Сотрудник с зарплатой, равной среднему, в ответ не попадает: сравнение строгое. В отделе из одного человека зарплата всегда равна среднему, и такой отдел в отчёте не появится.',
      tags: ['sql-subqueries', 'sql-joins'],
    }),
    sqlTask({
      slug: 'sql-practice-company-headcount',
      title: 'Штат и фонд зарплаты отделов',
      difficulty: 'medium',
      fixture: company,
      tables: ['departments', 'employees'],
      task: 'Для каждого отдела выведите название (`department`), число сотрудников (`employees_count`) и суммарную зарплату (`payroll`). Пустые отделы остаются в отчёте с нулями. Отсортируйте по `payroll` от большего к меньшему, при равенстве по `department`.',
      solution: `SELECT d.name AS department, COUNT(e.id) AS employees_count, COALESCE(SUM(e.salary), 0) AS payroll
FROM departments d
LEFT JOIN employees e ON e.department_id = d.id
GROUP BY d.id, d.name
ORDER BY payroll DESC, d.name`,
      ordered: true,
      notes: 'COUNT(e.id) не считает NULL, поэтому в пустом отделе получается 0, а COUNT(*) дал бы 1: строка отдела с пустой правой частью всё равно строка. SUM по пустой группе возвращает NULL, и COALESCE заменяет его нулём.',
      tags: ['sql-joins', 'sql-aggregates'],
    }),
    sqlTask({
      slug: 'sql-practice-company-managers-reports',
      title: 'Руководители и число подчинённых',
      difficulty: 'medium',
      fixture: company,
      tables: ['employees'],
      task: 'Выведите каждого сотрудника, у которого есть хотя бы один подчинённый: имя (`manager`) и число прямых подчинённых (`reports_count`). Подчинённый - тот, чей `manager_id` равен номеру сотрудника. Отсортируйте по `reports_count` от большего к меньшему, при равенстве по `manager`.',
      solution: `SELECT m.full_name AS manager, COUNT(*) AS reports_count
FROM employees m
JOIN employees e ON e.manager_id = m.id
GROUP BY m.id, m.full_name
ORDER BY reports_count DESC, manager`,
      ordered: true,
      hints: ['Одну и ту же таблицу присоединяют к самой себе под двумя псевдонимами: один для руководителя, другой для подчинённого.'],
      notes: 'Самосоединение связывает строку руководителя со строками подчинённых. Внутреннее соединение само отсекает тех, у кого подчинённых нет. Группировка идёт по руководителю, а считаются строки подчинённых.',
      tags: ['sql-joins', 'sql-aggregates'],
    }),
    sqlTask({
      slug: 'sql-practice-company-salary-gap',
      title: 'Разрыв с зарплатой руководителя',
      difficulty: 'medium',
      fixture: company,
      tables: ['employees'],
      task: 'Для сотрудников, у которых указан руководитель, выведите имя сотрудника (`employee`), имя руководителя (`manager`) и разницу между зарплатой руководителя и сотрудника (`gap`). Отсортируйте по `gap` от большего к меньшему, при равенстве по `employee`.',
      solution: `SELECT e.full_name AS employee, m.full_name AS manager, m.salary - e.salary AS gap
FROM employees e
JOIN employees m ON m.id = e.manager_id
ORDER BY gap DESC, employee`,
      ordered: true,
      notes: 'Теперь строка сотрудника связывается с одной строкой руководителя, поэтому строки не размножаются. Разница может быть и отрицательной, если подчинённый получает больше: знак вычитания определяет порядок вычитаемых, поэтому его проверяют на одной строке вручную.',
      tags: ['sql-joins'],
    }),
    sqlTask({
      slug: 'sql-practice-company-average-tenure',
      title: 'Средний стаж по отделам',
      difficulty: 'medium',
      fixture: company,
      tables: ['departments', 'employees'],
      task: 'Считайте, что сегодня 15 апреля 2026 года. Для каждого отдела, в котором есть сотрудники, выведите название (`department`) и средний стаж в годах, округлённый до одного знака (`avg_years`). Стаж сотрудника - число дней с даты приёма до сегодняшней даты, делённое на 365.25. Отсортируйте по `avg_years` от большего к меньшему, при равенстве по `department`.',
      solution: `SELECT d.name AS department, ROUND(AVG((DATE '2026-04-15' - e.hire_date) / 365.25), 1) AS avg_years
FROM departments d
JOIN employees e ON e.department_id = d.id
GROUP BY d.id, d.name
ORDER BY avg_years DESC, d.name`,
      ordered: true,
      notes: 'Разность дат даёт целое число дней. Делить нужно на число с дробной частью, иначе целочисленное деление отбросит остаток. «Сегодня» задано датой в условии, поэтому отчёт воспроизводим: now() дал бы другой ответ завтра.',
      tags: ['sql-functions', 'sql-aggregates'],
    }),
    sqlTask({
      slug: 'sql-practice-company-age-groups',
      title: 'Возрастные группы сотрудников',
      difficulty: 'medium',
      fixture: company,
      tables: ['employees'],
      task: 'Считайте, что сегодня 1 января 2026 года. Разбейте сотрудников по полным годам на группы: `до 30` (младше 30), `30-39` и `40+`. Выведите название группы (`age_group`) и число сотрудников (`employees_count`). Пустые группы не показывайте. Отсортируйте от младшей группы к старшей.',
      solution: `SELECT CASE
         WHEN age_years < 30 THEN 'до 30'
         WHEN age_years < 40 THEN '30-39'
         ELSE '40+'
       END AS age_group,
       COUNT(*) AS employees_count
FROM (
  SELECT EXTRACT(YEAR FROM AGE(DATE '2026-01-01', birth_date)) AS age_years
  FROM employees
) t
GROUP BY 1
ORDER BY MIN(age_years)`,
      ordered: true,
      hints: ['AGE(дата1, дата2) возвращает интервал в годах, месяцах и днях, а EXTRACT(YEAR FROM ...) достаёт из него полные годы.', 'Группировать можно по номеру столбца из SELECT: GROUP BY 1.'],
      notes: 'Возраст считается через AGE, а не как разность годов: разность годов ошибается на единицу у тех, чей день рождения ещё впереди. CASE вычисляется в подзапросе до группировки, а сортировка идёт по минимальному возрасту группы, потому что по тексту «30-39» и «до 30» упорядочились бы алфавитом.',
      tags: ['sql-functions', 'sql-aggregates'],
    }),
    sqlTask({
      slug: 'sql-practice-company-close-salary-pairs',
      title: 'Коллеги с близкой зарплатой',
      difficulty: 'hard',
      fixture: company,
      tables: ['employees'],
      task: 'Найдите пары сотрудников одного отдела, чьи зарплаты различаются не более чем на 10000. Каждую пару выведите один раз: имя сотрудника с меньшим `id` (`first_employee`), имя второго (`second_employee`) и разницу зарплат (`salary_gap`, неотрицательная). Сотрудников без отдела не рассматривайте. Отсортируйте по `salary_gap`, затем по `first_employee`, затем по `second_employee`.',
      solution: `SELECT a.full_name AS first_employee, b.full_name AS second_employee, ABS(a.salary - b.salary) AS salary_gap
FROM employees a
JOIN employees b ON b.department_id = a.department_id AND a.id < b.id
WHERE ABS(a.salary - b.salary) <= 10000
ORDER BY salary_gap, first_employee, second_employee`,
      ordered: true,
      hints: ['Условие a.id < b.id оставляет каждую пару в одном порядке и убирает пару сотрудника с самим собой.'],
      notes: 'Без a.id < b.id каждая пара появится дважды, а сотрудник попадёт в пару с собой. Равенство department_id по NULL никогда не истинно, поэтому сотрудники без отдела отпадают сами, отдельный фильтр не нужен.',
      tags: ['sql-joins'],
    }),
    // Библиотека
    sqlTask({
      slug: 'sql-practice-library-top-author-pages',
      title: 'Автор с наибольшим числом страниц',
      difficulty: 'medium',
      fixture: library,
      tables: ['authors', 'books'],
      task: 'Найдите автора, у которого суммарное число страниц всех его книг наибольшее. Выведите имя (`full_name`) и сумму страниц (`total_pages`). Если авторов с такой суммой несколько, выберите автора с меньшим `id`.',
      solution: `SELECT a.full_name, SUM(b.pages) AS total_pages
FROM authors a
JOIN books b ON b.author_id = a.id
GROUP BY a.id, a.full_name
ORDER BY total_pages DESC, a.id
LIMIT 1`,
      hints: ['Сортировка по сумме по убыванию и LIMIT 1 дадут лучшего. Второй ключ сортировки разрешает ничью.'],
      notes: 'Строка с наибольшим значением по группе: сгруппировать, отсортировать по агрегату и взять первую. Без второго ключа при равных суммах ответ зависел бы от порядка строк в таблице. Книги без автора в группировку не попадают из-за внутреннего соединения.',
      tags: ['sql-aggregates', 'sql-joins', 'sorting'],
    }),
    sqlTask({
      slug: 'sql-practice-library-authors-without-books',
      title: 'Авторы без книг',
      difficulty: 'medium',
      fixture: library,
      tables: ['authors', 'books'],
      task: 'Выведите номер (`id`) и имя (`full_name`) авторов, у которых в таблице `books` нет ни одной книги. Отсортируйте по `id`.',
      solution: `SELECT a.id, a.full_name
FROM authors a
LEFT JOIN books b ON b.author_id = a.id
WHERE b.id IS NULL
ORDER BY a.id`,
      ordered: true,
      notes: 'Левое соединение сохраняет авторов без книг и заполняет столбцы книги значением NULL, а условие IS NULL по ключу книги оставляет именно их. Проверять на NULL нужно столбец правой таблицы, который в обычной строке заведомо не пуст: id подходит.',
      tags: ['sql-joins'],
    }),
    sqlTask({
      slug: 'sql-practice-library-above-genre-average',
      title: 'Книги дороже средней в жанре',
      difficulty: 'medium',
      fixture: library,
      tables: ['books'],
      task: 'Выведите книги, цена которых выше средней цены книг того же жанра: название (`title`), жанр (`genre`) и цену (`price`). Книги без цены не участвуют ни в сравнении, ни в среднем. Отсортируйте по `genre`, затем по `price` от большего к меньшему, затем по `title`.',
      solution: `SELECT b.title, b.genre, b.price
FROM books b
WHERE b.price > (SELECT AVG(b2.price) FROM books b2 WHERE b2.genre = b.genre)
ORDER BY b.genre, b.price DESC, b.title`,
      ordered: true,
      notes: 'AVG пропускает NULL сам, а сравнение с NULL никогда не истинно, поэтому книги без цены отсеиваются без дополнительных условий. Коррелированный подзапрос считает среднее для жанра каждой строки внешнего запроса.',
      tags: ['sql-subqueries', 'sql-aggregates'],
    }),
    sqlTask({
      slug: 'sql-practice-library-genre-report',
      title: 'Отчёт по жанрам',
      difficulty: 'medium',
      fixture: library,
      tables: ['books'],
      task: 'Для жанров, в которых есть минимум две книги, выведите жанр (`genre`), число книг (`books_count`) и среднюю цену, округлённую до двух знаков (`avg_price`). Книги без цены входят в число книг, но не в среднюю цену. Отсортируйте по `books_count` от большего к меньшему, при равенстве по `genre`.',
      solution: `SELECT genre, COUNT(*) AS books_count, ROUND(AVG(price), 2) AS avg_price
FROM books
GROUP BY genre
HAVING COUNT(*) >= 2
ORDER BY books_count DESC, genre`,
      ordered: true,
      notes: 'COUNT(*) считает строки вместе с NULL в цене, а AVG(price) пропускает их. Оба числа берутся из одной группы, поэтому у жанра с неизвестной ценой книга учтена в счётчике, но не в среднем. Условие на размер группы стоит в HAVING.',
      tags: ['sql-aggregates'],
    }),
    sqlTask({
      slug: 'sql-practice-library-centuries',
      title: 'Книги по векам',
      difficulty: 'medium',
      fixture: library,
      tables: ['books'],
      task: 'Посчитайте книги по векам издания. Век определяется так: годы 1801-1900 относятся к 19 веку, 1901-2000 к 20 веку, и так далее (год 1800 - это 18 век). Выведите номер века (`century`) и число книг (`books_count`), отсортировав по `century`.',
      solution: `SELECT (published_year - 1) / 100 + 1 AS century, COUNT(*) AS books_count
FROM books
GROUP BY 1
ORDER BY century`,
      ordered: true,
      hints: ['Целочисленное деление отбрасывает дробную часть: (год - 1) / 100 даёт число полных веков до начала нужного.'],
      notes: 'Формула (год - 1) / 100 + 1 корректно обрабатывает границы: 1900 и 1901 попадают в разные века. Простое год / 100 + 1 отнесло бы 1900 к 20 веку. Деление целых чисел в PostgreSQL целочисленное, поэтому отдельное округление не нужно.',
      tags: ['sql-functions', 'sql-aggregates'],
    }),
    sqlTask({
      slug: 'sql-practice-library-youngest-authors',
      title: 'Книги, написанные в молодом возрасте',
      difficulty: 'medium',
      fixture: library,
      tables: ['authors', 'books'],
      task: 'Для каждой книги с известным автором вычислите возраст автора в год издания как `published_year - birth_year`. Выведите три книги с наименьшим возрастом: название (`title`), имя автора (`author`) и возраст (`age_at_publication`). Если возрасты равны, выше идёт книга с меньшим `id`. Отсортируйте по возрасту, затем по `id` книги.',
      solution: `SELECT b.title, a.full_name AS author, b.published_year - a.birth_year AS age_at_publication
FROM books b
JOIN authors a ON a.id = b.author_id
ORDER BY age_at_publication, b.id
LIMIT 3`,
      ordered: true,
      notes: 'LIMIT без однозначной сортировки отдаёт любые из равных строк, поэтому вторым ключом идёт id книги. Сортировать можно по псевдониму вычисляемого столбца. Книги без автора отсекает внутреннее соединение.',
      tags: ['sql-joins', 'sorting'],
    }),
    sqlTask({
      slug: 'sql-practice-library-multi-genre-authors',
      title: 'Авторы нескольких жанров',
      difficulty: 'medium',
      fixture: library,
      tables: ['authors', 'books'],
      task: 'Выведите авторов, которые писали минимум в двух разных жанрах: имя (`full_name`) и число жанров (`genres_count`). Отсортируйте по `genres_count` от большего к меньшему, при равенстве по `full_name`.',
      solution: `SELECT a.full_name, COUNT(DISTINCT b.genre) AS genres_count
FROM authors a
JOIN books b ON b.author_id = a.id
GROUP BY a.id, a.full_name
HAVING COUNT(DISTINCT b.genre) >= 2
ORDER BY genres_count DESC, a.full_name`,
      ordered: true,
      notes: 'COUNT(*) считал бы книги, а нужно число разных жанров, поэтому DISTINCT внутри COUNT. Книга с пустым жанром в подсчёт не попадёт: COUNT(DISTINCT ...) пропускает NULL.',
      tags: ['sql-aggregates', 'sql-joins'],
    }),
    sqlTask({
      slug: 'sql-practice-library-country-report',
      title: 'Отчёт по странам авторов',
      difficulty: 'medium',
      fixture: library,
      tables: ['authors', 'books'],
      task: 'Для каждой страны выведите название (`country`), число авторов (`authors_count`) и число их книг (`books_count`). Авторы без книг считаются авторами, но книг не добавляют. Отсортируйте по `books_count` от большего к меньшему, при равенстве по `country`.',
      solution: `SELECT a.country, COUNT(DISTINCT a.id) AS authors_count, COUNT(b.id) AS books_count
FROM authors a
LEFT JOIN books b ON b.author_id = a.id
GROUP BY a.country
ORDER BY books_count DESC, a.country`,
      ordered: true,
      notes: 'После присоединения книг автор повторяется по разу на каждую книгу, поэтому авторов считает COUNT(DISTINCT a.id), а книги - COUNT(b.id), который пропускает NULL от авторов без книг. COUNT(*) завысил бы книги на единицу у каждого такого автора.',
      tags: ['sql-joins', 'sql-aggregates'],
    }),
    sqlTask({
      slug: 'sql-practice-library-titles-per-author',
      title: 'Книги автора по годам одной строкой',
      difficulty: 'medium',
      fixture: library,
      tables: ['authors', 'books'],
      task: 'Для авторов, у которых минимум две книги, выведите имя (`author`), число книг (`books_count`) и названия книг через `; ` в порядке года издания, а при равных годах по `id` книги (`titles`). Отсортируйте по `books_count` от большего к меньшему, при равенстве по `author`.',
      solution: `SELECT a.full_name AS author, COUNT(*) AS books_count, string_agg(b.title, '; ' ORDER BY b.published_year, b.id) AS titles
FROM authors a
JOIN books b ON b.author_id = a.id
GROUP BY a.id, a.full_name
HAVING COUNT(*) >= 2
ORDER BY books_count DESC, author`,
      ordered: true,
      notes: 'В string_agg порядок склейки задаётся собственным ORDER BY в скобках и не зависит от общей сортировки результата. Для равных годов нужен второй ключ, иначе порядок названий внутри строки может измениться.',
      tags: ['sql-aggregates', 'strings'],
    }),
    sqlTask({
      slug: 'sql-practice-library-all-before-1950',
      title: 'Авторы, чьи книги все вышли до 1950 года',
      difficulty: 'medium',
      fixture: library,
      tables: ['authors', 'books'],
      task: 'Выведите авторов, у которых есть хотя бы одна книга и все книги изданы до 1950 года. Столбцы: `id` и имя (`full_name`). Отсортируйте по `id`.',
      solution: `SELECT a.id, a.full_name
FROM authors a
JOIN books b ON b.author_id = a.id
GROUP BY a.id, a.full_name
HAVING MAX(b.published_year) < 1950
ORDER BY a.id`,
      ordered: true,
      hints: ['Условие «все не позже» равносильно условию «самая поздняя не позже».'],
      notes: 'Выражение «для всех» часто сводится к экстремуму: все книги раньше 1950 года тогда и только тогда, когда раньше самая поздняя. Внутреннее соединение отсеивает авторов без книг, у которых условие «все» выполнялось бы вхолостую. Если в году бывают NULL, MAX их игнорирует, и такие книги придётся обрабатывать отдельно.',
      tags: ['sql-aggregates', 'sql-joins'],
    }),
    sqlTask({
      slug: 'sql-practice-courses-passed-all-backend',
      title: 'Прошли все курсы направления',
      difficulty: 'hard',
      fixture: practiceCourses,
      task: 'Выведите студентов, которые успешно прошли (`passed = true`) все курсы направления `backend`. Столбцы: `id` и имя (`name`). Отсортируйте по `id`. Число курсов направления в запрос не подставляйте: оно может меняться.',
      solution: `SELECT s.id, s.name
FROM students s
JOIN enrollments e ON e.student_id = s.id AND e.passed
JOIN courses c ON c.id = e.course_id AND c.track = 'backend'
GROUP BY s.id, s.name
HAVING COUNT(*) = (SELECT COUNT(*) FROM courses WHERE track = 'backend')
ORDER BY s.id`,
      ordered: true,
      hints: ['Реляционное деление: посчитайте, сколько курсов направления прошёл студент, и сравните с общим числом курсов направления.'],
      notes: 'Это реляционное деление: студент подходит, если число пройденных им курсов направления равно числу всех таких курсов. Фильтры по passed и по направлению стоят в соединении, чтобы считать только подходящие записи. Пара (студент, курс) в enrollments уникальна, поэтому дубли не завысят счётчик; без такой гарантии пришлось бы считать COUNT(DISTINCT c.id).',
      tags: ['sql-aggregates', 'sql-subqueries', 'sql-joins'],
    }),
    // Граф связей
    sqlTask({
      slug: 'sql-practice-network-friends-of-friends',
      title: 'Друзья друзей',
      difficulty: 'hard',
      fixture: practiceNetwork,
      task: 'Предложите знакомства человеку с `id = 1`: выведите номер (`id`) и имя (`name`) людей, которые дружат с кем-то из его друзей, но сам этот человек им не друг и не он сам. Каждый человек должен встретиться один раз. Каждая дружба записана в `friendships` один раз: пара (`person_a`, `person_b`) означает дружбу в обе стороны. Отсортируйте по `id`.',
      solution: `WITH links AS (
  SELECT person_a AS who, person_b AS friend FROM friendships
  UNION ALL
  SELECT person_b, person_a FROM friendships
)
SELECT DISTINCT p.id, p.name
FROM links f1
JOIN links f2 ON f2.who = f1.friend
JOIN people p ON p.id = f2.friend
WHERE f1.who = 1
  AND p.id <> 1
  AND NOT EXISTS (SELECT 1 FROM links d WHERE d.who = 1 AND d.friend = p.id)
ORDER BY p.id`,
      ordered: true,
      hints: ['Так как пара хранится один раз, сначала разверните связи в обе стороны через UNION ALL.', 'Из найденных исключите самого человека и тех, кто уже входит в его друзей.'],
      notes: 'Дружба симметрична, а в таблице пара записана единожды, поэтому связи сначала записывают в обоих направлениях. Дальше два шага по связям: друзья человека, затем их друзья. DISTINCT нужен, потому что общий знакомый приведёт к одному человеку несколькими путями. Фильтры убирают самого человека и тех, с кем он уже дружит.',
      tags: ['sql-joins', 'sql-subqueries'],
    }),
    sqlTask({
      slug: 'sql-practice-network-common-friends',
      title: 'Пары с общими друзьями',
      difficulty: 'hard',
      fixture: practiceNetwork,
      task: 'Найдите пары людей, которые не дружат между собой, но имеют минимум двух общих друзей. Выведите имя человека с меньшим `id` (`first_person`), имя второго (`second_person`) и число общих друзей (`common_friends`). Отсортируйте по `common_friends` от большего к меньшему, затем по `first_person`, затем по `second_person`.',
      solution: `WITH links AS (
  SELECT person_a AS who, person_b AS friend FROM friendships
  UNION ALL
  SELECT person_b, person_a FROM friendships
)
SELECT p1.name AS first_person, p2.name AS second_person, COUNT(*) AS common_friends
FROM links l1
JOIN links l2 ON l2.friend = l1.friend AND l1.who < l2.who
JOIN people p1 ON p1.id = l1.who
JOIN people p2 ON p2.id = l2.who
WHERE NOT EXISTS (
  SELECT 1 FROM friendships f WHERE f.person_a = l1.who AND f.person_b = l2.who
)
GROUP BY p1.id, p1.name, p2.id, p2.name
HAVING COUNT(*) >= 2
ORDER BY common_friends DESC, first_person, second_person`,
      ordered: true,
      hints: ['Общий друг - это человек, который встречается в паре связей с одной и той же стороны. Условие l1.who < l2.who не даёт паре повториться.'],
      notes: 'Две связи с одним и тем же другом означают общего знакомого, а группировка по паре считает таких знакомых. Проверка NOT EXISTS идёт по исходной таблице, где меньший номер всегда первый, поэтому порядок в паре l1.who < l2.who совпадает с порядком хранения.',
      tags: ['sql-joins', 'sql-aggregates', 'sql-subqueries'],
    }),
    sqlTask({
      slug: 'sql-practice-network-popularity',
      title: 'Число друзей у каждого',
      difficulty: 'medium',
      fixture: practiceNetwork,
      task: 'Для каждого человека выведите имя (`name`) и число его друзей (`friends_count`). Люди без друзей остаются с нулём. Отсортируйте по `friends_count` от большего к меньшему, при равенстве по `name`.',
      solution: `WITH links AS (
  SELECT person_a AS who FROM friendships
  UNION ALL
  SELECT person_b FROM friendships
)
SELECT p.name, COUNT(l.who) AS friends_count
FROM people p
LEFT JOIN links l ON l.who = p.id
GROUP BY p.id, p.name
ORDER BY friends_count DESC, p.name`,
      ordered: true,
      notes: 'Каждая пара даёт по одному другу обоим участникам, поэтому столбцы person_a и person_b склеиваются через UNION ALL, а не UNION: UNION схлопнул бы повторы, которые здесь нужно считать. Левое соединение оставляет людей без друзей, а COUNT по столбцу правой стороны даёт для них 0.',
      tags: ['sql-joins', 'sql-aggregates'],
    }),
    // Оконные функции
    sqlTask({
      slug: 'sql-practice-window-salary-place',
      title: 'Место по зарплате в отделе',
      difficulty: 'medium',
      fixture: company,
      tables: ['employees'],
      task: 'Для сотрудников с отделом выведите имя (`full_name`), номер отдела (`department_id`), зарплату (`salary`) и порядковый номер внутри отдела по убыванию зарплаты (`place`, начиная с 1). При равных зарплатах раньше идёт сотрудник с меньшим `id`. Отсортируйте по `department_id`, затем по `place`.',
      solution: `SELECT full_name, department_id, salary,
       ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY salary DESC, id) AS place
FROM employees
WHERE department_id IS NOT NULL
ORDER BY department_id, place`,
      ordered: true,
      hints: ['PARTITION BY делит строки на группы, ORDER BY внутри OVER задаёт порядок нумерации в каждой группе.'],
      notes: 'Оконная функция не схлопывает строки, как GROUP BY: каждая строка остаётся, а рядом появляется номер. Внутри OVER добавлен второй ключ id, без него номера при равных зарплатах распределились бы произвольно. Фильтр WHERE выполняется раньше окна, поэтому сотрудники без отдела не создают отдельной группы.',
      tags: ['sql-functions'],
    }),
    sqlTask({
      slug: 'sql-practice-window-top-paid-per-department',
      title: 'Самый высокооплачиваемый в отделе',
      difficulty: 'medium',
      fixture: company,
      tables: ['employees'],
      task: 'Для каждого отдела выведите одного сотрудника с наибольшей зарплатой: `department_id`, имя (`full_name`) и зарплату (`salary`). Если таких несколько, берите сотрудника с меньшим `id`. Сотрудников без отдела пропустите. Отсортируйте по `department_id`.',
      solution: `SELECT department_id, full_name, salary
FROM (
  SELECT department_id, full_name, salary,
         ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY salary DESC, id) AS rn
  FROM employees
  WHERE department_id IS NOT NULL
) t
WHERE rn = 1
ORDER BY department_id`,
      ordered: true,
      hints: ['Результат оконной функции нельзя использовать в WHERE того же запроса, поэтому нумерацию выносят в подзапрос.'],
      notes: 'Классический приём для максимума в каждой группе: пронумеровать строки в группе и оставить первую. Фильтровать по rn прямо в запросе с окном нельзя: WHERE выполняется до вычисления окна. Способ с MAX и соединением вернул бы обоих при равных зарплатах, а нумерация с явным вторым ключом выбирает ровно одного.',
      tags: ['sql-functions', 'sql-subqueries'],
    }),
    sqlTask({
      slug: 'sql-practice-window-dense-rank-years',
      title: 'Места книг по году издания',
      difficulty: 'medium',
      fixture: library,
      tables: ['books'],
      task: 'Для книг с известным годом издания выведите название (`title`), год (`published_year`) и место по убыванию года (`place`): самый поздний год получает место 1, книги одного года делят место, а следующее место идёт без пропусков. Отсортируйте по `place`, затем по `title`.',
      solution: `SELECT title, published_year,
       DENSE_RANK() OVER (ORDER BY published_year DESC) AS place
FROM books
WHERE published_year IS NOT NULL
ORDER BY place, title`,
      ordered: true,
      hints: ['RANK оставляет пропуски после ничьей, DENSE_RANK - нет.'],
      notes: 'ROW_NUMBER не подходит: он разведёт книги одного года по разным номерам. RANK при двух книгах на месте 3 следующее место назвал бы 5, а DENSE_RANK назовёт 4. Здесь по условию места идут подряд, поэтому DENSE_RANK.',
      tags: ['sql-functions'],
    }),
    sqlTask({
      slug: 'sql-practice-window-top-months-rank',
      title: 'Лучшие месяцы каждого товара',
      difficulty: 'hard',
      fixture: practiceSales,
      task: 'Для каждого товара присвойте месяцам место по убыванию выручки функцией RANK (`place`): месяцы с одинаковой выручкой делят место. Выведите товар (`product`), месяц (`month`), выручку (`revenue`) и место для месяцев, которые заняли в своём товаре место 1 или 2. Если место разделили несколько месяцев, в ответ входят все они. Отсортируйте по `product`, затем по `place`, затем по `month`.',
      solution: `SELECT product, month, revenue, place
FROM (
  SELECT product, month, revenue,
         RANK() OVER (PARTITION BY product ORDER BY revenue DESC) AS place
  FROM monthly_sales
) ranked
WHERE place <= 2
ORDER BY product, place, month`,
      ordered: true,
      hints: ['Оконную функцию нельзя использовать в WHERE того же запроса: посчитайте место в подзапросе.'],
      notes: 'Порядок вычисления такой: FROM, WHERE, GROUP BY, оконные функции, ORDER BY. Поэтому условие по месту переносится во внешний запрос. RANK даёт равным значениям общее место, а ROW_NUMBER раздал бы им разные номера и отрезал бы один из месяцев с той же выручкой. По той же причине не подходит LIMIT.',
      tags: ['sql-functions'],
    }),
    sqlTask({
      slug: 'sql-practice-window-month-change',
      title: 'Изменение выручки к прошлому месяцу',
      difficulty: 'medium',
      fixture: practiceSales,
      task: 'Для каждого товара и месяца выведите товар (`product`), месяц (`month`), выручку (`revenue`) и изменение выручки по сравнению с предыдущим месяцем того же товара (`change`). В первом месяце товара `change` равен NULL. Отсортируйте по `product`, затем по `month`.',
      solution: `SELECT product, month, revenue,
       revenue - LAG(revenue) OVER (PARTITION BY product ORDER BY month) AS change
FROM monthly_sales
ORDER BY product, month`,
      ordered: true,
      hints: ['LAG(столбец) возвращает значение из предыдущей строки окна; для первой строки это NULL.'],
      notes: 'Без PARTITION BY функция LAG взяла бы предыдущую строку всей таблицы, и первый месяц одного товара сравнился бы с последним месяцем другого. Для первой строки группы предыдущей нет, LAG возвращает NULL, и вычитание тоже даёт NULL.',
      tags: ['sql-functions'],
    }),
    sqlTask({
      slug: 'sql-practice-window-days-to-next-order',
      title: 'Дней до следующего заказа',
      difficulty: 'medium',
      fixture: shop,
      tables: ['orders'],
      task: 'Для каждого заказа выведите его номер (`order_id`), номер покупателя (`customer_id`) и число дней до следующего заказа того же покупателя (`days_to_next`), считая по датам без времени. Если следующего заказа нет, значение NULL. Статус не важен. Отсортируйте по `order_id`.',
      solution: `SELECT id AS order_id, customer_id,
       LEAD(ordered_at::date) OVER (PARTITION BY customer_id ORDER BY ordered_at, id) - ordered_at::date AS days_to_next
FROM orders
ORDER BY order_id`,
      ordered: true,
      hints: ['LEAD смотрит вперёд на одну строку окна, так же как LAG смотрит назад.'],
      notes: 'LEAD берёт значение из следующей строки группы. Разность двух дат - число дней, а у последнего заказа покупателя следующей строки нет, поэтому получается NULL. Ключ id в сортировке окна страхует от двух заказов с одинаковым временем.',
      tags: ['sql-functions'],
    }),
    sqlTask({
      slug: 'sql-practice-window-running-total',
      title: 'Накопительная выручка',
      difficulty: 'medium',
      fixture: practiceSales,
      task: 'Для каждого товара и месяца выведите товар (`product`), месяц (`month`), выручку (`revenue`) и накопленную выручку товара с первого месяца до текущего включительно (`running_total`). Отсортируйте по `product`, затем по `month`.',
      solution: `SELECT product, month, revenue,
       SUM(revenue) OVER (PARTITION BY product ORDER BY month) AS running_total
FROM monthly_sales
ORDER BY product, month`,
      ordered: true,
      notes: 'Когда в OVER есть ORDER BY, сумма считается от начала группы до текущей строки: рамка по умолчанию растёт вместе со строкой. Без ORDER BY в OVER каждая строка получила бы сумму всей группы.',
      tags: ['sql-functions', 'sql-aggregates'],
    }),
    sqlTask({
      slug: 'sql-practice-window-moving-average',
      title: 'Скользящее среднее за три месяца',
      difficulty: 'medium',
      fixture: practiceSales,
      task: 'Для каждого товара и месяца выведите товар (`product`), месяц (`month`) и среднюю выручку товара за текущий и два предыдущих месяца (`avg_3m`), округлённую до двух знаков. Если предыдущих месяцев меньше двух, усредняйте то, что есть. Считайте, что у товара нет пропущенных месяцев. Отсортируйте по `product`, затем по `month`.',
      solution: `SELECT product, month,
       ROUND(AVG(revenue) OVER (PARTITION BY product ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS avg_3m
FROM monthly_sales
ORDER BY product, month`,
      ordered: true,
      hints: ['Рамка окна ROWS BETWEEN 2 PRECEDING AND CURRENT ROW берёт две предыдущие строки и текущую.'],
      notes: 'Рамка ограничивает окно строками вокруг текущей. ROWS считает физические строки, поэтому метод верен только при отсутствии пропущенных месяцев, о чём сказано в условии. В начале группы строк меньше трёх, и AVG усредняет доступные.',
      tags: ['sql-functions', 'sql-aggregates'],
    }),
    sqlTask({
      slug: 'sql-practice-window-top-quarter-salary',
      title: 'Верхняя четверть по зарплате',
      difficulty: 'medium',
      fixture: company,
      tables: ['employees'],
      task: 'Разделите всех сотрудников функцией NTILE(4) на четыре равные группы по убыванию зарплаты; при равных зарплатах раньше идёт сотрудник с меньшим `id`. Выведите сотрудников первой группы: имя (`full_name`) и зарплату (`salary`). Отсортируйте по зарплате от большего к меньшему, при равенстве по `full_name`.',
      solution: `SELECT full_name, salary
FROM (
  SELECT full_name, salary, NTILE(4) OVER (ORDER BY salary DESC, id) AS quarter
  FROM employees
) t
WHERE quarter = 1
ORDER BY salary DESC, full_name`,
      ordered: true,
      hints: ['NTILE(n) распределяет строки по n группам почти поровну; если строк не делится на n, первые группы на одну строку больше.'],
      notes: 'При 12 сотрудниках в первой группе три человека, при 10 - тоже три: лишние строки при неравном делении достаются первым группам. Равные зарплаты NTILE может разнести по разным группам, поэтому порядок внутри окна нужно задавать однозначно, добавив id.',
      tags: ['sql-functions', 'sql-subqueries'],
    }),
    sqlTask({
      slug: 'sql-practice-window-longest-books',
      title: 'Верхние 20 процентов по объёму',
      difficulty: 'hard',
      fixture: library,
      tables: ['books'],
      task: 'Выведите книги, попавшие в верхние 20 процентов по числу страниц: те, у кого `percent_rank` по возрастанию страниц не меньше 0.8. Столбцы: название (`title`) и число страниц (`pages`). Книги без числа страниц не рассматриваются. Отсортируйте по `pages` от большего к меньшему, при равенстве по `title`.',
      solution: `SELECT title, pages
FROM (
  SELECT title, pages, PERCENT_RANK() OVER (ORDER BY pages) AS pr
  FROM books
  WHERE pages IS NOT NULL
) t
WHERE pr >= 0.8
ORDER BY pages DESC, title`,
      ordered: true,
      hints: ['PERCENT_RANK возвращает число от 0 до 1: долю строк, лежащих строго ниже текущей, среди остальных.'],
      notes: 'PERCENT_RANK у наименьшего значения равен 0, у наибольшего 1. Равные значения получают один и тот же ранг, поэтому границу нужно проверять условием на число, а не брать фиксированное число строк. Пустые значения до окна отфильтрованы, чтобы они не искажали ранжирование.',
      tags: ['sql-functions', 'sql-subqueries'],
    }),
    sqlTask({
      slug: 'sql-practice-window-median-salary',
      title: 'Медианная зарплата по отделам',
      difficulty: 'medium',
      fixture: company,
      tables: ['departments', 'employees'],
      task: 'Для каждого отдела с сотрудниками выведите название (`department`) и медианную зарплату, округлённую до двух знаков (`median_salary`). При чётном числе сотрудников медиана - среднее двух центральных значений. Отсортируйте по `department`.',
      solution: `SELECT d.name AS department,
       ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY e.salary))::numeric, 2) AS median_salary
FROM departments d
JOIN employees e ON e.department_id = d.id
GROUP BY d.id, d.name
ORDER BY d.name`,
      ordered: true,
      hints: ['percentile_cont(0.5) WITHIN GROUP (ORDER BY столбец) - агрегат, его используют вместе с GROUP BY.', 'Результат percentile_cont имеет тип double precision, а ROUND с двумя знаками требует numeric: приведите через ::numeric.'],
      notes: 'Медиана - значение, делящее выборку пополам, и в PostgreSQL для неё нет функции MEDIAN. percentile_cont(0.5) интерполирует между двумя центральными значениями при чётном их числе, а percentile_disc выбирает одно из существующих. Среднее арифметическое при выбросах (например, зарплата руководителя) даёт иную картину, поэтому медиану и считают.',
      tags: ['sql-aggregates', 'sql-functions'],
    }),
    sqlTask({
      slug: 'sql-practice-window-median-price',
      title: 'Медианная цена книги',
      difficulty: 'medium',
      fixture: library,
      tables: ['books'],
      task: 'Посчитайте медианную цену книг, округлённую до двух знаков, и назовите столбец `median_price`. Книги без цены в расчёте не участвуют.',
      solution: `SELECT ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY price))::numeric, 2) AS median_price
FROM books`,
      notes: 'Агрегат с WITHIN GROUP сам пропускает NULL, фильтр не нужен. При чётном числе цен результат - среднее двух центральных, поэтому в ответе может появиться значение, которого в таблице нет.',
      tags: ['sql-aggregates'],
    }),
    sqlTask({
      slug: 'sql-practice-window-second-order',
      title: 'Дата второго заказа покупателя',
      difficulty: 'medium',
      fixture: shop,
      tables: ['customers', 'orders'],
      task: 'Для каждого покупателя, у которого есть минимум два заказа любого статуса, выведите имя (`full_name`) и момент второго по времени заказа (`second_order_at`). Если два заказа сделаны в один момент, раньше идёт заказ с меньшим `id`. Отсортируйте по `second_order_at`, затем по `full_name`.',
      solution: `SELECT full_name, ordered_at AS second_order_at
FROM (
  SELECT c.full_name, o.ordered_at,
         ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY o.ordered_at, o.id) AS rn
  FROM customers c
  JOIN orders o ON o.customer_id = c.id
) t
WHERE rn = 2
ORDER BY second_order_at, full_name`,
      ordered: true,
      notes: 'Вторая строка группы - это rn = 2. Покупатели с одним заказом вторую строку не получают и сами выпадают из ответа. Ключ o.id в окне делает порядок однозначным при совпадении времени.',
      tags: ['sql-functions', 'sql-subqueries'],
    }),
    sqlTask({
      slug: 'sql-practice-window-payroll-share',
      title: 'Доля сотрудника в фонде отдела',
      difficulty: 'medium',
      fixture: company,
      tables: ['employees'],
      task: 'Для сотрудников с отделом выведите имя (`full_name`), номер отдела (`department_id`), зарплату (`salary`) и долю зарплаты в суммарной зарплате отдела в процентах, округлённую до одного знака (`share_percent`). Отсортируйте по `department_id`, затем по `share_percent` от большего к меньшему, затем по `full_name`.',
      solution: `SELECT full_name, department_id, salary,
       ROUND(100.0 * salary / SUM(salary) OVER (PARTITION BY department_id), 1) AS share_percent
FROM employees
WHERE department_id IS NOT NULL
ORDER BY department_id, share_percent DESC, full_name`,
      ordered: true,
      hints: ['SUM(...) OVER (PARTITION BY ...) возвращает сумму группы в каждой её строке, не схлопывая строки.'],
      notes: 'Сумма по отделу и зарплата сотрудника нужны в одной строке. GROUP BY оставил бы одну строку на отдел, а окно возвращает сумму рядом с каждым сотрудником. Умножение на 100.0 переводит выражение в numeric, и деление перестаёт быть целочисленным.',
      tags: ['sql-functions', 'sql-aggregates'],
    }),
    sqlTask({
      slug: 'sql-practice-window-sales-forecast',
      title: 'Прогноз выручки на следующий месяц',
      difficulty: 'hard',
      fixture: practiceSales,
      task: 'Спрогнозируйте выручку следующего месяца простой экстраполяцией: к выручке последнего месяца прибавьте среднее месячное приращение, то есть (выручка последнего месяца минус выручка первого) делить на (число месяцев минус 1). Считайте, что пропущенных месяцев нет. Рассматривайте только товары минимум с двумя месяцами данных. Выведите товар (`product`), последний месяц (`last_month`) и прогноз, округлённый до двух знаков (`forecast`). Отсортируйте по `product`.',
      solution: `SELECT product, month AS last_month, ROUND(revenue + (revenue - first_revenue) / (months_count - 1), 2) AS forecast
FROM (
  SELECT product, month, revenue,
         FIRST_VALUE(revenue) OVER (PARTITION BY product ORDER BY month) AS first_revenue,
         COUNT(*) OVER (PARTITION BY product) AS months_count,
         ROW_NUMBER() OVER (PARTITION BY product ORDER BY month DESC) AS rn
  FROM monthly_sales
) t
WHERE rn = 1 AND months_count >= 2
ORDER BY product`,
      ordered: true,
      hints: ['FIRST_VALUE даёт значение из первой строки окна, COUNT(*) OVER (PARTITION BY ...) - размер группы, ROW_NUMBER по убыванию месяца помечает последнюю строку.'],
      notes: 'Все нужные числа берутся окнами за один проход: первая выручка, число месяцев и признак последней строки. Строка с rn = 1 несёт последний месяц, а условие months_count >= 2 убирает товары, для которых приращение нельзя посчитать, и защищает от деления на ноль. Такая экстраполяция грубая: она учитывает только первую и последнюю точки.',
      tags: ['sql-functions', 'sql-subqueries'],
    }),
  ],
})
