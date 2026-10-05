'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from './InterviewButton'

export function InterviewStart({ taskId }: { taskId?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function create() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/trainer/interview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(taskId ? { taskId } : {}),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Не удалось создать комнату')
      router.push(`/trainer/interview/${data.room.token}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать комнату')
      setBusy(false)
    }
  }
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-3xl font-bold">Собеседование</h1>
      <p className="text-muted-foreground">Пригласите собеседника по ссылке. Решайте задачу в общем редакторе, обсуждайте подход и запускайте свои примеры в консоли.</p>
      <ul className="space-y-2 text-sm">
        <li>Общий код на JavaScript или TypeScript.</li>
        <li>До восьми участников с аккаунтом на платформе.</li>
        <li>Без подсказок и эталонных решений. Баллы и прогресс не меняются.</li>
      </ul>
      <p className="text-sm">{taskId ? 'Комната откроется с условием и шаблоном выбранной задачи.' : 'Комната откроется с чистым редактором. Условие можно обсудить с собеседником.'}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button onClick={() => void create()} disabled={busy}>{busy ? 'Создаём комнату…' : 'Создать комнату'}</Button>
    </div>
  )
}
