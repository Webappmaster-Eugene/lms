import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Новый пароль',
}

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
