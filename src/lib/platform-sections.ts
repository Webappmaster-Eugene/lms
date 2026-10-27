/**
 * Разделы платформы: один источник для бокового меню и справки.
 * `hint` отвечает ученику на вопрос «что здесь и зачем сюда заходить».
 */
export const PLATFORM_SECTIONS = [
  { href: '/', label: 'Дашборд', hint: 'Главная страница: ваш прогресс, серия дней и урок, с которого стоит продолжить' },
  { href: '/bootcamp', label: 'Буткемпы', hint: 'Ваши буткемпы: методички по неделям и прогресс по ним' },
  { href: '/roadmaps', label: 'Роадмапы', hint: 'Карты направлений: какие темы изучать и в каком порядке, с курсами по каждой теме' },
  { href: '/courses', label: 'Курсы', hint: 'Все доступные вам курсы с описанием, программой и прогрессом' },
  { href: '/trainer', label: 'Тренажёр', hint: 'Практика: задачи с автоматической проверкой кода и режим собеседования' },
  { href: '/interviews', label: 'Собеседования', hint: 'Записи реальных собеседований с разбором и ваши собственные записи' },
  { href: '/guides', label: 'Гайды', hint: 'Практические инструкции по карьере, работе с ИИ и своему делу — вне программы курсов' },
  { href: '/learning-history', label: 'История обучения', hint: 'Недавно открытые уроки и место, где вы остановились в видео' },
  { href: '/certificates', label: 'Сертификаты', hint: 'Сертификаты за полностью пройденные курсы и роадмапы' },
  { href: '/notes', label: 'Заметки', hint: 'Все ваши записи по урокам в одном месте — удобно повторять пройденное' },
  { href: '/questions', label: 'Вопросы', hint: 'Ваши вопросы ментору по урокам и ответы на них' },
  { href: '/saved', label: 'Сохранённое', hint: 'Уроки и задачи, которые вы отложили, чтобы вернуться позже' },
  { href: '/leaderboard', label: 'Лидерборд', hint: 'Рейтинг учеников по баллам за уроки и задачи' },
  { href: '/profile', label: 'Профиль', hint: 'Ваши данные, баллы, достижения и статистика обучения' },
  { href: '/settings/app', label: 'Приложение', hint: 'Установка платформы на телефон и настройки приложения' },
  { href: '/settings/notifications', label: 'Уведомления', hint: 'Какие напоминания получать и на каких устройствах' },
  { href: '/contacts', label: 'Контакты', hint: 'Как связаться с командой и где найти сообщество' },
  { href: '/help', label: 'Помощь', hint: 'Ответы на частые вопросы, описание разделов и форма обращения' },
] as const

export type PlatformSectionHref = typeof PLATFORM_SECTIONS[number]['href']

/** Что открыто пользователю. Раздел без доступа не показывается ни в меню, ни в справке, ни в подвале. */
export type SectionAccess = { trainerEnabled: boolean; guidesEnabled: boolean; bootcampEnabled: boolean }

export function visibleSections<T extends { href: string }>(sections: readonly T[], access: SectionAccess): T[] {
  return sections.filter(({ href }) =>
    (access.trainerEnabled || href !== '/trainer') && (access.guidesEnabled || href !== '/guides') && (access.bootcampEnabled || href !== '/bootcamp'))
}
