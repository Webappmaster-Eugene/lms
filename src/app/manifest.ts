import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MentorCareer LMS',
    short_name: 'MentorCareer',
    description: 'Платформа обучения MentorCareer',
    start_url: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#18181b',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  }
}
