import type { Metadata } from 'next'
import Link from 'next/link'
import { CurrentPath } from '@/components/errors/CurrentPath'
import { ErrorScreen, errorPrimaryAction, errorSecondaryAction } from '@/components/errors/ErrorScreen'
import { getLearningRequest } from '@/server/learning-request'

export const metadata: Metadata = {
  title: 'Гайд не найден',
}

/**
 * Своя 404 раздела: у группы (guides) отдельный корневой layout, и без этого файла Next
 * показывает английскую заглушку. Закрытый гайд гостю отвечает тем же экраном, что и
 * несуществующий, — название не раскрывается.
 */
export default async function GuideNotFound() {
  const { user } = await getLearningRequest()
  return (
    <ErrorScreen
      status="404"
      eyebrow="Ошибка 404"
      title="Такого гайда нет"
      description={user
        ? 'Возможно, гайд переименовали, сняли с публикации, или ссылка устарела. В списке - все гайды, которые вам открыты.'
        : 'Возможно, гайд переименовали, или он открыт только ученикам - тогда войдите в LMS. Публичные гайды доступны в списке.'}
      terminal={[
        { kind: 'command', text: <>cat <CurrentPath fallback="/guides" /></> },
        { kind: 'error', text: 'no such file or directory' },
        { kind: 'comment', text: 'гайд мог переехать - загляните в список' },
        { kind: 'hint', text: 'cd ~/guides' },
      ]}
      actions={
        <>
          <Link href="/guides" className={errorPrimaryAction}>Все гайды</Link>
          {user && <Link href="/" className={errorSecondaryAction}>На дашборд</Link>}
        </>
      }
    />
  )
}
