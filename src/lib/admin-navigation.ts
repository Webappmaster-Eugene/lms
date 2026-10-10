export const ADMIN_SHORTCUTS = [
  { href: '/manage', label: 'Учебный контент' },
  { href: '/admin', label: 'CMS и настройки' },
  { href: '/admin/roadmap-editor', label: 'Редактор роадмапов' },
  { href: '/admin/collections/users', label: 'Ученики и администраторы' },
  { href: '/admin/learning-access', label: 'Назначения обучения' },
  { href: '/admin/student-analytics', label: 'Аналитика пользователей' },
  { href: '/admin/questions', label: 'Вопросы учеников' },
] as const

export const ADMIN_NAV_GROUPS = [
  {
    label: 'Доступ учеников',
    items: [
      { href: '/admin/learning-access', label: 'Назначения обучения' },
      { href: '/admin/student-analytics', label: 'Аналитика пользователей' },
      { href: '/admin/collections/users', label: 'Ученики и администраторы' },
      { href: '/admin/collections/learning-access-grants', label: 'Правила доступа' },
      { href: '/admin/collections/learning-access-audit', label: 'Журнал назначений' },
    ],
  },
  {
    label: 'Настройки контента в CMS',
    items: [
      { href: '/admin/collections/roadmaps', label: 'Роадмапы' },
      { href: '/admin/collections/courses', label: 'Курсы' },
      { href: '/admin/collections/sections', label: 'Разделы курсов' },
      { href: '/admin/collections/lessons', label: 'Уроки' },
      { href: '/admin/collections/media', label: 'Медиафайлы' },
      { href: '/admin/collections/interview-directions', label: 'Направления собеседований' },
      { href: '/admin/collections/interview-recordings', label: 'Общие записи собеседований' },
      { href: '/admin/import-yandex', label: 'Импорт из Яндекс.Диска' },
      { href: '/admin/collections/yandex-disk-imports', label: 'История импорта' },
      { href: '/admin/collections/roadmap-nodes', label: 'Узлы роадмапов' },
      { href: '/admin/collections/roadmap-edges', label: 'Связи роадмапов' },
    ],
  },
  {
    label: 'Управление тренажёром',
    items: [
      { href: '/admin/collections/trainer-topics', label: 'Темы тренажёра' },
      { href: '/admin/collections/trainer-tasks', label: 'Задачи тренажёра' },
      { href: '/admin/collections/interview-rooms', label: 'Мои собеседования' },
      { href: '/admin/collections/user-trainer-progress', label: 'Результаты тренажёра' },
    ],
  },
  {
    label: 'Прогресс и награды',
    items: [
      { href: '/admin/collections/user-progress', label: 'Прогресс по урокам' },
      { href: '/admin/collections/lesson-learning-states', label: 'Места остановки учеников' },
      { href: '/admin/collections/certificates', label: 'Сертификаты учеников' },
      { href: '/admin/collections/streaks', label: 'Серии активности' },
      { href: '/admin/collections/achievements', label: 'Достижения' },
      { href: '/admin/collections/user-achievements', label: 'Достижения учеников' },
      { href: '/admin/collections/points-transactions', label: 'Начисления баллов' },
      { href: '/admin/collections/notes', label: 'Заметки учеников' },
      { href: '/admin/collections/bookmarks', label: 'Закладки учеников' },
    ],
  },
  {
    label: 'Общение и настройки',
    items: [
      { href: '/admin/collections/comments', label: 'Комментарии к урокам' },
      { href: '/admin/collections/notifications', label: 'Уведомления' },
      { href: '/admin/collections/faq-items', label: 'Вопросы и ответы' },
      { href: '/admin/globals/site-settings', label: 'Настройки платформы' },
    ],
  },
] as const

export function isAdminPathActive(pathname: string, href: string) {
  return pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`))
}
