import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: {
    template: '%s — MentorCareer LMS',
    default: 'MentorCareer LMS',
  },
  description: 'Платформа обучения MentorCareer — курсы Frontend (React, TypeScript) и Backend (Node.js, NestJS) с тренажёром кода, геймификацией и сертификатами',
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'MentorCareer LMS',
    title: 'MentorCareer LMS',
    description: 'Платформа обучения MentorCareer — курсы Frontend (React, TypeScript) и Backend (Node.js, NestJS) с тренажёром кода, геймификацией и сертификатами',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children
}
