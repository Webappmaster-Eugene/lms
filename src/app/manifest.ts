import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'MentorCareer LMS',
    short_name: 'MentorCareer',
    description: 'Платформа обучения MentorCareer',
    start_url: '/',
    scope: '/',
    lang: 'ru',
    categories: ['education', 'productivity'],
    prefer_related_applications: false,
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#18181b',
    icons: [
      { src: '/images/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/images/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/images/pwa/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  }
}
