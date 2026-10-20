import type { Metadata } from 'next'
import Link from 'next/link'
import { CurrentPath } from '@/components/errors/CurrentPath'
import { ErrorScreen, errorPrimaryAction, errorSecondaryAction } from '@/components/errors/ErrorScreen'

export const metadata: Metadata = {
  title: 'Страница не найдена',
}

/** Своя 404 внутри платформы: заглушка Next — белая, английская и без меню. */
export default function FrontendNotFound() {
  return (
    <ErrorScreen
      status="404"
      eyebrow="Ошибка 404"
      title="Такой страницы нет в программе"
      description="Возможно, курс или урок переименовали, сняли с публикации, или ссылка устарела. Начните с дашборда или найдите нужное в каталоге."
      terminal={[
        { kind: 'command', text: <>cd <CurrentPath /></> },
        { kind: 'error', text: 'no such file or directory' },
        { kind: 'comment', text: 'урок мог переехать — загляните в каталог' },
        { kind: 'hint', text: 'cd ~/courses' },
      ]}
      actions={
        <>
          <Link href="/" className={errorPrimaryAction}>На дашборд</Link>
          <Link href="/courses" className={errorSecondaryAction}>Каталог курсов</Link>
          <Link href="/roadmaps" className={errorSecondaryAction}>Роадмапы</Link>
        </>
      }
    />
  )
}
