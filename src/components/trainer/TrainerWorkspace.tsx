'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { CustomProgramCases } from './CustomProgramCases'
import { isTrainerLanguage, isFrontendLanguage, isRuntimeLanguage } from '@/lib/trainer/runtime-spec'
import type { RuntimeCase } from '@/lib/trainer/runtime-spec'
import { ArrowRight, Play, RotateCcw, Send, Trophy } from 'lucide-react'

import { CodeEditor } from './CodeEditor'
import { TestResultsPanel } from './TestResultsPanel'
import { useCodeRunner } from './useCodeRunner'
import { CustomTestCases } from './CustomTestCases'
import { LANGUAGE_LABELS, TRAINER_LIMITS } from '@/lib/trainer/constants'
import { failureResult } from '@/lib/trainer/result'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { useHydrated } from '@/hooks/use-hydrated'
import { queryHref } from '@/lib/shared-url'
import { ShareButton } from '@/components/ui/ShareButton'
import type { ClientProgress, ClientTaskSpec, SubmitResponse } from '@/lib/trainer/api'
import type { TrainerCaseSpec, TrainerDiagnostic, TrainerLanguage, TrainerRunResult } from '@/lib/trainer/types'

/**
 * Рабочая область решения задачи.
 *
 * Две кнопки с разной природой:
 *   «Запустить» — публичные тесты и предпросмотр, без сохранения прогресса.
 *                 JS/TS — Worker, Go/frontend — отдельная среда выполнения.
 *   «Отправить» — сервер берёт полный набор тестов (включая скрытые)
 *                 и проверяет решение в соответствующей песочнице. Только
 *                 по своему вердикту пишет прогресс и начисляет баллы.
 */

type TrainerWorkspaceProps = {
  task: ClientTaskSpec
  progress: ClientProgress
  /** Ближайшая нерешённая задача темы — к ней ведёт кнопка после решения. */
  nextTask?: { href: string; title: string } | null
  /** Куда вернуться, когда в теме решено всё. */
  topicHref?: string
}

const FrontendEditor = dynamic(() => import('./FrontendEditor').then((module) => module.FrontendEditor), { loading: () => <p role="status">Загружаем файлы проекта…</p> })

/**
 * Заглушка для локального прогона задач, которые сверяются с эталонным выводом.
 * Сам эталон на клиент не уезжает, поэтому здесь проверяется только то, что код
 * выполнился без исключения, а вывод показывается на вкладке «Консоль».
 */
const PREVIEW_TEST = `__tr.register({ name: 'Код выполнен без ошибок' }, function () {});`

/** Ключ черновика: решение переживает перезагрузку страницы. */
function draftKey(taskId: string, language: TrainerLanguage): string {
  return `lms.trainer.draft.${taskId}.${language}`
}

function languageKey(taskId: string): string {
  return `lms.trainer.language.${taskId}`
}

function readDraft(taskId: string, language: TrainerLanguage): string | null {
  try {
    return window.localStorage.getItem(draftKey(taskId, language))
  } catch {
    return null
  }
}

function writeDraft(taskId: string, language: TrainerLanguage, code: string): void {
  try {
    window.localStorage.setItem(draftKey(taskId, language), code)
  } catch {
    // приватный режим или переполненное хранилище — черновик не критичен
  }
}

export function TrainerWorkspace(props: TrainerWorkspaceProps) {
  return <TrainerWorkspaceSession key={props.task.id} {...props} />
}

function TrainerWorkspaceSession({ task, progress, nextTask = null, topicHref }: TrainerWorkspaceProps) {
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const { toast: showToast } = useToast()
  const runner = useCodeRunner()

  const savedLanguage: TrainerLanguage =
    progress.savedLanguage && task.languages.includes(progress.savedLanguage)
      ? progress.savedLanguage
      : (task.languages[0] ?? 'js')

  const requestedLanguage = search.get('lang')
  const language: TrainerLanguage = isTrainerLanguage(requestedLanguage) && task.languages.includes(requestedLanguage) ? requestedLanguage : savedLanguage
  const [code, setCode] = useState<string>(
    () => (language === progress.savedLanguage ? progress.savedCode : null) ?? task.starters[language] ?? '',
  )
  const [preview, setPreview] = useState<{ html?: string; previewPath?: string; leaseToken?: string } | null>(null)
  useEffect(() => {
    const token = preview?.leaseToken
    const release = () => {
      if (token) void fetch(`/api/trainer/preview-release/${encodeURIComponent(token)}`, { method: 'POST', keepalive: true, credentials: 'omit' }).catch(() => undefined)
    }
    window.addEventListener('pagehide', release)
    return () => { window.removeEventListener('pagehide', release); release() }
  }, [preview?.leaseToken])
  const [previewSource, setPreviewSource] = useState('')
  const [programTests, setProgramTests] = useState<{ taskId: string; cases: RuntimeCase[] }>({ taskId: task.id, cases: [] })
  const programCases = useMemo(() => programTests.taskId === task.id ? programTests.cases : [], [programTests, task.id])
  const [result, setResult] = useState<TrainerRunResult | null>(null)
  const [origin, setOrigin] = useState<'client' | 'server' | null>(null)
  const [diagnostics, setDiagnostics] = useState<TrainerDiagnostic[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [completed, setCompleted] = useState(progress.isCompleted)
  const [attempts, setAttempts] = useState(progress.attempts)
  const [customTests, setCustomTests] = useState<{ taskId: string; cases: TrainerCaseSpec[] }>({ taskId: task.id, cases: [] })
  const customCases = useMemo(
    () => customTests.taskId === task.id ? customTests.cases : [],
    [customTests, task.id],
  )

  const [focusLine, setFocusLine] = useState<number | undefined>(undefined)

  // Черновик лежит в localStorage по паре (задача, язык): переключение языка не
  // должно терять ни одно из двух решений, а перезагрузка страницы — оба.
  const hydrated = useHydrated()
  const draftSlot = `${task.id}:${language}`
  const [loadedSlot, setLoadedSlot] = useState<string | null>(null)

  // Подстройка состояния под смену пропсов делается в фазе рендера, а не в
  // эффекте: так React не успевает показать чужой код и не идёт лишний проход.
  // Читать localStorage раньше гидратации нельзя — на сервере его нет.
  if (hydrated && loadedSlot !== draftSlot) {
    setLoadedSlot(draftSlot)
    const draft = readDraft(task.id, language)
    const restored = draft ?? (language === progress.savedLanguage ? progress.savedCode : null)
    setCode(restored ?? task.starters[language] ?? '')
    setResult(null)
    setPreview(null)
    setOrigin(null)
    setDiagnostics([])
    setFocusLine(undefined)
  }

  const busy = isRunning || isSubmitting
  const ready = hydrated && loadedSlot === draftSlot

  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(() => {
      writeDraft(task.id, language, code)
      try {
        window.localStorage.setItem(languageKey(task.id), language)
      } catch {
        // приватный режим — не критично
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [code, language, ready, task.id])

  const handleLanguageChange = useCallback((next: TrainerLanguage) => {
    if (!ready || busy || next === language) return
    // Смена языка может произойти раньше отложенной записи черновика.
    writeDraft(task.id, language, code)
    window.history.pushState(null, '', queryHref(pathname, search.toString(), { lang: next }))
  }, [busy, code, language, ready, task.id, pathname, search])

  /**
   * Готовит исполняемый JavaScript. Для TypeScript это делает сервер: тащить в
   * браузер восьмимегабайтный компилятор ради подсветки ошибок незачем, а
   * вердикт по типам всё равно должен совпадать с серверным.
   */
  const prepareJavaScript = useCallback(
    async (source: string): Promise<{ js: string; diagnostics: TrainerDiagnostic[] } | null> => {
      if (language === 'js') return { js: source, diagnostics: [] }

      const response = await fetch('/api/trainer/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ taskId: task.id, code: source }),
      })

      if (!response.ok) {
        const message = await response
          .json()
          .then((data: { error?: string }) => data.error)
          .catch(() => undefined)
        showToast(message ?? 'Не удалось скомпилировать решение', 'error')
        return null
      }

      return (await response.json()) as { js: string; diagnostics: TrainerDiagnostic[] }
    },
    [language, showToast, task.id],
  )

  const handleRun = useCallback(async () => {
    if (!ready || busy || code.trim().length === 0) return

    setIsRunning(true)
    setResult(null)
    setOrigin('client')
    setFocusLine(undefined)

    try {
      if (isRuntimeLanguage(language)) {
        if (preview?.leaseToken) {
          const released = await fetch(`/api/trainer/preview-release/${encodeURIComponent(preview.leaseToken)}`, { method: 'POST', credentials: 'omit' })
          if (!released.ok) throw new Error('Не удалось закрыть предыдущий предпросмотр. Повторите запуск.')
          setPreview(null)
        }
        const response = await fetch('/api/trainer/run', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ taskId: task.id, language, code, ...((language === 'go' || language === 'python') ? { customCases: programCases } : {}) }),
        })
        const data = await response.json() as { result?: TrainerRunResult; preview?: { html?: string; previewPath?: string; leaseToken?: string }; error?: string }
        if (!response.ok || !data.result) throw new Error(data.error ?? 'Не удалось запустить решение')
        if (!mounted.current) {
          if (data.preview?.leaseToken) void fetch(`/api/trainer/preview-release/${encodeURIComponent(data.preview.leaseToken)}`, { method: 'POST', keepalive: true, credentials: 'omit' }).catch(() => undefined)
          return
        }
        setResult(data.result)
        setDiagnostics([])
        setPreview(data.preview ?? null)
        setPreviewSource(code)
        return
      }
      const compiled = await prepareJavaScript(code)
      if (!compiled) return

      setDiagnostics(compiled.diagnostics)

      const errors = compiled.diagnostics.filter((item) => item.category === 'error')
      if (errors.length > 0) {
        const first = errors[0]
        setResult({
          status: 'compile_error',
          tests: [],
          passedCount: 0,
          totalCount: 0,
          consoleOutput: [],
          diagnostics: compiled.diagnostics,
          error: first.message,
          ...(first.inHarness ? {} : { errorLine: first.line }),
          totalMs: 0,
        })
        return
      }

      if (task.checkMode === 'types') {
        // Задачи на систему типов ничего не исполняют: ноль диагностик и есть ответ.
        setResult({
          status: 'passed',
          tests: [
            { name: 'Типы соответствуют условию', hidden: false, passed: true, durationMs: 0 },
          ],
          passedCount: 1,
          totalCount: 1,
          consoleOutput: [],
          totalMs: 0,
        })
        return
      }

      const runResult = await runner.run({
        // Эталонный вывод живёт только на сервере, поэтому локально
        // stdout-задача не сверяется с ним: код просто исполняется, а
        // вердикт даёт «Отправить». Одного пустого теста достаточно,
        // чтобы пользователь увидел свой вывод и упавшее исключение.
        checkMode: 'unit',
        language,
        setupCode: task.setupCode,
        userCode: compiled.js,
        testCode: task.checkMode === 'unit' ? task.testCode : PREVIEW_TEST,
        cases: task.checkMode === 'unit' ? [...task.publicCases, ...customCases] : [],
        entryName: task.entryName,
        expectedOutput: undefined,
        timeLimitMs: task.timeLimitMs,
      })

      setResult(runResult)
      if (runResult.errorLine) setFocusLine(runResult.errorLine)
    } catch (error) {
      setResult(
        failureResult('error', error instanceof Error ? error.message : 'Не удалось запустить код'),
      )
    } finally {
      setIsRunning(false)
    }
  }, [busy, code, customCases, programCases, language, preview, prepareJavaScript, ready, runner, task])

  const handleSubmit = useCallback(async () => {
    if (!ready || busy || code.trim().length === 0) return

    setIsSubmitting(true)
    setResult(null)
    setOrigin('server')
    setFocusLine(undefined)

    try {
      if (preview?.leaseToken) {
        const released = await fetch(`/api/trainer/preview-release/${encodeURIComponent(preview.leaseToken)}`, { method: 'POST', credentials: 'omit' })
        if (!released.ok) throw new Error('Не удалось закрыть предыдущий предпросмотр. Повторите отправку.')
        setPreview(null)
      }
      const response = await fetch('/api/trainer/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ taskId: task.id, language, code }),
      })

      if (!response.ok) {
        const message = await response
          .json()
          .then((data: { error?: string }) => data.error)
          .catch(() => undefined)
        showToast(message ?? 'Не удалось отправить решение', 'error')
        setResult(failureResult('error', message ?? 'Не удалось отправить решение'))
        return
      }

      const data = (await response.json()) as SubmitResponse
      setResult(data.result)
      setDiagnostics(data.result.diagnostics ?? [])
      setAttempts(data.attempts)
      if (data.result.errorLine) setFocusLine(data.result.errorLine)

      if (data.result.status === 'passed') {
        const wasCompleted = completed
        setCompleted(true)
        showToast(
          data.awardedPoints
            ? `Задача решена! +${data.awardedPoints} XP`
            : wasCompleted
              ? 'Задача решена — баллы уже начислены ранее'
              : 'Задача решена!',
          'success',
        )
        // Перерисовываем серверные части страницы: счётчики прогресса и
        // доступность разбора считаются на сервере.
        router.refresh()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Сеть недоступна'
      showToast(message, 'error')
      setResult(failureResult('error', message))
    } finally {
      setIsSubmitting(false)
    }
  }, [busy, code, completed, language, preview, ready, router, showToast, task.id])

  const handleReset = useCallback(() => {
    setCode(task.starters[language] ?? '')
    setPreview(null)
    setResult(null)
    setDiagnostics([])
    setFocusLine(undefined)
  }, [language, task.starters])

  const hiddenNote = useMemo(() => {
    if (task.hiddenCaseCount === 0) return null
    return `Ещё ${task.hiddenCaseCount} скрыт${task.hiddenCaseCount === 1 ? 'ый тест' : 'ых теста'} прогонится при отправке`
  }, [task.hiddenCaseCount])

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {task.languages.length > 1 && (
          <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Язык решения">
            {task.languages.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleLanguageChange(item)}
                disabled={busy || !ready}
                aria-pressed={language === item}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                  language === item
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {LANGUAGE_LABELS[item]}
              </button>
            ))}
          </div>
        )}

        <ShareButton title={task.title} getHref={() => queryHref(pathname, search.toString(), { lang: language })} />

        <button
          type="button"
          onClick={handleRun}
          disabled={busy || !ready || code.trim().length === 0}
          title="Ctrl+Enter (⌘+Enter на Mac)"
          className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          {isRunning ? 'Выполняется…' : 'Запустить'}
        </button>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy || !ready || code.trim().length === 0}
          title="Ctrl+Shift+Enter (⌘+Shift+Enter на Mac)"
          className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {isSubmitting ? 'Проверяем…' : 'Отправить'}
        </button>

        <button
          type="button"
          onClick={handleReset}
          disabled={busy || !ready}
          className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
          Сбросить
        </button>

        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {attempts > 0 && <span>Попыток: {attempts}</span>}
          {completed && (
            <span className="inline-flex items-center gap-1 font-medium text-success">
              <Trophy className="h-3.5 w-3.5" />
              Решено
            </span>
          )}
        </div>
      </div>

      <div className="min-h-[320px] flex-1 overflow-auto rounded-xl border border-border">
        {isFrontendLanguage(language) ? (
          <FrontendEditor key={draftSlot} value={code} onChange={setCode} language={language}
            readOnly={busy || !ready} previewHtml={preview?.html} previewUrl={preview?.previewPath}
            onRun={handleRun} onSubmit={handleSubmit} />
        ) : <CodeEditor
          value={code}
          onChange={setCode}
          language={language}
          readOnly={busy || !ready}
          diagnostics={diagnostics}
          errorLine={focusLine}
          height="100%"
          onRun={handleRun}
          onSubmit={handleSubmit}
        />}
      </div>

      {isFrontendLanguage(language) && preview && previewSource !== code && <p className="text-xs text-muted-foreground">Код изменён. Нажмите «Запустить», чтобы обновить предпросмотр.</p>}
      {language === 'next' && preview?.previewPath && <p className="text-xs text-muted-foreground">Предпросмотр действует недолго. Если он перестал отвечать, нажмите «Запустить» снова.</p>}
      {isRuntimeLanguage(language) && <p className="text-xs text-muted-foreground">Первый запуск компилирует проект и может занять больше времени. «Запустить» не сохраняет прогресс; «Отправить» проверяет все тесты и засчитывает решение.</p>}

      {code.length > TRAINER_LIMITS.maxCodeLength * 0.9 && (
        <p className="text-xs text-warning">
          Решение приближается к лимиту в {TRAINER_LIMITS.maxCodeLength} символов
        </p>
      )}

      <TestResultsPanel
        result={result}
        isRunning={busy}
        origin={origin}
        onSelectLine={setFocusLine}
      />

      {hiddenNote && <p className="text-xs text-muted-foreground">{hiddenNote}</p>}

      {task.checkMode === 'unit' && task.entryName && (
        <CustomTestCases exampleCase={task.publicCases.find((item) => !item.hidden)} cases={customCases} disabled={busy} entryName={task.entryName}
          onChange={(cases) => setCustomTests({ taskId: task.id, cases })} />
      )}

      {(language === 'go' || language === 'python') && <CustomProgramCases language={language} exampleCase={task.runtimeCases?.find((item) => !item.hidden)} cases={programCases} disabled={busy} onChange={(cases) => setProgramTests({ taskId: task.id, cases })} />}

      {/* Решено — следующий шаг сразу под результатом, а не кнопкой «Далее» в шапке. */}
      {completed && !busy && (nextTask || topicHref) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/40 bg-success/10 p-3">
          <p className="flex-1 text-sm text-foreground">
            {nextTask ? 'Задача решена. Следующая нерешённая в теме:' : 'Все задачи темы решены.'}
          </p>
          {nextTask ? (
            <Link
              href={nextTask.href}
              className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <span className="truncate">{nextTask.title}</span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          ) : topicHref ? (
            <Link href={topicHref} className="text-sm font-medium text-primary underline-offset-2 hover:underline">
              К темам тренажёра
            </Link>
          ) : null}
        </div>
      )}

      <p className="hidden text-xs text-muted-foreground lg:block">
        Ctrl+Enter — запустить, Ctrl+Shift+Enter — отправить (на Mac — ⌘)
      </p>
    </div>
  )
}
