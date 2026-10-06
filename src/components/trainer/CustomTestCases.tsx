'use client'

import { Plus, Trash2 } from 'lucide-react'
import type { TrainerCaseSpec } from '@/lib/trainer/types'

export function CustomTestCases({ cases, onChange, disabled, entryName }: {
  cases: TrainerCaseSpec[]
  onChange: (cases: TrainerCaseSpec[]) => void
  disabled: boolean
  entryName: string
}) {
  const update = (index: number, patch: Partial<TrainerCaseSpec>) => {
    onChange(cases.map((item, position) => position === index ? { ...item, ...patch } : item))
  }

  return (
    <details className="shrink-0 rounded-lg border border-border bg-card">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        Свои тесты{cases.length > 0 ? ` (${cases.length})` : ''}
      </summary>
      <div className="max-h-64 space-y-3 overflow-y-auto px-3 pb-3">
        <p className="text-xs text-muted-foreground">
          Проверяйте дополнительные вызовы {entryName}. Аргументы и ожидаемый результат —
          выражения JavaScript: например, [1, 2], 3 и 6. Эти тесты выполняются по кнопке
          «Запустить»; зачёт даёт полный набор проверок платформы при отправке.
        </p>
        {cases.map((item, index) => (
          <fieldset key={index} disabled={disabled} className="space-y-2 rounded-lg border border-border p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">Свой тест {index + 1}</span>
              <button type="button" aria-label={`Удалить свой тест ${index + 1}`}
                onClick={() => onChange(cases.filter((_, position) => position !== index))}
                className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-50">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <label className="block text-xs">
              Аргументы теста {index + 1}
              <textarea value={item.argsCode} maxLength={5000} rows={2}
                aria-label={`Аргументы теста ${index + 1}`}
                onChange={(event) => update(index, { argsCode: event.target.value })}
                className="mt-1 block w-full rounded border border-input bg-background p-2 font-mono text-xs" />
            </label>
            <label className="block text-xs">
              Ожидаемый результат теста {index + 1}
              <textarea value={item.expectedCode} maxLength={5000} rows={2}
                aria-label={`Ожидаемый результат теста ${index + 1}`}
                onChange={(event) => update(index, { expectedCode: event.target.value })}
                className="mt-1 block w-full rounded border border-input bg-background p-2 font-mono text-xs" />
            </label>
          </fieldset>
        ))}
        <button type="button" disabled={disabled || cases.length >= 20}
          onClick={() => onChange([...cases, {
            name: `Свой тест ${cases.length + 1}`, argsCode: '', expectedCode: 'undefined',
            compare: 'deep', hidden: false,
          }])}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs hover:bg-accent disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" /> Добавить свой тест
        </button>
      </div>
    </details>
  )
}
