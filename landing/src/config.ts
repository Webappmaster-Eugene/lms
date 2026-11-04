export const LMS_URL = 'https://learn.mentorcareer.ru'
export const SITE_URL = 'https://info.mentorcareer.ru'
export const AUTHOR_URL = 'https://nadtocheev.ru'
export const MENTOR_SITE_URL = 'https://mentorcareer.ru'
/** Подтверждение прав в Яндекс Вебмастере: код публичный, снятие тега лишит доступа к фиду курсов. */
export const YANDEX_VERIFICATION = '89bcbf7cedc4803e'
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
