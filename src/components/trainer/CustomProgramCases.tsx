'use client'

import { LANGUAGE_LABELS } from '@/lib/trainer/constants'
import type { RuntimeCase } from '@/lib/trainer/runtime-spec'

export function CustomProgramCases({ cases, onChange, disabled, exampleCase, language = 'go' }: {
  language?: 'go' | 'python'
  cases: RuntimeCase[]
  onChange: (cases: RuntimeCase[]) => void
  disabled: boolean
  exampleCase?: RuntimeCase
}) {
  return (
    <details className="rounded-lg border border-border p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        <span>Свои проверки {LANGUAGE_LABELS[language]} ({cases.length})</span>
        <span className="mt-1 block text-xs font-normal text-muted-foreground">
          Проверьте программу на своих данных: укажите текст ввода и ожидаемый вывод.
          Нажмите здесь, чтобы открыть пример.
        </span>
      </summary>
      <p className="my-3 text-muted-foreground">В «Ввод» напишите текст, который программа прочитает из stdin. В «Ожидаемый вывод» — то, что она должна напечатать в stdout. Формат берите из условия: JSON-массив вводится целиком, например [2,3]. Нажмите «Запустить»: эти проверки дополнят публичные тесты и не повлияют на баллы.</p>
      {exampleCase && !exampleCase.hidden && <div className="mb-3 space-y-1 text-xs">
        <p className="font-medium">Пример текущей задачи</p>
        <p>Ввод:</p><pre className="overflow-auto rounded bg-muted p-2">{exampleCase.input ?? '(пусто)'}</pre>
        <p>Ожидаемый вывод:</p><pre className="overflow-auto rounded bg-muted p-2">{exampleCase.expected ?? '(пусто)'}</pre>
      </div>}
      <div className="space-y-3">
        {cases.map((item, index) => (
          <fieldset key={index} disabled={disabled} className="space-y-2 rounded border border-border p-2">
            <legend>Своя проверка {index + 1}</legend>
            <label className="block">Ввод (stdin)<textarea aria-label={`Ввод ${LANGUAGE_LABELS[language]} ${index + 1}`} maxLength={1000} value={item.input ?? ''}
              onChange={(event) => onChange(cases.map((row, i) => i === index ? { ...row, input: event.target.value } : row))}
              className="mt-1 block w-full rounded border border-border bg-background p-2 font-mono text-xs" /></label>
            <label className="block">Ожидаемый вывод (stdout)<textarea aria-label={`Ожидаемый вывод ${LANGUAGE_LABELS[language]} ${index + 1}`} maxLength={1000} value={item.expected ?? ''}
              onChange={(event) => onChange(cases.map((row, i) => i === index ? { ...row, expected: event.target.value } : row))}
              className="mt-1 block w-full rounded border border-border bg-background p-2 font-mono text-xs" /></label>
            <button type="button" onClick={() => onChange(cases.filter((_, i) => i !== index))} className="text-destructive underline">Удалить проверку {index + 1}</button>
          </fieldset>
        ))}
      </div>
      <button type="button" disabled={disabled || cases.length >= 10} onClick={() => onChange([...cases, { name: `Своя проверка ${cases.length + 1}`, hidden: false, input: '', expected: '' }])}
        className="mt-3 rounded border border-border px-3 py-2 disabled:opacity-50">Добавить проверку {LANGUAGE_LABELS[language]}</button>
    </details>
  )
}
