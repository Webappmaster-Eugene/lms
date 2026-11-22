import { DefaultTemplate } from '@payloadcms/next/templates'
import { Button } from '@payloadcms/ui'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'

import { adminLoginHref } from '@/lib/admin-login-redirect'
import { tutoringDateLabel } from '@/lib/tutoring'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { getTutoringCalendarSettings } from '@/server/tutoring-calendar-account'
import { googleCalendarApiPath, tutoringGoogleConfig } from '@/server/tutoring-google'

const results: Record<string, { text: string; error?: true }> = {
  connected: { text: 'Аккаунт подключён. LMS подготовит календарь MentorCareer.' },
  disconnected: { text: 'Аккаунт отключён. Созданные события остались в Google Calendar.' },
  denied: { text: 'Google не предоставил доступ к календарю. Подключите аккаунт и разрешите запрошенный доступ.', error: true },
  expired: { text: 'Сеанс подключения истёк. Начните подключение заново.', error: true },
  failed: { text: 'Действие не выполнено. Повторите попытку.', error: true },
  'different-account': { text: 'Для смены аккаунта сначала отключите текущее подключение.', error: true },
  unavailable: { text: 'Для этой LMS ещё не настроен доступ к Google Calendar.', error: true },
}

export async function GoogleCalendarView({ params, searchParams, initPageResult }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult
  if (!req.user) redirect(adminLoginHref(req.headers, '/admin/login'))
  if ((await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)).role !== 'admin') redirect('/')

  const connection = await getTutoringCalendarSettings(req.payload, req, req.user.id)
  const available = !!tutoringGoogleConfig()
  const linked = !!connection && connection.status !== 'disconnected'
  const resultKey = searchParams?.result
  const result = typeof resultKey === 'string' && Object.hasOwn(results, resultKey) ? results[resultKey] : undefined
  return (
    <DefaultTemplate i18n={req.i18n} locale={locale} params={params} payload={req.payload} permissions={permissions} req={req} searchParams={searchParams} user={req.user} visibleEntities={visibleEntities}>
      <section className="gutter--left gutter--right" style={{ maxWidth: '52rem', paddingBlock: '2rem' }}>
        <h1>Google Calendar</h1>
        <p>Занятия выбранных потоков появятся в календаре MentorCareer. Выбрать потоки можно в их настройках.</p>
        {result && <p role={result.error ? 'alert' : 'status'}>{result.text}</p>}
        {!available && !result && <p>Для этой LMS ещё не настроен доступ к Google Calendar.</p>}
        {linked && <dl>
          <dt>Аккаунт Google</dt><dd>{connection.googleEmail}</dd>
          <dt>Синхронизация</dt><dd>{connection.status === 'reconnect' ? 'Нужно переподключить аккаунт'
            : connection.lastError ? 'Google сейчас недоступен. LMS повторит попытку'
              : connection.lastSyncedAt ? `Обновлено ${tutoringDateLabel(new Date(connection.lastSyncedAt))}, МСК` : 'Ожидает первой синхронизации'}</dd>
        </dl>}
        {available && <form action={googleCalendarApiPath} method="post">
          <Button type="submit">{linked ? 'Переподключить Google Calendar' : 'Подключить Google Calendar'}</Button>
        </form>}
        {linked && <form action={`${googleCalendarApiPath}?operation=disconnect`} method="post">
          <p>После отключения созданные события останутся в Google Calendar и перестанут обновляться.</p>
          <Button type="submit" buttonStyle="secondary">Отключить Google Calendar</Button>
        </form>}
      </section>
    </DefaultTemplate>
  )
}
