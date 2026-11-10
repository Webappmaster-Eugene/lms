export const LMS_URL = 'https://learn.mentorcareer.ru'
export const SITE_URL = 'https://info.mentorcareer.ru'
export const AUTHOR_URL = 'https://nadtocheev.ru'
export const MENTOR_SITE_URL = 'https://mentorcareer.ru'
/** Подтверждение прав в Яндекс Вебмастере: код публичный, снятие тега лишит доступа к фиду курсов. */
export const YANDEX_VERIFICATION = '89bcbf7cedc4803e'

/**
 * Счётчик Яндекс Метрики страниц буткемпа (создан 10.11.2026, принимает данные только с info.mentorcareer.ru).
 * Номер не секрет: он виден в коде любой страницы со счётчиком.
 */
export const METRIKA_ID = 114161391
/** Идентификаторы целей «JavaScript-событие»: в Метрике заведены с условием «совпадает», менять только вместе. */
export const METRIKA_GOALS = {
  formStart: 'lead_form_start',
  leadSubmit: 'lead_submit',
  telegram: 'lead_telegram',
} as const
export type MetrikaGoal = (typeof METRIKA_GOALS)[keyof typeof METRIKA_GOALS]
/**
 * Домены Метрики для CSP (справка Метрики, install-counter-csp): домен сбора tag.js выбирает сам,
 * 04.11.2026 на mentorcareer.ru хиты шли на mc.yandex.com, и CSP только с .ru молча теряла все визиты.
 * nginx.conf строку не собирает, смоук-тест сверяет её с этим списком.
 */
export const METRIKA_CSP_DOMAINS = [
  ...['ru', 'az', 'by', 'co.il', 'com', 'com.am', 'com.ge', 'com.tr', 'ee', 'fr', 'kg', 'kz', 'lt', 'lv', 'md', 'tj', 'tm', 'uz'].map((tld) => `mc.yandex.${tld}`),
  'mc.webvisor.com',
  'mc.webvisor.org',
]
/** Кабинеты Метрики, которые показывают страницу во фрейме (карта кликов). */
export const METRIKA_FRAME_ANCESTORS = [
  'metrika.yandex.ru', 'analytics.yandex.by', 'analytics.yandex.com', 'analytics.yandex.com.tr', 'analytics.yandex.kz', 'analytics.yandex.ru',
  'metr.yandex.by', 'metr.yandex.com', 'metr.yandex.com.tr', 'metr.yandex.kz', 'metr.yandex.ru',
  'metrica.ya.ru', 'metrica.yandex', 'metrica.yandex.by', 'metrica.yandex.com', 'metrica.yandex.com.tr', 'metrica.yandex.kz', 'metrica.yandex.ru',
  'metrika.ya.ru', 'metrika.yandex', 'metrika.yandex.by', 'metrika.yandex.com', 'metrika.yandex.com.tr', 'metrika.yandex.kz', 'metrika.yandex.uz',
]
/**
 * Публичные профили наставника для sameAs: тот же список, что у Person на mentorcareer.ru
 * (сайт автора, GitHub, Habr Career, Solvery, GetMentor и оба Telegram), плюс его страница на
 * mentorcareer.ru. Поисковики и ИИ-ответы связывают автора между сайтами по совпадающим ссылкам.
 */
export const AUTHOR_PROFILES = [
  `${AUTHOR_URL}/`,
  `${MENTOR_SITE_URL}/mentor`,
  'https://github.com/Webappmaster-Eugene',
  'https://career.habr.com/webappmaster',
  'https://t.me/eugene_nadtocheev',
  'https://t.me/eugene_galera',
  'https://solvery.io/ru/mentor/28861',
  'https://getmentor.dev/mentor/evgeniy-nadtocheev-5227',
]
/** Тот же @id и те же профили, что у организации на mentorcareer.ru: одна сущность на всех сайтах. */
export const ORGANIZATION_ID = `${MENTOR_SITE_URL}/#organization`
export const ORGANIZATION_PROFILES = [
  'https://t.me/captain_galera',
  'https://www.youtube.com/@webappmaster',
  'https://github.com/Webappmaster-Eugene',
  'https://vk.com/webapp_eugene',
  'https://t.me/galera_mentor',
  'https://t.me/eugene_vibecode',
]
