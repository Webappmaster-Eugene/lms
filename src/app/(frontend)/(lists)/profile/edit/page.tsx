import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { ProfileSettings } from '@/components/profile/ProfileSettings'

export default function ProfileEditPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/profile" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Назад к профилю
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-foreground">Настройки профиля</h1>
        <p className="mt-2 text-sm text-muted-foreground">Личные данные, контакты и безопасность аккаунта.</p>
      </div>
      <ProfileSettings />
    </div>
  )
}
