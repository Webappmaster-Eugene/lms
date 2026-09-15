/** Единая точка правды по внешним адресам и навигации.
 *  Раньше LMS_URL был продублирован в четырёх компонентах. */

/** Держать в синхроне с NEXT_PUBLIC_SERVER_URL платформы: оттуда же ссылки в письмах. */
export const LMS_URL = 'https://learn.mentorcareer.ru'

/** canonical, og:url, JSON-LD; astro.config.mjs импортирует её как `site`. */
export const SITE_URL = 'https://promo.mentorcareer.ru'

export const AUTHOR_URL = 'https://nadtocheev.ru'
export const TELEGRAM_URL = 'https://t.me/eugene_nadtocheev'
export const CHAT_URL = 'https://t.me/mentorcareer_chat'

export const EMAIL = 'support@mentorcareer.ru'

export interface NavItem {
  readonly href: string
  readonly label: string
}

/** Порядок совпадает с порядком блоков на странице.
 *  Якоря #features / #how-it-works / #trainer / #gamification / #contacts
 *  сохранены с прошлой версии — на них могут вести внешние ссылки. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '#mentor', label: 'ментор' },
  { href: '#program', label: 'программа' },
  { href: '#how-it-works', label: 'как устроено' },
  { href: '#features', label: 'платформа' },
  { href: '#contacts', label: 'контакты' },
] as const

/** Метки левого рельса. Индекс = порядковый номер блока. */
export const RAIL_MARKS: readonly NavItem[] = [
  { href: '#top', label: 'старт' },
  { href: '#diagnosis', label: 'диагноз' },
  { href: '#mentor', label: 'ментор' },
  { href: '#program', label: 'программа' },
  { href: '#how-it-works', label: 'процесс' },
  { href: '#features', label: 'платформа' },
  { href: '#for-mentors', label: 'наставникам' },
  { href: '#contacts', label: 'контакты' },
] as const

/** Портрет ментора. Когда файл появится — положить в public/ и указать путь здесь,
 *  разметка подхватит его без других правок. Пропорции кадра: 3:4. */
export const MENTOR_PHOTO: string | null = '/mentor.webp'
