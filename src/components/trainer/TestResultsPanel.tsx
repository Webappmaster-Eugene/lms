'use client'

import { AlertTriangle, CheckCircle2, ChevronRight, Clock, Terminal, XCircle } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'
import type { TrainerRunResult, TrainerTestOutcome } from '@/lib/trainer/types'

/**
 * Отчёт о прогоне: какие тесты прошли, какие нет и — главное — почему.
 *
 * Для упавшего теста показываются входные данные, ожидаемое и фактическое
 * значение и номер строки. Ровно этого не хватало старому тренажёру: он умел
 * сказать только «вывод не совпадает».
 */

type TestResultsPanelProps = {
  result: TrainerRunResult | null
  isRunning: boolean
  /** Подпись источника: браузер или сервер. */
  origin: 'client' | 'server' | null
  onSelectLine?: (line: number) => void
}

const STATUS_TEXT: Record<TrainerRunResult['status'], string> = {
  passed: 'Все тесты пройдены',
  failed: 'Часть тестов не пройдена',
  compile_error: 'Код не компилируется',
  error: 'Ошибка выполнения',
  timeout: 'Превышен лимит времени',
}

function TestRow({
  outcome,
  index,
  onSelectLine,
}: {
  outcome: TrainerTestOutcome
  index: number
  onSelectLine?: (line: number) => void
}) {
  const [open, setOpen] = useState(!outcome.passed)
  const hasDetails =
    !outcome.passed &&
    Boolean(outcome.message || outcome.expected || outcome.actual || outcome.input)

  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => hasDetails && setOpen((value) => !value)}
        disabled={!hasDetails}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
          hasDetails ? 'cursor-pointer hover:bg-accent/50' : 'cursor-default',
        )}
      >
        {outcome.passed ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-destructive" />
        )}
        <span className="min-w-0 flex-1 truncate text-foreground">
          {index + 1}. {outcome.name}
        </span>
        {outcome.hidden && (
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            скрытый
          </span>
        )}
        {hasDetails && (
          <ChevronRight
            className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
          />
        )}
      </button>

      {open && hasDetails && (
        <div className="space-y-2 bg-muted/30 px-3 pb-3 pt-1 text-sm">
          {outcome.message && (
            <p className="text-destructive">
              {outcome.errorName ? `${outcome.errorName}: ` : ''}
              {outcome.message}
            </p>
          )}

          {outcome.input && (
            <Field label="Вызов" value={outcome.input} />
          )}
          {outcome.expected !== undefined && (
            <Field label="Ожидалось" value={outcome.expected} tone="success" />
          )}
          {outcome.actual !== undefined && (
            <Field label="Получено" value={outcome.actual} tone="destructive" />
          )}

          {outcome.line !== undefined && (
            <button
              type="button"
              onClick={() => onSelectLine?.(outcome.line ?? 1)}
              className="text-xs text-primary underline-offset-2 hover:underline"
            >
              Строка {outcome.line} в решении
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function Field({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'success' | 'destructive'
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <pre
        className={cn(
          'mt-0.5 overflow-x-auto rounded border border-border bg-card px-2 py-1 font-mono text-xs',
          tone === 'success' && 'text-success',
          tone === 'destructive' && 'text-destructive',
          !tone && 'text-foreground',
        )}
      >
        {value}
      </pre>
    </div>
  )
}

export function TestResultsPanel({
  result,
  isRunning,
  origin,
  onSelectLine,
}: TestResultsPanelProps) {
  const [tab, setTab] = useState<'tests' | 'console'>('tests')

  if (isRunning) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        Выполняется…
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <Terminal className="h-4 w-4" />
        Нажмите «Запустить», чтобы прогнать тесты
      </div>
    )
  }

  const passed = result.status === 'passed'
  const hasConsole = result.consoleOutput.length > 0

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 px-3 py-2 text-sm font-medium',
          passed ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
        )}
      >
        {passed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        <span>{STATUS_TEXT[result.status]}</span>

        {result.totalCount > 0 && (
          <span className="opacity-80">
            {result.passedCount} из {result.totalCount}
          </span>
        )}

        <span className="ml-auto flex items-center gap-1 text-xs font-normal opacity-70">
          <Clock className="h-3 w-3" />
          {result.totalMs} мс
          {origin && <span>· {origin === 'server' ? 'проверено сервером' : 'локальный прогон'}</span>}
        </span>
      </div>

      {result.error && (
        <div className="flex gap-2 border-b border-border bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs">{result.error}</pre>
            {result.errorLine !== undefined && (
              <button
                type="button"
                onClick={() => onSelectLine?.(result.errorLine ?? 1)}
                className="mt-1 text-xs underline-offset-2 hover:underline"
              >
                Строка {result.errorLine} в решении
              </button>
            )}
          </div>
        </div>
      )}

      {result.diagnostics && result.diagnostics.length > 0 && (
        <ul className="border-b border-border">
          {result.diagnostics.slice(0, 10).map((diagnostic, index) => (
            <li key={index} className="flex gap-2 px-3 py-1.5 text-xs">
              <span className="shrink-0 text-muted-foreground">
                {diagnostic.inHarness ? 'проверка типов' : `${diagnostic.line}:${diagnostic.column}`}
              </span>
              <span className="text-destructive">
                TS{diagnostic.code}: {diagnostic.message}
              </span>
            </li>
          ))}
        </ul>
      )}

      {(result.tests.length > 0 || hasConsole) && (
        <>
          <div className="flex gap-1 border-b border-border px-2 pt-2">
            <TabButton active={tab === 'tests'} onClick={() => setTab('tests')}>
              Тесты{result.tests.length > 0 ? ` (${result.tests.length})` : ''}
            </TabButton>
            <TabButton active={tab === 'console'} onClick={() => setTab('console')}>
              Консоль{hasConsole ? ` (${result.consoleOutput.length})` : ''}
            </TabButton>
          </div>

          {tab === 'tests' ? (
            <ul className="max-h-80 overflow-y-auto">
              {result.tests.map((outcome, index) => (
                <TestRow
                  key={`${outcome.name}-${index}`}
                  outcome={outcome}
                  index={index}
                  onSelectLine={onSelectLine}
                />
              ))}
            </ul>
          ) : (
            <pre className="max-h-80 overflow-auto px-3 py-2 font-mono text-xs text-foreground">
              {hasConsole ? result.consoleOutput.join('\n') : 'Вывода не было'}
            </pre>
          )}
        </>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-card text-foreground shadow-[inset_0_-2px_0_0_hsl(var(--primary))]'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
