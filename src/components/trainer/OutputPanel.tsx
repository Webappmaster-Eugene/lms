'use client'

import { CheckCircle2, XCircle, AlertTriangle, Terminal } from 'lucide-react'

type OutputPanelProps = {
  output: string
  error: string | null
  timedOut: boolean
  passed: boolean | null
  isRunning: boolean
}

export function OutputPanel({ output, error, timedOut, passed, isRunning }: OutputPanelProps) {
  if (isRunning) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <span className="text-sm">Выполняется...</span>
        </div>
      </div>
    )
  }

  if (passed === null && !output && !error) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Terminal className="h-4 w-4" />
          <span className="text-sm">Нажмите &quot;Запустить&quot; для выполнения кода</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Статус */}
      {passed !== null && (
        <div
          className={`flex items-center gap-2 rounded-lg p-3 text-sm font-medium ${
            passed
              ? 'bg-success/10 text-success'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {passed ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Задача решена верно!
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4" />
              Вывод не совпадает с ожидаемым
            </>
          )}
        </div>
      )}

      {/* Ошибка таймаута */}
      {timedOut && (
        <div className="flex items-center gap-2 rounded-lg bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="h-4 w-4" />
          Превышено время выполнения
        </div>
      )}

      {/* Runtime error */}
      {error && !timedOut && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs font-medium text-destructive mb-1">Ошибка:</p>
          <pre className="text-sm text-destructive whitespace-pre-wrap font-mono">{error}</pre>
        </div>
      )}

      {/* Output */}
      {output && (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">Вывод:</p>
          <pre className="text-sm text-foreground whitespace-pre-wrap font-mono">{output}</pre>
        </div>
      )}
    </div>
  )
}
