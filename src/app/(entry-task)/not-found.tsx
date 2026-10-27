import type { Metadata } from 'next'
import { ErrorScreen, errorPrimaryAction } from '@/components/errors/ErrorScreen'

export const metadata: Metadata = {
  title: 'Ссылка не найдена',
  robots: { index: false, follow: false },
}

/** Своя 404: у группы отдельный корневой layout, и без этого файла Next показывает английскую заглушку. */
export default function EntryTaskNotFound() {
  return (
    <ErrorScreen
      status="404"
      eyebrow="Ошибка 404"
      title="Ссылка на задание не найдена"
      description="Проверьте, что ссылка из письма скопирована целиком. Если письма нет, оставьте заявку на странице буткемпа ещё раз: ссылка придёт повторно."
      terminal={[
        { kind: 'command', text: 'open entry-task' },
        { kind: 'error', text: 'link not found' },
        { kind: 'comment', text: 'проверьте ссылку из письма' },
      ]}
      actions={<a href="https://info.mentorcareer.ru/bootcamp/nodejs/#apply" className={errorPrimaryAction}>Оставить заявку</a>}
    />
  )
}
