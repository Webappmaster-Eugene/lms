import type { Metadata } from 'next'

export const SITE_NAME = 'MentorCareer LMS'

export const SITE_DESCRIPTION =
  'Платформа обучения разработке MentorCareer: курсы Frontend и Backend, роадмапы, тренажёр кода с проверкой решений и сертификаты.'

/** Лежит в /images: этот префикс middleware пропускает без входа, иначе краулер получит редирект на /login. */
export const OG_IMAGE = { url: '/images/og.png', width: 1200, height: 630, alt: 'MentorCareer LMS — платформа обучения разработке' }

const PRODUCTION_URL = 'https://learn.mentorcareer.ru'

/** Без metadataBase Next подставляет в og:image адрес localhost. */
export function siteUrl(): URL {
  return new URL(process.env.NEXT_PUBLIC_SERVER_URL || PRODUCTION_URL)
}

const DESCRIPTION_LIMIT = 160

/**
 * Поисковики и мессенджеры обрезают сниппет около 160 символов — режем сами по границе слова.
 * Ссылки выбрасываем: в описании урока бывают адреса Яндекс Диска, которые ученику
 * показываются только через прокси (`protectLessonVideoSources`).
 */
export function metaDescription(text: string | null | undefined): string | undefined {
  const clean = text?.replace(/\bhttps?:\/\/\S+/gi, ' ').replace(/\s+/g, ' ').trim()
  if (!clean) return undefined
  if (clean.length <= DESCRIPTION_LIMIT) return clean
  const cut = clean.slice(0, DESCRIPTION_LIMIT - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > DESCRIPTION_LIMIT / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:—–-]+$/, '')}…`
}

/** Заголовок страницы с контекстом: «Урок 8» без названия курса неотличим во вкладках и истории. */
export function titleWithContext(title: string, context: string | null | undefined): string {
  return context ? `${title} · ${context}` : title
}

export const ROOT_METADATA: Metadata = {
  metadataBase: siteUrl(),
  title: { template: `%s — ${SITE_NAME}`, default: SITE_NAME },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'MentorCareer', statusBarStyle: 'default' },
  // Next 15 выводит для capable только mobile-web-app-capable, а Safari исторически
  // читает apple-вариант — задаём его явно.
  other: { 'apple-mobile-web-app-capable': 'yes' },
  // Явный список обязателен: любое поле icons в metadata отключает файловую иконку app/icon.svg.
  // favicon.ico из app/ Next добавляет сам. Иконка для iOS — 180×180 без прозрачности:
  // прозрачные углы iOS заливает чёрным.
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/images/pwa/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
}
