'use client'

import { CheckCircle2, Play, Send } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { CodeEditor } from '@/components/trainer/CodeEditor'
import { TestResultsPanel } from '@/components/trainer/TestResultsPanel'
import type { TrainerRunResult } from '@/lib/trainer/types'
import { pluralize } from '@/lib/utils'

export type EntryTaskView = {
  slug: string
  title: string
  starterCode: string
  testCount: number
  description: ReactNode
}

type Submission = { passed: number, total: number, submissionsLeft: number, tasks: { slug: string, title: string, attempted: boolean, passed: number, total: number }[] }

type Props = {
  token: string
  tasks: EntryTaskView[]
  /** Код последней отправки: открывает задание с того места, где кандидат остановился, и на другом устройстве. */
  saved: Record<string, string>
  lastSubmission: { at: string, passed: number, total: number } | null
  maxSubmissions: number
  submissionsLeft: number
  reviewDays: number
}

const draftKey = (token: string, slug: string) => `entry-task:${token}:${slug}`

function readDraft(token: string, slug: string): string | null {
  try {
    return window.localStorage.getItem(draftKey(token, slug))
  } catch {
    // Хранилище закрыто (приватное окно, запрет cookie): черновик живёт только в памяти страницы.
    return null
  }
}

function writeDraft(token: string, slug: string, code: string): void {
  try {
    window.localStorage.setItem(draftKey(token, slug), code)
  } catch {
    // См. readDraft: без хранилища черновик не переживёт перезагрузку, но решать это не мешает.
  }
}

class EntryRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null
  if (!response.ok || !data) throw new EntryRequestError(data?.error ?? 'Не получилось связаться с сервером. Проверьте интернет и попробуйте ещё раз.', response.status)
  return data
}

const formatAt = (value: string) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }).format(new Date(value))

export function EntryTaskWorkspace({ token, tasks, saved, lastSubmission, maxSubmissions, submissionsLeft, reviewDays }: Props) {
  const [code, setCode] = useState<Record<string, string>>(() => Object.fromEntries(tasks.map((task) => [task.slug, saved[task.slug] ?? task.starterCode])))
  const [results, setResults] = useState<Record<string, TrainerRunResult | undefined>>({})
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [checking, setChecking] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submission, setSubmission] = useState<Submission | null>(null)
  // Отправки могли кончиться в другой вкладке: сервер ответит 409, и кнопка пропадёт и здесь.
  const [exhausted, setExhausted] = useState(false)

  // Черновик из браузера свежее отправленного кода: подставляем его после гидратации, чтобы разметка сервера совпала.
  useEffect(() => {
    const drafts = Object.fromEntries(tasks.flatMap((task) => {
      const draft = readDraft(token, task.slug)
      return draft === null ? [] : [[task.slug, draft]]
    }))
    if (Object.keys(drafts).length > 0) setCode((current) => ({ ...current, ...drafts }))
  }, [tasks, token])

  const change = (slug: string, value: string) => {
    setCode((current) => ({ ...current, [slug]: value }))
    writeDraft(token, slug, value)
  }

  const check = async (slug: string) => {
    setChecking(slug)
    setErrors((current) => ({ ...current, [slug]: undefined }))
    try {
      const { result } = await postJson<{ result: TrainerRunResult }>(`/api/entry-task/${token}/check`, { task: slug, code: code[slug] })
      setResults((current) => ({ ...current, [slug]: result }))
    } catch (error) {
      setErrors((current) => ({ ...current, [slug]: error instanceof Error ? error.message : String(error) }))
    } finally {
      setChecking(null)
    }
  }

  const submit = async () => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      // Нетронутая заготовка не решение: сервер посчитает такую задачу нерешённой.
      const solutions = Object.fromEntries(tasks.map((task) => [task.slug, code[task.slug] === task.starterCode ? '' : code[task.slug]]))
      setSubmission(await postJson<Submission>(`/api/entry-task/${token}/submit`, { solutions }))
    } catch (error) {
      if (error instanceof EntryRequestError && error.status === 409) {
        setExhausted(true)
        setSubmission(null)
      } else setSubmitError(error instanceof Error ? error.message : String(error))
    } finally {
      setSubmitting(false)
    }
  }

  const busy = checking !== null || submitting
  const left = exhausted ? 0 : submission?.submissionsLeft ?? submissionsLeft

  return (
    <div className="space-y-10">
      {tasks.map((task, index) => (
        <section key={task.slug} aria-labelledby={`task-${task.slug}`} className="space-y-4">
          <h2 id={`task-${task.slug}`} className="text-2xl font-semibold tracking-tight">{index + 1}. {task.title}</h2>
          {task.description}
          <div className="overflow-hidden rounded-xl border border-border">
            <CodeEditor
              value={code[task.slug] ?? ''}
              onChange={(value) => change(task.slug, value)}
              language="js"
              ariaLabel={`Решение задачи «${task.title}»`}
              readOnly={submitting}
              height={320}
              onRun={() => { if (!busy) void check(task.slug) }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void check(task.slug)}
              disabled={busy}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-base font-medium hover:bg-accent disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              Проверить
            </button>
            <span className="text-sm text-muted-foreground">Тестов у задачи: {task.testCount}. Проверять можно сколько угодно раз.</span>
          </div>
          {errors[task.slug] && <p role="alert" className="text-sm text-destructive">{errors[task.slug]}</p>}
          {(checking === task.slug || results[task.slug]) && (
            <div aria-live="polite">
              <TestResultsPanel result={results[task.slug] ?? null} isRunning={checking === task.slug} origin="server" />
            </div>
          )}
        </section>
      ))}

      <section aria-labelledby="entry-submit" className="space-y-4 rounded-xl border border-border bg-card px-5 py-5">
        <h2 id="entry-submit" className="text-2xl font-semibold tracking-tight">Отправить решение</h2>
        <p className="text-base leading-relaxed">
          Когда будете готовы, отправьте решение. Сервер ещё раз прогонит тесты всех задач, а мы получим ваш код и ответим в течение {reviewDays} дней.
          Нерешённую задачу можно оставить как есть. Всего у вас {pluralize(maxSubmissions, 'отправка', 'отправки', 'отправок')}, мы посмотрим последнюю, поэтому сначала проверьте задачи кнопкой «Проверить».
        </p>
        {lastSubmission && !submission && (
          <p className="text-base text-muted-foreground">
            Последняя отправка {formatAt(lastSubmission.at)}: пройдено {lastSubmission.passed} из {lastSubmission.total} тестов.
            {left > 0 && ` Осталось отправок: ${left}.`}
          </p>
        )}
        {left > 0 ? (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {submitting ? 'Отправляем…' : 'Отправить решение'}
          </button>
        ) : !submission && (
          <p role="status" className="text-base leading-relaxed">
            Вы отправили решение {pluralize(maxSubmissions, 'раз', 'раза', 'раз')}, больше отправок нет. Мы посмотрим последнюю отправку и ответим на почту из заявки в течение {reviewDays} дней.
          </p>
        )}
        {submitError && <p role="alert" className="text-base text-destructive">{submitError}</p>}
        {submission && (
          <div role="status" className="space-y-2 text-base leading-relaxed">
            <p className="flex items-center gap-2 font-medium text-success">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              Решение отправлено. Пройдено {submission.passed} из {submission.total} тестов.
            </p>
            <ul className="list-disc space-y-1 pl-6">
              {submission.tasks.map((task) => (
                <li key={task.slug}>{task.title}: {task.attempted ? `${task.passed} из ${task.total}` : 'не решалась'}</li>
              ))}
            </ul>
            <p>
              {left > 0
                ? `Спасибо! Мы ответим на почту из заявки в течение ${reviewDays} дней. Если захотите что-то исправить, осталось отправок: ${left}.`
                : `Спасибо! Это была последняя отправка. Мы ответим на почту из заявки в течение ${reviewDays} дней.`}
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
