'use client'

import { useState } from 'react'
import { Button } from '@payloadcms/ui'
import { defenseLabels, type BootcampDefense, type DefenseOutcome } from '@/lib/bootcamp-defense'
import { apiFetch, readJson } from '@/lib/http-client'

export function DefensePanel({ enrollment, initial }: { enrollment: number; initial: BootcampDefense | null }) {
  const [saved, setSaved] = useState(initial)
  const [outcome, setOutcome] = useState<DefenseOutcome | ''>(initial?.outcome ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await apiFetch(`/api/bootcamp/enrollments/${enrollment}/defense`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome, url, revision: saved?.recordedAt ?? '' }),
      })
      const result = await readJson<BootcampDefense & { error?: string }>(response)
      if (!response.ok || !result?.recordedAt) throw new Error(result?.error || 'Не удалось сохранить результат. Обновите карточку и повторите.')
      setSaved(result)
      setUrl(result.url)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить результат защиты')
    } finally {
      setBusy(false)
    }
  }
  return <section id="defense" aria-label="Защита проекта" className="lead-path__step">
    <h3 className="lead-path__step-title">Защита проекта</h3>
    {saved && <p role="status">{defenseLabels[saved.outcome]}. <a href={saved.url} rel="noopener noreferrer" target="_blank">Открыть разбор</a></p>}
    <div className="enrollment__grid">
      <label className="enrollment__field">Результат
        <select value={outcome} onChange={event => setOutcome(event.target.value === 'passed' ? 'passed' : event.target.value === 'revise' ? 'revise' : '')} disabled={busy || saved?.outcome === 'passed'}>
          <option value="">Выберите результат</option>
          <option value="revise">{defenseLabels.revise}</option><option value="passed">{defenseLabels.passed}</option>
        </select>
      </label>
      <label className="enrollment__field">Ссылка на разбор
        <input type="url" maxLength={1000} value={url} disabled={busy} onChange={event => setUrl(event.target.value)} />
      </label>
    </div>
    {error && <p className="enrollment__error" role="alert">{error}</p>}
    <Button type="button" size="small" disabled={busy || !outcome || !url.trim() || (outcome === saved?.outcome && url === saved.url)} onClick={() => void save()}>
      {busy ? 'Сохраняем...' : 'Сохранить результат защиты'}
    </Button>
  </section>
}
