'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import ReactMarkdown from 'react-markdown'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Copy, ArrowLeft, Square, Users } from 'lucide-react'
import { Button } from './InterviewButton'
import { CodeEditor } from '@/components/trainer/CodeEditor'
import { useCodeRunner } from '@/components/trainer/useCodeRunner'
import { useInterviewRoom } from './useInterviewRoom'
import type { TrainerLanguage, TrainerRunResult } from '@/lib/trainer/types'
import { LANGUAGE_OPTIONS } from '@/lib/trainer/constants'
import { isFrontendLanguage, isRuntimeLanguage } from '@/lib/trainer/runtime-spec'
import { interviewStarter, interviewLanguage } from '@/lib/trainer/interview'
import type { RuntimePreview } from '@/server/trainer/runtime'

const FrontendEditor = dynamic(() => import('@/components/trainer/FrontendEditor').then((module) => module.FrontendEditor), { ssr: false, loading: () => <p className="p-4 text-sm">Загружаем редактор проекта…</p> })

function elapsed(start: string, end: string | null, now: number): string {
  const seconds = Math.max(0, Math.floor(((end ? Date.parse(end) : now) - Date.parse(start)) / 1000))
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

async function releasePreviewLease(leaseToken: string, keepalive = false): Promise<boolean> {
  try {
    const response = await fetch(`/api/trainer/preview-release/${leaseToken}`, { method: 'POST', credentials: 'omit', keepalive })
    return response.ok
  } catch {
    // При закрытии вкладки остаётся серверный срок жизни сессии.
    return false
  }
}

export function InterviewWorkspace({ token }: { token: string }) {
  const state = useInterviewRoom(token)
  const { room, draft, edit } = state
  const { run: runCode, cancel: cancelCode } = useCodeRunner()
  const [result, setResult] = useState<TrainerRunResult | null>(null)
  const [preview, setPreview] = useState<RuntimePreview | null>(null)
  const [running, setRunning] = useState(false)
  const [autorun, setAutorun] = useState(false)
  const [runError, setRunError] = useState('')
  const [notice, setNotice] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const abortRef = useRef<AbortController | null>(null)
  const runId = useRef(0)
  const previewLease = useRef<string | null>(null)
  const languageDrafts = useRef<Partial<Record<TrainerLanguage, string>>>({})
  const roomSetup = room?.setupCode ?? ''
  const ready = !!room

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const releaseOnExit = () => { if (previewLease.current) void releasePreviewLease(previewLease.current, true) }
    window.addEventListener('pagehide', releaseOnExit)
    return () => {
      runId.current += 1
      abortRef.current?.abort()
      window.removeEventListener('pagehide', releaseOnExit)
      releaseOnExit()
    }
  }, [])
  useEffect(() => {
    const leaseToken = preview?.leaseToken
    return () => {
      if (!leaseToken) return
      void releasePreviewLease(leaseToken, true).then((released) => {
        if (released && previewLease.current === leaseToken) previewLease.current = null
      })
    }
  }, [preview?.leaseToken])

  const run = useCallback(async () => {
    if (room?.endedAt || state.blocked) return
    const id = ++runId.current
    cancelCode()
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    setRunError('')
    setResult(null)
    try {
      const previousLease = previewLease.current
      if (previousLease) {
        const released = await releasePreviewLease(previousLease)
        if (id !== runId.current) return
        if (!released) throw new Error('Не удалось закрыть прежний предпросмотр. Повторите запуск.')
        if (previewLease.current === previousLease) previewLease.current = null
      }
      if (id !== runId.current) return
      setPreview(null)
      let code = draft.code
      if (isRuntimeLanguage(draft.language)) {
        const response = await fetch(`/api/trainer/interview/${token}/run`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, language: draft.language }), signal: controller.signal,
        })
        const output = await response.json()
        if (!response.ok) throw new Error(output.error ?? 'Не удалось запустить код')
        if (id !== runId.current) {
          if (output.preview?.leaseToken) void releasePreviewLease(output.preview.leaseToken, true)
          return
        }
        if (isFrontendLanguage(draft.language)) {
          previewLease.current = output.preview.leaseToken ?? null
          setPreview(output.preview)
        } else setResult(output.result)
        return
      }
      if (draft.language === 'ts') {
        const response = await fetch(`/api/trainer/interview/${token}/compile`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, language: draft.language }), signal: controller.signal,
        })
        const compiled = await response.json()
        if (!response.ok) throw new Error(compiled.error ?? 'Не удалось скомпилировать код')
        if (id !== runId.current) return
        if (compiled.diagnostics.length) {
          setRunError(compiled.diagnostics.map((item: { line: number; message: string }) => `Строка ${item.line}: ${item.message}`).join('\n'))
          return
        }
        code = compiled.js
      }
      const output = await runCode({
        allowNoTests: true,
        checkMode: 'unit', language: draft.language, setupCode: roomSetup, userCode: code,
        testCode: '', cases: [], entryName: '', timeLimitMs: 2000,
      })
      if (id === runId.current) setResult(output)
    } catch (cause) {
      if (id === runId.current && !(cause instanceof Error && cause.name === 'AbortError')) {
        setRunError(cause instanceof Error ? cause.message : 'Не удалось запустить код')
      }
    } finally {
      if (id === runId.current) setRunning(false)
    }
  }, [draft.code, draft.language, room?.endedAt, roomSetup, runCode, cancelCode, token, state.blocked])

  useEffect(() => {
    if (!autorun || isRuntimeLanguage(draft.language) || !ready || room?.endedAt || state.conflict || state.blocked || document.hidden) return
    const timer = setTimeout(() => void run(), draft.language === 'ts' ? 2500 : 1200)
    return () => clearTimeout(timer)
  }, [autorun, draft.code, draft.language, room?.endedAt, state.conflict, state.blocked, run, ready])

  function changeLanguage(value: string) {
    const language = interviewLanguage(value)
    languageDrafts.current[draft.language] = draft.code
    const bothScript = !isRuntimeLanguage(language) && !isRuntimeLanguage(draft.language)
    const code = languageDrafts.current[language] ?? (bothScript ? draft.code : interviewStarter(language))
    runId.current += 1
    abortRef.current?.abort()
    cancelCode()
    setRunning(false)
    setPreview(null)
    setResult(null)
    setRunError('')
    if (!bothScript) setNotice('Предыдущий черновик сохранён в этой вкладке. Чтобы вернуться к нему, выберите прежний язык.')
    edit({ code, language })
  }

  async function invite() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/trainer/interview/${token}`)
      setNotice('Ссылка скопирована. Отправьте её собеседнику с аккаунтом на платформе.')
    } catch {
      setNotice(`Скопируйте адрес из строки браузера: /trainer/interview/${token}`)
    }
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft.code)
      setNotice('Ваш черновик скопирован.')
    } catch {
      setNotice('Выделите код в редакторе и скопируйте его вручную.')
    }
  }

  if (!room) return (
    <div className="space-y-4" aria-live="polite">
      <h1 className="text-2xl font-bold">Комната собеседования</h1>
      <p>{state.error || 'Подключаемся к комнате…'}</p>
      <Link href="/trainer" className="underline">Вернуться в тренажёр</Link>
    </div>
  )

  const online = room.participants.filter((person) => now - Date.parse(person.lastSeen) < 35_000)
  return (
    <div className="space-y-4">
      <Link href="/trainer" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />Тренажёр</Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{room.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Собеседование · {elapsed(room.createdAt, room.endedAt, now)}{room.endedAt ? ' · Завершено' : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <details className="text-sm"><summary className="inline-flex cursor-pointer items-center gap-2"><Users size={16} />Онлайн: {online.length}</summary><ul className="mt-2 space-y-1">{room.participants.map((person) => <li key={person.id}>{person.name}{online.some((item) => item.id === person.id) ? ' · онлайн' : ' · отошёл'}</li>)}</ul></details>
          <Button variant="outline" size="sm" onClick={() => void invite()} disabled={!!room.endedAt || state.blocked}><Copy size={14} />Пригласить</Button>
          {room.ownerId === state.userId && !room.endedAt && <Button variant="outline" size="sm" onClick={() => {
            if (window.confirm('Завершить собеседование? Код останется доступен участникам, редактирование закроется.')) void state.save(true)
          }} disabled={state.saving || state.dirty || !!state.conflict || state.blocked}>Завершить</Button>}
        </div>
      </header>
      <p className="text-xs text-muted-foreground">Общий код синхронизируется после паузы. Консоль запускается у каждого участника отдельно. Баллы и прогресс не меняются.</p>
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {room.endedAt && state.dirty && <div className="space-y-2 rounded-md border border-warning p-3 text-sm"><p>Комната завершена. Скопируйте несохранённый черновик до выхода.</p><Button size="sm" variant="outline" onClick={() => void copyDraft()}>Скопировать мой черновик</Button></div>}
      {state.error && <div role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive"><p>{state.error} Ваш код остаётся в редакторе.</p>{state.dirty && !state.blocked && <Button variant="outline" size="sm" className="mt-2" onClick={() => void state.save()} disabled={state.saving || !!state.conflict}>Повторить сохранение</Button>}{state.blocked && <Button size="sm" variant="outline" className="mt-2" onClick={() => void copyDraft()}>Скопировать мой черновик</Button>}</div>}
      {state.conflict && (
        <section role="alert" className="space-y-3 rounded-md border border-warning bg-warning/5 p-4">
          <p className="font-medium">Другой участник изменил код</p>
          <p className="text-sm">Ваш черновик сохранён в редакторе. Сравните версии и выберите, какую отправить в общую комнату.</p>
          <details><summary className="cursor-pointer text-sm underline">Посмотреть общую версию</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-secondary p-3 text-xs">{state.conflict.code}</pre></details>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => state.resolve(false)}>Принять общую версию</Button>
            <Button size="sm" onClick={() => state.resolve(true)} disabled={!!room.endedAt || state.blocked}>Сохранить мой черновик вместо неё</Button>
            <Button size="sm" variant="outline" onClick={() => void copyDraft()}>Скопировать мой черновик</Button>
          </div>
        </section>
      )}
      <div className={`grid gap-4 ${room.descriptionMd ? 'lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]' : ''}`}>
        {room.descriptionMd && <aside className="max-h-[70vh] overflow-auto rounded-lg border p-4"><h2 className="mb-4 font-semibold">Условие</h2><div className="prose prose-sm dark:prose-invert max-w-none"><ReactMarkdown>{room.descriptionMd}</ReactMarkdown></div></aside>}
        <section className="min-w-0 overflow-hidden rounded-lg border" aria-label="Общий редактор">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-secondary/40 px-3 py-2">
            <label className="flex items-center gap-2 text-sm">Язык<select aria-label="Язык решения" className="rounded border bg-background px-2 py-1" value={draft.language} disabled={!!room.endedAt || !!state.conflict || state.blocked} onChange={(event) => changeLanguage(event.target.value)}>{LANGUAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <span role="status" className="text-xs text-muted-foreground">{state.saving ? 'Сохраняем…' : state.conflict ? 'Нужно выбрать версию' : state.dirty ? 'Есть несохранённые изменения' : 'Код сохранён'}</span>
          </div>
          {isFrontendLanguage(draft.language)
            ? <FrontendEditor value={draft.code} onChange={(code) => edit({ ...draft, code })} language={draft.language} readOnly={!!room.endedAt || state.blocked} onRun={() => void run()} previewHtml={preview?.html} previewUrl={preview?.previewPath} />
            : <CodeEditor value={draft.code} onChange={(code) => edit({ ...draft, code })} language={draft.language} readOnly={!!room.endedAt || state.blocked} height="52vh" onRun={() => void run()} />}
          <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2">
            <Button size="sm" onClick={() => void run()} disabled={running || !!room.endedAt || state.blocked}><Play size={14} />Запустить</Button>
            {running && <Button size="sm" variant="outline" onClick={() => { runId.current += 1; abortRef.current?.abort(); cancelCode(); setRunning(false) }}><Square size={14} />Остановить</Button>}
            {!isRuntimeLanguage(draft.language) && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autorun} disabled={!!room.endedAt || state.blocked} onChange={(event) => setAutorun(event.target.checked)} />Автозапуск</label>}
            <span className="text-xs text-muted-foreground">Ctrl/⌘ + Enter</span>
          </div>
          {draft.language === 'next' && <p className="border-t p-3 text-xs text-muted-foreground">Предпросмотр Next.js доступен короткое время. Нажмите «Запустить» снова, чтобы обновить страницу и продолжить работу.</p>}
          <div className="min-h-36 border-t bg-secondary/20 p-3" aria-label="Консоль">
            <h2 className="mb-2 text-sm font-semibold">Консоль {running && <span className="font-normal text-muted-foreground">· Выполняется…</span>}</h2>
            {(runError || result?.error) && <pre role="alert" className="whitespace-pre-wrap break-words text-xs text-destructive">{runError || result?.error}</pre>}
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm">{result?.consoleOutput.join('\n') || (!running && !runError && !result?.error ? draft.language === 'python' ? 'Добавьте print и нажмите «Запустить». Стандартный ввод пустой.' : draft.language === 'go' ? 'Добавьте fmt.Println в main и нажмите «Запустить». Стандартный ввод пустой.' : isFrontendLanguage(draft.language) ? 'Измените файлы проекта и нажмите «Запустить», чтобы обновить предпросмотр.' : 'Добавьте console.log или свои test/expect и нажмите «Запустить».' : '')}</pre>
            {!!result?.tests.length && <div className="mt-3 space-y-2 text-xs"><p>Ваши проверки: {result.passedCount} из {result.totalCount}</p>{result.tests.map((test, index) => <div key={index} className={test.passed ? 'text-success' : 'text-destructive'}><p>{test.passed ? '✓' : '✗'} {test.name}</p>{test.message && <pre className="whitespace-pre-wrap break-words">{test.message}</pre>}</div>)}</div>}
          </div>
        </section>
      </div>
    </div>
  )
}
