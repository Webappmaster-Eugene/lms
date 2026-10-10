'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useId } from 'react'
import type { TrainerCaseSpec } from '@/lib/trainer/types'

export function CustomTestCases({ cases, onChange, disabled, entryName, exampleCase }: {
  cases: TrainerCaseSpec[]
  onChange: (cases: TrainerCaseSpec[]) => void
  disabled: boolean
  entryName: string
  exampleCase?: TrainerCaseSpec
}) {
  const helpId = useId()
  const visibleExample = exampleCase && !exampleCase.hidden ? exampleCase : undefined
  const update = (index: number, patch: Partial<TrainerCaseSpec>) => {
    onChange(cases.map((item, position) => position === index ? { ...item, ...patch } : item))
  }

  return (
    <details className="shrink-0 rounded-lg border border-border bg-card">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        Свои тесты{cases.length > 0 ? ` (${cases.length})` : ''}
      </summary>
      <div className="max-h-80 space-y-3 overflow-y-auto px-3 pb-3">
        <p className="text-xs text-muted-foreground">
          Свой тест — это дополнительный пример, на котором вы проверяете решение.
          Тренажёр вызовет вашу функцию <code className="font-mono text-foreground">{entryName}</code>
          {' '}и сравнит то, что она вернула, с указанным вами результатом.
        </p>
        <ol id={helpId} className="list-decimal space-y-2 pl-5 text-xs text-muted-foreground">
          <li>Нажмите «Добавить свой тест».</li>
          <li>
            В «Аргументы» введите значения как JavaScript-код, через запятую,
            не весь вызов функции. Например, <code className="font-mono text-foreground">2, 3</code>
            {' '}— два аргумента, <code className="font-mono text-foreground">[2, 3]</code> — один массив.
            Строки пишите в кавычках: <code className="font-mono text-foreground">{'"hello"'}</code>.
            Если аргументов нет, оставьте поле пустым.
          </li>
          <li>
            В «Ожидаемый результат» введите одно значение, которое функция должна вернуть
            через <code className="font-mono text-foreground">return</code>, например,
            {' '}<code className="font-mono text-foreground">5</code>,
            {' '}<code className="font-mono text-foreground">true</code> или
            {' '}<code className="font-mono text-foreground">[1, 2]</code>.
            Массивы и объекты сравниваются по содержимому.
          </li>
          <li>
            Нажмите «Запустить» над редактором. В результатах найдите «Свой тест»:
            при несовпадении будут показаны ожидаемое и фактическое значения.
            Исправьте решение или данные теста и запустите проверку снова.
          </li>
        </ol>
        <div className="space-y-1 rounded border border-border bg-background p-2 text-xs">
          <p className="font-medium">
            {visibleExample ? 'Пример из текущей задачи' : 'Учебный пример: функция sum складывает два числа'}
          </p>
          <p className="break-all text-muted-foreground">
            Вызов: <code className="font-mono text-foreground">
              {visibleExample ? `${entryName}(${visibleExample.argsCode})` : 'sum(2, 3)'}
            </code>
          </p>
          <p className="break-all text-muted-foreground">
            Аргументы: <code className="whitespace-pre-wrap font-mono text-foreground">
              {visibleExample ? visibleExample.argsCode || '(пустое поле)' : '2, 3'}
            </code>
          </p>
          <p className="break-all text-muted-foreground">
            Ожидаемый результат: <code className="whitespace-pre-wrap font-mono text-foreground">
              {visibleExample ? visibleExample.expectedCode : '5'}
            </code>
          </p>
          {!visibleExample && (
            <p className="text-muted-foreground">Для вашей задачи используйте аргументы и результат из её условия.</p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Попробуйте крайние случаи из условия: пустой массив, ноль, повторяющиеся значения.
          Свои тесты не дают баллы и не меняют прогресс. Для зачёта нажмите «Отправить»:
          сервер проверит решение тестами платформы, включая скрытые. Их входные данные
          и ожидаемые результаты не показываются; свои тесты их не заменяют.
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
                aria-describedby={helpId}
                placeholder={visibleExample?.argsCode || 'Значения через запятую, например: 2, 3'}
                onChange={(event) => update(index, { argsCode: event.target.value })}
                className="mt-1 block w-full rounded border border-input bg-background p-2 font-mono text-xs" />
            </label>
            <label className="block text-xs">
              Ожидаемый результат теста {index + 1}
              <textarea value={item.expectedCode} maxLength={5000} rows={2}
                aria-label={`Ожидаемый результат теста ${index + 1}`}
                aria-describedby={helpId}
                placeholder={visibleExample?.expectedCode || 'Одно значение, например: 5'}
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
