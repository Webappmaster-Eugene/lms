'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Play, RotateCcw, Send, Trophy } from 'lucide-react'

import { CodeEditor } from './CodeEditor'
import { TestResultsPanel } from './TestResultsPanel'
import { useCodeRunner } from './useCodeRunner'
import { LANGUAGE_LABELS, TRAINER_LIMITS } from '@/lib/trainer/constants'
import { failureResult } from '@/lib/trainer/result'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { useHydrated } from '@/hooks/use-hydrated'
import type { ClientProgress, ClientTaskSpec, SubmitResponse } from '@/lib/trainer/api'
import type { TrainerDiagnostic, TrainerLanguage, TrainerRunResult } from '@/lib/trainer/types'

/**
 * Рабочая область решения задачи.
 *
 * Две кнопки с разной природой:
 *   «Запустить» — прогон в браузерной песочнице по публичным тестам. Быстро,
 *                 бесплатно, ничего не сохраняет.
 *   «Отправить» — сервер пересобирает скрипт из своей копии задачи, гоняет
 *                 полный набор тестов (включая скрытые) в V8-изоляте и только
 *                 по своему вердикту пишет прогресс и начисляет баллы.
 */

type TrainerWorkspaceProps = {
  task: ClientTaskSpec
  progress: ClientProgress
}

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

export function TrainerWorkspace({ task, progress }: TrainerWorkspaceProps) {
  const router = useRouter()
  const { toast: showToast } = useToast()
  const runner = useCodeRunner()

  const initialLanguage: TrainerLanguage =
    progress.savedLanguage && task.languages.includes(progress.savedLanguage)
      ? progress.savedLanguage
      : (task.languages[0] ?? 'js')

  const [language, setLanguage] = useState<TrainerLanguage>(initialLanguage)
  const [code, setCode] = useState<string>(
    () => progress.savedCode ?? task.starters[initialLanguage] ?? '',
  )
  const [result, setResult] = useState<TrainerRunResult | null>(null)
  const [origin, setOrigin] = useState<'client' | 'server' | null>(null)
  const [diagnostics, setDiagnostics] = useState<TrainerDiagnostic[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [completed, setCompleted] = useState(progress.isCompleted)
  const [attempts, setAttempts] = useState(progress.attempts)

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
    const restored = draft ?? (loadedSlot === null ? progress.savedCode : null)
    setCode(restored ?? task.starters[language] ?? '')
    setResult(null)
    setOrigin(null)
    setDiagnostics([])
    setFocusLine(undefined)
  }

  useEffect(() => {
    if (code.length === 0) return
    const timer = setTimeout(() => {
      writeDraft(task.id, language, code)
      try {
        window.localStorage.setItem(languageKey(task.id), language)
      } catch {
        // приватный режим — не критично
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [code, language, task.id])

  const busy = isRunning || isSubmitting

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
    if (busy || code.trim().length === 0) return

    setIsRunning(true)
    setResult(null)
    setOrigin('client')
    setFocusLine(undefined)

    try {
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
        cases: task.checkMode === 'unit' ? task.publicCases : [],
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
  }, [busy, code, language, prepareJavaScript, runner, task])

  const handleSubmit = useCallback(async () => {
    if (busy || code.trim().length === 0) return

    setIsSubmitting(true)
    setResult(null)
    setOrigin('server')
    setFocusLine(undefined)

    try {
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
  }, [busy, code, completed, language, router, showToast, task.id])

  const handleReset = useCallback(() => {
    setCode(task.starters[language] ?? '')
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
                onClick={() => setLanguage(item)}
                disabled={busy}
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

        <button
          type="button"
          onClick={handleRun}
          disabled={busy || code.trim().length === 0}
          className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          {isRunning ? 'Выполняется…' : 'Запустить'}
        </button>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy || code.trim().length === 0}
          className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {isSubmitting ? 'Проверяем…' : 'Отправить'}
        </button>

        <button
          type="button"
          onClick={handleReset}
          disabled={busy}
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

      <div className="min-h-[320px] flex-1 overflow-hidden rounded-xl border border-border">
        <CodeEditor
          value={code}
          onChange={setCode}
          language={language}
          readOnly={busy}
          diagnostics={diagnostics}
          errorLine={focusLine}
          height="100%"
        />
      </div>

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
    </div>
  )
}
