import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    template: '%s — MentorCareer LMS',
    default: 'MentorCareer LMS',
  },
  description: 'Платформа обучения MentorCareer',
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'MentorCareer LMS',
    title: 'MentorCareer LMS',
    description: 'Платформа обучения MentorCareer',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children
}
