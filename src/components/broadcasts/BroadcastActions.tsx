'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Send, Square, TestTube2, Trash2 } from 'lucide-react'

import { buttonClass } from '@/components/content-management/form-utils'
import { broadcastRequest } from '@/components/broadcasts/broadcast-request'
import type { EmailBroadcast } from '@/payload-types'

type Props = {
  id: number
  status: EmailBroadcast['status']
  estimatedRecipients: number
  adminEmail: string
  transportReady: boolean
}

type Action = 'test' | 'send' | 'cancel' | 'delete'

export function BroadcastActions({ id, status, estimatedRecipients, adminEmail, transportReady }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<Action | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Пока письма уходят, статистика на странице обновляется сама.
  useEffect(() => {
    if (status !== 'sending') return
    const timer = setInterval(() => router.refresh(), 15_000)
    return () => clearInterval(timer)
  }, [status, router])

  async function run(action: Action, work: () => Promise<void>) {
    setBusy(action)
    setError('')
    setNotice('')
    try { await work() } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось выполнить действие')
    } finally { setBusy(null) }
  }

  const sendTest = () => run('test', async () => {
    await broadcastRequest(`/api/manage/broadcasts/${id}/test`, 'POST')
    setNotice(`Тестовое письмо отправлено на ${adminEmail}. Проверьте входящие и папку «Спам».`)
  })

  const start = () => {
    if (!window.confirm(`Запустить рассылку? Получателей примерно: ${estimatedRecipients}. Отправленные письма отозвать нельзя, остановить можно только неотправленные.`)) return
    void run('send', async () => {
      const result = await broadcastRequest(`/api/manage/broadcasts/${id}/send`, 'POST')
      const doc = result.doc && typeof result.doc === 'object' ? result.doc as Record<string, unknown> : {}
      setNotice(`Рассылка запущена, писем в очереди: ${typeof doc.recipientsTotal === 'number' ? doc.recipientsTotal : estimatedRecipients}. Письма уходят партиями примерно по 20 в минуту.`)
      router.refresh()
    })
  }

  const cancel = () => {
    if (!window.confirm('Остановить рассылку? Уже отправленные письма останутся у получателей, остальные не уйдут.')) return
    void run('cancel', async () => {
      await broadcastRequest(`/api/manage/broadcasts/${id}/cancel`, 'POST')
      setNotice('Рассылка остановлена.')
      router.refresh()
    })
  }

  const remove = () => {
    if (!window.confirm('Удалить черновик рассылки?')) return
    void run('delete', async () => {
      await broadcastRequest(`/api/manage/broadcasts/${id}`, 'DELETE')
      router.push('/manage/broadcasts')
      router.refresh()
    })
  }

  const icon = (action: Action, Icon: typeof Send) => busy === action ? <Loader2 aria-hidden="true" size={16} className="animate-spin" /> : <Icon aria-hidden="true" size={16} />

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === 'draft' && (
          <button type="button" onClick={start} disabled={busy !== null || !transportReady || estimatedRecipients === 0} className={`${buttonClass} gap-2 border-primary bg-primary text-primary-foreground`}>
            {icon('send', Send)}Запустить рассылку
          </button>
        )}
        {status === 'sending' && (
          <button type="button" onClick={cancel} disabled={busy !== null} className={`${buttonClass} gap-2 border-destructive/40 text-destructive`}>
            {icon('cancel', Square)}Остановить
          </button>
        )}
        <button type="button" onClick={() => void sendTest()} disabled={busy !== null || !transportReady} className={`${buttonClass} gap-2`}>
          {icon('test', TestTube2)}Отправить тест себе
        </button>
        {status === 'draft' && (
          <>
            <Link href={`/manage/broadcasts/${id}/edit`} className={`${buttonClass} gap-2`}><Pencil aria-hidden="true" size={16} />Редактировать</Link>
            <button type="button" onClick={remove} disabled={busy !== null} className={`${buttonClass} gap-2 text-destructive`}>
              {icon('delete', Trash2)}Удалить
            </button>
          </>
        )}
      </div>
      {status === 'draft' && estimatedRecipients === 0 && <p className="text-sm text-warning">Сейчас некому отправить: выберите учеников с действующим адресом.</p>}
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-foreground">{notice}</p>}
    </div>
  )
}
