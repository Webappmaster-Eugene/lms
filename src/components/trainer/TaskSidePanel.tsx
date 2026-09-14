'use client'

import { useCallback, useState } from 'react'
import { BookOpen, FlaskConical, Lightbulb, Lock, Unlock } from 'lucide-react'

import { HintsAccordion } from './HintsAccordion'
import { MarkdownRenderer } from '@/components/lesson/MarkdownRenderer'
import { LANGUAGE_LABELS } from '@/lib/trainer/constants'
import { cn } from '@/lib/utils'
import type { SolutionResponse } from '@/lib/trainer/api'
import type { TrainerCaseSpec, TrainerLanguage } from '@/lib/trainer/types'

/**
 * Левая колонка страницы задачи: условие, тесты, подсказки и разбор.
 *
 * Разбор подтягивается отдельным запросом, а не приезжает вместе со страницей:
 * пока задача не решена, эталонного решения на клиенте быть не должно вообще —
 * иначе его достанут из исходного HTML.
 */

type TaskSidePanelProps = {
  taskId: string
  descriptionMd: string
  hints: Array<{ hint: string; id?: string }>
  publicCases: TrainerCaseSpec[]
  hiddenCaseCount: number
  testCode: string
  entryName: string
  languages: TrainerLanguage[]
  checkMode: string
}

type Tab = 'description' | 'tests' | 'hints' | 'solution'

export function TaskSidePanel({
  taskId,
  descriptionMd,
  hints,
  publicCases,
  hiddenCaseCount,
  testCode,
  entryName,
  languages,
  checkMode,
}: TaskSidePanelProps) {
  const [tab, setTab] = useState<Tab>('description')
  const [solution, setSolution] = useState<SolutionResponse | null>(null)
  const [solutionError, setSolutionError] = useState<string | null>(null)
  const [loadingSolution, setLoadingSolution] = useState(false)

  const loadSolution = useCallback(async () => {
    setLoadingSolution(true)
    setSolutionError(null)
    try {
      const response = await fetch(`/api/trainer/solution?taskId=${encodeURIComponent(taskId)}`, {
        credentials: 'include',
      })
      const data = (await response.json()) as SolutionResponse & { error?: string }
      if (!response.ok) {
        setSolutionError(data.error ?? 'Разбор пока недоступен')
        return
      }
      setSolution(data)
    } catch {
      setSolutionError('Не удалось загрузить разбор')
    } finally {
      setLoadingSolution(false)
    }
  }, [taskId])

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2 pt-2">
        <TabButton active={tab === 'description'} onClick={() => setTab('description')} icon={BookOpen}>
          Условие
        </TabButton>
        <TabButton active={tab === 'tests'} onClick={() => setTab('tests')} icon={FlaskConical}>
          Тесты
        </TabButton>
        {hints.length > 0 && (
          <TabButton active={tab === 'hints'} onClick={() => setTab('hints')} icon={Lightbulb}>
            Подсказки
          </TabButton>
        )}
        <TabButton
          active={tab === 'solution'}
          onClick={() => {
            setTab('solution')
            if (!solution && !loadingSolution) void loadSolution()
          }}
          icon={solution ? Unlock : Lock}
        >
          Разбор
        </TabButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'description' && (
          <div className="prose prose-sm dark:prose-invert min-w-0 max-w-none">
            {descriptionMd.trim().length > 0 ? (
              <MarkdownRenderer content={descriptionMd} />
            ) : (
              <p className="text-muted-foreground">Условие задачи пока не заполнено.</p>
            )}
          </div>
        )}

        {tab === 'tests' && (
          <TestsTab
            publicCases={publicCases}
            hiddenCaseCount={hiddenCaseCount}
            testCode={testCode}
            entryName={entryName}
            checkMode={checkMode}
          />
        )}

        {tab === 'hints' && <HintsAccordion hints={hints} />}

        {tab === 'solution' && (
          <SolutionTab
            solution={solution}
            error={solutionError}
            loading={loadingSolution}
            languages={languages}
            onRetry={loadSolution}
          />
        )}
      </div>
    </div>
  )
}

function TestsTab({
  publicCases,
  hiddenCaseCount,
  testCode,
  entryName,
  checkMode,
}: {
  publicCases: TrainerCaseSpec[]
  hiddenCaseCount: number
  testCode: string
  entryName: string
  checkMode: string
}) {
  if (checkMode === 'types') {
    return (
      <p className="text-sm text-muted-foreground">
        Задача проверяется компилятором TypeScript: решение верно, когда tsc не выдал ни одной
        ошибки на проверочных утверждениях.
      </p>
    )
  }

  if (checkMode === 'stdout') {
    return (
      <p className="text-sm text-muted-foreground">
        Решение сверяется с эталонным выводом в консоль. Нажмите «Запустить», чтобы увидеть свой
        вывод, и «Отправить» — чтобы получить вердикт.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {entryName && (
        <p className="text-sm text-muted-foreground">
          Решение должно объявить{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">{entryName}</code>
        </p>
      )}

      {publicCases.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">Примеры</h3>
          <ul className="space-y-2">
            {publicCases.map((testCase, index) => (
              <li key={index} className="rounded-lg border border-border bg-background p-3">
                <p className="mb-1 text-xs text-muted-foreground">{testCase.name}</p>
                <pre className="overflow-x-auto font-mono text-xs text-foreground">
                  {entryName}({testCase.argsCode}) → {testCase.expectedCode}
                </pre>
              </li>
            ))}
          </ul>
        </div>
      )}

      {testCode.trim().length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">Что проверяется</h3>
          <pre className="overflow-x-auto rounded-lg border border-border bg-background p-3 font-mono text-xs text-foreground">
            {testCode}
          </pre>
        </div>
      )}

      {hiddenCaseCount > 0 && (
        <p className="text-xs text-muted-foreground">
          Плюс {hiddenCaseCount} скрытых тестов — они прогоняются на сервере при отправке.
        </p>
      )}
    </div>
  )
}

function SolutionTab({
  solution,
  error,
  loading,
  languages,
  onRetry,
}: {
  solution: SolutionResponse | null
  error: string | null
  loading: boolean
  languages: TrainerLanguage[]
  onRetry: () => void
}) {
  const [language, setLanguage] = useState<TrainerLanguage>(languages[0] ?? 'js')

  if (loading) return <p className="text-sm text-muted-foreground">Загружаем разбор…</p>

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="text-sm text-primary underline-offset-2 hover:underline"
        >
          Проверить ещё раз
        </button>
      </div>
    )
  }

  if (!solution) return null

  const code = language === 'ts' ? (solution.solutionCodeTs ?? solution.solutionCode) : solution.solutionCode

  return (
    <div className="space-y-4">
      {languages.length > 1 && (
        <div className="flex rounded-lg border border-border p-0.5">
          {languages.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setLanguage(item)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
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

      {code ? (
        <div className="prose prose-sm dark:prose-invert min-w-0 max-w-none">
          <MarkdownRenderer content={`\`\`\`${language === 'ts' ? 'typescript' : 'javascript'}\n${code}\n\`\`\``} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Эталонное решение для этого языка не задано.</p>
      )}

      {solution.solutionNotes && (
        <div className="prose prose-sm dark:prose-invert min-w-0 max-w-none">
          <MarkdownRenderer content={solution.solutionNotes} />
        </div>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: typeof BookOpen
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-t-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-card text-foreground shadow-[inset_0_-2px_0_0_hsl(var(--primary))]'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  )
}
