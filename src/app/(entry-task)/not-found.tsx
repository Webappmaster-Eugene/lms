import type { Metadata } from 'next'
import { CandidateFrame } from '@/components/bootcamp/CandidateFrame'
import { ErrorScreen, errorPrimaryAction } from '@/components/errors/ErrorScreen'
import { getPayload } from '@/lib/payload'
import { logger } from '@/lib/telemetry'
import { GUIDE_URL } from '@/lib/site-links'
import { candidateLanding } from '@/server/bootcamp-programs'

export const metadata: Metadata = {
  title: { absolute: 'Ссылка не найдена - MentorCareer' },
  robots: { index: false, follow: false },
}

/** Своя 404: у группы отдельный корневой layout, и без этого файла Next показывает английскую заглушку. */
export default async function EntryTaskNotFound() {
  // Программа по неверной ссылке неизвестна: если открыта одна, ведём на её форму, иначе на сайт.
  const landing = await getPayload().then(candidateLanding).catch((error: unknown) => {
    logger.error('Entry task 404 without program links', error)
    return { landingUrl: null, program: null }
  })
  return (
    <CandidateFrame {...landing}>
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
        actions={<a href={landing.landingUrl ? `${landing.landingUrl}#apply` : `${GUIDE_URL}/`} className={errorPrimaryAction}>{landing.landingUrl ? 'Оставить заявку' : 'На сайт MentorCareer'}</a>}
      />
    </CandidateFrame>
  )
}
