'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search, UserPlus, X } from 'lucide-react'

import { inputClass, panelClass, buttonClass, useContentDraft } from '@/components/content-management/form-utils'
import { BROADCAST_LIMITS } from '@/lib/broadcast-markup'
import { broadcastRequest } from '@/components/broadcasts/broadcast-request'

export type BroadcastFormValue = {
  id?: number
  subject: string
  body: string
  ctaLabel: string
  ctaUrl: string
  audience: 'all' | 'selected'
  recipients: { id: number; title: string }[]
}

type Props = {
  initial?: BroadcastFormValue
  allStudents: { recipients: number; excluded: number }
}

type StudentOption = { id: number; title: string }

const empty: BroadcastFormValue = { subject: '', body: '', ctaLabel: '', ctaUrl: '', audience: 'all', recipients: [] }

function studentsPage(value: unknown): { docs: StudentOption[]; hasNextPage: boolean } {
  if (!value || typeof value !== 'object' || !('docs' in value) || !Array.isArray(value.docs)) throw new Error('Не удалось загрузить учеников')
  const docs = value.docs.filter((doc): doc is StudentOption => Boolean(doc) && typeof doc === 'object' && typeof doc.id === 'number' && typeof doc.title === 'string')
  return { docs, hasNextPage: 'hasNextPage' in value && value.hasNextPage === true }
}

function StudentPicker({ selected, onChange, disabled }: { selected: StudentOption[]; onChange: (value: StudentOption[]) => void; disabled: boolean }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<StudentOption[]>([])
  const [page, setPage] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(false)
  // true с первого рендера: иначе до первой загрузки мелькает «Ученики не найдены».
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      setError('')
      fetch(`/api/manage/learning-access?kind=students&page=${page}&search=${encodeURIComponent(search.trim())}`, { credentials: 'include', signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error('Не удалось загрузить учеников. Обновите страницу')
          return studentsPage(await response.json())
        })
        .then((data) => {
          setResults((current) => page === 1 ? data.docs : [...current, ...data.docs.filter((doc) => !current.some((item) => item.id === doc.id))])
          setHasNextPage(data.hasNextPage)
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return
          setError(cause instanceof Error ? cause.message : 'Не удалось загрузить учеников')
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [search, page])

  const chosen = new Set(selected.map((item) => item.id))
  const limitReached = selected.length >= BROADCAST_LIMITS.recipients
  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <ul aria-label="Выбранные ученики" className="flex flex-wrap gap-2">
          {selected.map((student) => (
            <li key={student.id} className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-secondary py-1 pl-2 pr-1 text-xs text-foreground">
              <span className="truncate">{student.title}</span>
              <button type="button" disabled={disabled} onClick={() => onChange(selected.filter((item) => item.id !== student.id))} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring sm:h-7 sm:w-7" aria-label={`Убрать: ${student.title}`}>
                <X aria-hidden="true" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="block space-y-2 text-sm">
        <span className="font-medium text-foreground">Найти ученика</span>
        <span className="relative block">
          <Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={search} disabled={disabled} maxLength={100} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Имя, фамилия или email" className={`${inputClass} pl-9`} />
        </span>
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border" aria-busy={loading}>
        {results.map((student) => (
          <li key={student.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="min-w-0 break-words text-foreground">{student.title}</span>
            <button type="button" aria-label={chosen.has(student.id) ? `Выбран: ${student.title}` : `Добавить: ${student.title}`} disabled={disabled || chosen.has(student.id) || limitReached} onClick={() => onChange([...selected, student])} className={`${buttonClass} shrink-0 gap-1.5 px-3`}>
              <UserPlus aria-hidden="true" size={15} />
              {chosen.has(student.id) ? 'Выбран' : 'Добавить'}
            </button>
          </li>
        ))}
        {!loading && results.length === 0 && !error && <li className="px-3 py-4 text-sm text-muted-foreground">Ученики не найдены</li>}
        {loading && <li className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground" role="status"><Loader2 aria-hidden="true" size={15} className="animate-spin" />Загружаем…</li>}
      </ul>
      {limitReached && <p className="text-sm text-muted-foreground">Можно выбрать не больше {BROADCAST_LIMITS.recipients} учеников. Для большей аудитории выберите «Все активные ученики».</p>}
      {/* Кнопка остаётся на месте во время загрузки: иначе фокус клавиатуры улетел бы на body. */}
      {hasNextPage && <button type="button" className={buttonClass} disabled={disabled || loading} aria-busy={loading} onClick={() => setPage((current) => current + 1)}>Показать ещё</button>}
    </div>
  )
}

export function BroadcastForm({ initial, allStudents }: Props) {
  const router = useRouter()
  const { draft, setDraft, dirty, markSaved, canLeave } = useContentDraft<BroadcastFormValue>(initial ?? empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function change<K extends keyof BroadcastFormValue>(key: K, value: BroadcastFormValue[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    if (draft.audience === 'selected' && draft.recipients.length === 0) {
      setError('Выберите хотя бы одного ученика')
      return
    }
    setSaving(true)
    setError('')
    try {
      const body = {
        subject: draft.subject.trim(),
        body: draft.body.trim(),
        ctaLabel: draft.ctaLabel.trim() || null,
        ctaUrl: draft.ctaUrl.trim() || null,
        audience: draft.audience,
        recipients: draft.audience === 'selected' ? draft.recipients.map((item) => item.id) : [],
      }
      const result = await broadcastRequest(initial?.id ? `/api/manage/broadcasts/${initial.id}` : '/api/manage/broadcasts', initial?.id ? 'PATCH' : 'POST', body)
      const doc = result.doc
      const id = doc && typeof doc === 'object' && 'id' in doc && typeof doc.id === 'number' ? doc.id : null
      if (!id) throw new Error('Сервер не подтвердил сохранение. Обновите страницу')
      markSaved(draft)
      router.push(`/manage/broadcasts/${id}`)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить рассылку')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset disabled={saving} className={panelClass}>
        <legend className="sr-only">Письмо</legend>
        <label className="block space-y-2 text-sm">
          <span className="font-medium text-foreground">Тема письма</span>
          <input required value={draft.subject} maxLength={BROADCAST_LIMITS.subject} onChange={(event) => change('subject', event.target.value)} className={inputClass} placeholder="Например: Новый курс по Node.js уже на платформе" />
        </label>
        <div className="space-y-2 text-sm">
          <label htmlFor="broadcast-body" className="block font-medium text-foreground">Текст письма</label>
          <textarea id="broadcast-body" required value={draft.body} maxLength={BROADCAST_LIMITS.body} rows={12} onChange={(event) => change('body', event.target.value)} className={`${inputClass} min-h-48 leading-relaxed`} placeholder="Приветствие с именем ученика добавится автоматически." aria-describedby="broadcast-body-hint" />
          <p id="broadcast-body-hint" className="text-xs leading-relaxed text-muted-foreground">
            Пустая строка - новый абзац. <code className="rounded bg-muted px-1">**жирный**</code>, <code className="rounded bg-muted px-1">[текст](https://…)</code> и адреса https://… превращаются в ссылки. Остальная разметка выводится как текст. {draft.body.length}/{BROADCAST_LIMITS.body}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-foreground">Кнопка в письме <span className="font-normal text-muted-foreground">(необязательно)</span></span>
            <input value={draft.ctaLabel} maxLength={BROADCAST_LIMITS.ctaLabel} onChange={(event) => change('ctaLabel', event.target.value)} className={inputClass} placeholder="Открыть курс" />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-foreground">Ссылка кнопки</span>
            <input value={draft.ctaUrl} maxLength={BROADCAST_LIMITS.ctaUrl} onChange={(event) => change('ctaUrl', event.target.value)} className={inputClass} placeholder="/courses или https://…" inputMode="url" />
          </label>
        </div>
      </fieldset>

      <fieldset disabled={saving} className={panelClass}>
        <legend className="px-1 text-base font-semibold text-foreground">Получатели</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ['all', 'Все активные ученики', `Сейчас получат: ${allStudents.recipients}${allStudents.excluded ? `. Не получат (отписались или без адреса): ${allStudents.excluded}` : ''}`],
            ['selected', 'Выбранные ученики', draft.recipients.length ? `Выбрано: ${draft.recipients.length}` : 'Выберите учеников из списка'],
          ] as const).map(([value, label, hint]) => (
            <label key={value} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${draft.audience === value ? 'border-primary bg-accent' : 'border-border'}`}>
              <input type="radio" name="audience" value={value} checked={draft.audience === value} onChange={() => change('audience', value)} className="mt-1 h-4 w-4 shrink-0 accent-primary" />
              <span><strong className="block text-foreground">{label}</strong><span className="mt-1 block text-muted-foreground">{hint}</span></span>
            </label>
          ))}
        </div>
        {draft.audience === 'selected' && <StudentPicker selected={draft.recipients} disabled={saving} onChange={(value) => change('recipients', value)} />}
        <p className="text-xs leading-relaxed text-muted-foreground">Письмо не уйдёт отключённым аккаунтам и тем, кто отписался от рассылок. Точный список фиксируется в момент запуска.</p>
      </fieldset>

      <div className="space-y-3">
        {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving} className={`${buttonClass} gap-2 border-primary bg-primary text-primary-foreground`}>
            {saving && <Loader2 aria-hidden="true" size={16} className="animate-spin" />}
            {saving ? 'Сохраняем…' : initial?.id ? 'Сохранить черновик' : 'Создать черновик'}
          </button>
          <button type="button" disabled={saving} className={buttonClass} onClick={() => { if (canLeave()) router.push(initial?.id ? `/manage/broadcasts/${initial.id}` : '/manage/broadcasts') }}>Отмена</button>
          <span className="text-sm text-muted-foreground">{dirty ? 'Есть несохранённые изменения' : 'Изменений нет'}</span>
        </div>
        <p className="text-xs text-muted-foreground">После сохранения откроется предпросмотр письма: там можно отправить тест себе и запустить рассылку.</p>
      </div>
    </form>
  )
}
