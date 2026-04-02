'use client'

import { useRef, useEffect, useCallback } from 'react'

type CodeEditorProps = {
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
}

/**
 * Простой код-редактор на textarea с номерами строк.
 * Использует моноширинный шрифт и базовую подсветку.
 *
 * Примечание: При необходимости можно заменить на CodeMirror 6 для
 * полноценной подсветки синтаксиса. Текущая реализация не требует
 * дополнительных npm-зависимостей.
 */
export function CodeEditor({ value, onChange, readOnly = false }: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)

  const lines = value.split('\n')
  const lineCount = lines.length

  const syncScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }, [])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.addEventListener('scroll', syncScroll)
    return () => textarea.removeEventListener('scroll', syncScroll)
  }, [syncScroll])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab для отступа
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = e.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newValue = value.substring(0, start) + '  ' + value.substring(end)
      onChange(newValue)
      // Восстанавливаем позицию курсора
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2
      })
    }
  }

  return (
    <div className="flex overflow-hidden rounded-lg border border-border bg-[hsl(var(--code-bg,var(--card)))]">
      {/* Номера строк */}
      <div
        ref={lineNumbersRef}
        className="flex-shrink-0 overflow-hidden border-r border-border bg-muted/30 px-3 py-3 text-right font-mono text-xs leading-6 text-muted-foreground select-none"
        aria-hidden="true"
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i + 1}>{i + 1}</div>
        ))}
      </div>

      {/* Редактор */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        readOnly={readOnly}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="flex-1 resize-none bg-transparent px-4 py-3 font-mono text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground min-h-[240px]"
        placeholder="// Ваш код здесь..."
      />
    </div>
  )
}
