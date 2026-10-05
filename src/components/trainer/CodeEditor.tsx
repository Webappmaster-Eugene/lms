'use client'

import { useCallback, useEffect, useRef, useState, type ComponentType, type KeyboardEvent } from 'react'
import type { editor } from 'monaco-editor'

import type { TrainerDiagnostic, TrainerLanguage } from '@/lib/trainer/types'

export type CodeEditorProps = {
  value: string
  onChange: (value: string) => void
  language: TrainerLanguage
  readOnly?: boolean
  /** Диагностики компилятора: рисуются подчёркиванием прямо в коде. */
  diagnostics?: TrainerDiagnostic[]
  /** Строка, к которой относится ошибка прогона. */
  errorLine?: number
  height?: number | string
  /** Ctrl/⌘+Enter — как «Запустить» в LeetCode и Codewars. */
  onRun?: () => void
  /** Ctrl/⌘+Shift+Enter — отправка на проверку. */
  onSubmit?: () => void
}

type FullEditorProps = CodeEditorProps & {
  onReady: (instance: editor.IStandaloneCodeEditor) => void
}

/** Текст доступен сразу: загрузка Monaco и его языкового сервиса не блокирует решение. */
export function CodeEditor(props: CodeEditorProps) {
  const { value, onChange, readOnly = false, height = '100%', onRun, onSubmit } = props
  const [FullEditor, setFullEditor] = useState<ComponentType<FullEditorProps> | null>(null)
  const [ready, setReady] = useState(false)
  const [loadingSlow, setLoadingSlow] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const focusFrameRef = useRef<number | null>(null)

  useEffect(() => {
    let active = true
    void import('./MonacoCodeEditor').then(
      (module) => {
        if (active) setFullEditor(() => module.MonacoCodeEditor)
      },
      () => {
        if (active) setLoadFailed(true)
      },
    )
    return () => {
      active = false
      if (focusFrameRef.current !== null) cancelAnimationFrame(focusFrameRef.current)
    }
  }, [])

  useEffect(() => {
    if (ready) return
    const timer = setTimeout(() => setLoadingSlow(true), 10_000)
    return () => clearTimeout(timer)
  }, [ready])

  const handleReady = useCallback((instance: editor.IStandaloneCodeEditor) => {
    const textarea = textareaRef.current
    const focused = textarea !== null && document.activeElement === textarea
    const model = instance.getModel()
    if (textarea && model) {
      // Последний ввод может опередить обновление controlled value в Monaco.
      if (model.getValue() !== textarea.value) model.setValue(textarea.value)
      const start = model.getPositionAt(textarea.selectionStart)
      const end = model.getPositionAt(textarea.selectionEnd)
      instance.setSelection({
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      })
    }
    setReady(true)
    if (focused) {
      focusFrameRef.current = requestAnimationFrame(() => {
        focusFrameRef.current = null
        // Кнопка, выбранная после onReady, сохраняет фокус.
        if (document.activeElement === document.body || document.activeElement === textarea) {
          instance.focus()
        }
      })
    }
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) return
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      if (event.shiftKey) onSubmit?.()
      else onRun?.()
      return
    }
    if (event.key !== 'Tab' || event.shiftKey) return
    event.preventDefault()
    const textarea = event.currentTarget
    const start = textarea.selectionStart
    onChange(`${value.slice(0, start)}  ${value.slice(textarea.selectionEnd)}`)
    requestAnimationFrame(() => textarea.setSelectionRange(start + 2, start + 2))
  }

  return (
    <div className="relative min-h-[320px] w-full" style={{ height }}>
      {!ready && (
        <div className="absolute inset-0 flex flex-col bg-background">
          <p className="shrink-0 px-3 py-1.5 text-xs text-muted-foreground" role="status">
            {loadFailed
              ? 'Расширенный редактор недоступен. Можно продолжить в обычном редакторе.'
              : loadingSlow
                ? 'Работает обычный редактор. Подсветка и подсказки пока недоступны.'
                : 'Можно писать и запускать код. Подсветка и подсказки загружаются…'}
          </p>
          <textarea
            ref={textareaRef}
            aria-label="Код решения"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            readOnly={readOnly}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="min-h-0 w-full flex-1 resize-none bg-transparent px-3 py-2 font-mono text-sm leading-[22px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          />
        </div>
      )}
      {FullEditor && (
        <div className="absolute inset-0" style={{ visibility: ready ? 'visible' : 'hidden' }} aria-hidden={!ready}>
          <FullEditor {...props} onReady={handleReady} />
        </div>
      )}
    </div>
  )
}
