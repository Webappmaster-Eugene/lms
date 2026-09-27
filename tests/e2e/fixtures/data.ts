/**
 * Фиксированные данные e2e-сида. Их же читают тесты — одно место правды для
 * логинов, слагов и заголовков. Пароли тестовые и живут только в одноразовой
 * базе lms_e2e.
 */
export const E2E_DB_PREFIX = 'lms_e2e_'
export const E2E_SECRET = 'e2e-test-secret-not-for-production-000000001'
export const APP_PORT = Number(process.env.E2E_APP_PORT ?? 3100)
export const LANDING_PORT = Number(process.env.E2E_LANDING_PORT ?? 3101)

export const USERS = {
  admin: { email: 'e2e-admin@lms.test', password: 'E2e-Admin-Pass-1', firstName: 'Анна', lastName: 'Админова' },
  student: { email: 'e2e-student@lms.test', password: 'E2e-Student-Pass-1', firstName: 'Иван', lastName: 'Студентов' },
  leader: { email: 'e2e-leader@lms.test', password: 'E2e-Leader-Pass-1', firstName: 'Мария', lastName: 'Лидерова' },
  // Отдельный студент под сценарии, которые меняют состояние (прохождение урока,
  // сдача задачи): так скриншоты и проверки основного студента не зависят от порядка.
  doer: { email: 'e2e-doer@lms.test', password: 'E2e-Doer-Pass-1', firstName: 'Пётр', lastName: 'Практиков' },
} as const

export const CONTENT = {
  roadmap: { title: 'E2E Frontend', slug: 'e2e-frontend' },
  course: { title: 'Основы веба', slug: 'e2e-web-basics' },
  section: { title: 'Введение в веб', slug: 'e2e-intro' },
  lessons: [
    { title: 'Что такое HTML', slug: 'e2e-html' },
    { title: 'CSS и каскад', slug: 'e2e-css' },
    { title: 'Первый скрипт', slug: 'e2e-js' },
  ],
  draftLesson: { title: 'Черновик урока', slug: 'e2e-draft' },
  topic: { title: 'E2E: функции', slug: 'e2e-functions' },
  task: { title: 'Сумма двух чисел', slug: 'e2e-sum' },
  faq: [
    { question: 'Как начать обучение?', answer: 'Откройте курс и пройдите первый урок.' },
    { question: 'Как связаться с поддержкой?', answer: 'Напишите через форму на странице «Помощь».' },
  ],
} as const

export const SUM_SOLUTION = 'function sum(a, b) {\n  return a + b\n}\n'

/** Заголовок собственной страницы 404 платформы (src/app/(frontend)/not-found.tsx). */
export const NOT_FOUND_HEADING = 'Такой страницы нет'
