'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import Editor, { loader, type BeforeMount, type Monaco, type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'

import { MONACO_LANGUAGE } from '@/lib/trainer/constants'
import type { TrainerDiagnostic, TrainerLanguage } from '@/lib/trainer/types'

/**
 * Редактор кода на Monaco — том же движке, что в VS Code.
 *
 * Ассеты раздаются со своего домена (public/monaco/vs, кладёт
 * scripts/copy-monaco.mjs): CSP сайта разрешает только `connect-src 'self'`,
 * поэтому CDN по умолчанию у @monaco-editor/react не заработал бы.
 */

loader.config({ paths: { vs: '/monaco/vs' } })

const THEME_DARK = 'lms-trainer-dark'
const THEME_LIGHT = 'lms-trainer-light'

type CodeEditorProps = {
  value: string
  onChange: (value: string) => void
  language: TrainerLanguage
  readOnly?: boolean
  /** Диагностики компилятора: рисуются подчёркиванием прямо в коде. */
  diagnostics?: TrainerDiagnostic[]
  /** Строка, к которой относится ошибка прогона. */
  errorLine?: number
  height?: number | string
}

/**
 * Темы под токены дизайн-системы.
 *
 * Monaco принимает только hex, а палитра проекта живёт в HSL-переменных CSS,
 * поэтому значения заданы явно — читать computed style на старте редактора
 * дороже и ненадёжнее (переменные объявлены на :root, а не на элементе).
 */
function defineThemes(monaco: Monaco): void {
  monaco.editor.defineTheme(THEME_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0f1117',
      'editor.lineHighlightBackground': '#171a23',
      'editorLineNumber.foreground': '#4b5262',
      'editorLineNumber.activeForeground': '#9aa3b5',
      'editorGutter.background': '#0f1117',
      'editorIndentGuide.background1': '#232735',
    },
  })

  monaco.editor.defineTheme(THEME_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editor.lineHighlightBackground': '#f4f5f8',
      'editorLineNumber.foreground': '#9aa3b5',
      'editorLineNumber.activeForeground': '#4b5262',
      'editorIndentGuide.background1': '#e7e9ef',
    },
  })
}

/**
 * Настройка языкового сервиса TypeScript.
 *
 * Подсказки в редакторе — вспомогательные: вердикт всё равно даёт серверный
 * tsc, и настройки здесь подобраны так, чтобы расхождений было поменьше.
 */
function configureTypeScript(monaco: Monaco): void {
  const defaults = [monaco.languages.typescript.typescriptDefaults, monaco.languages.typescript.javascriptDefaults]

  for (const target of defaults) {
    target.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2022,
      lib: ['es2022', 'dom'],
      strict: true,
      noEmit: true,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    })
    target.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      // Решение — это фрагмент скрипта, а не модуль: жалобы на верхнеуровневый
      // return и на «файл без импортов» здесь только мешают.
      diagnosticCodesToIgnore: [1108, 2304, 2451, 7027],
    })
  }
}

export function CodeEditor({
  value,
  onChange,
  language,
  readOnly = false,
  diagnostics,
  errorLine,
  height = '100%',
}: CodeEditorProps) {
  const { resolvedTheme } = useTheme()
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)

  // Темы регистрируются ДО создания редактора: если сделать это в onMount,
  // первый кадр отрисуется дефолтной темой Monaco — в тёмном интерфейсе это
  // белый прямоугольник, который потом дёргается.
  const handleBeforeMount = useCallback<BeforeMount>((monaco) => {
    defineThemes(monaco)
    configureTypeScript(monaco)
  }, [])

  const handleMount = useCallback<OnMount>((instance, monaco) => {
    editorRef.current = instance
    monacoRef.current = monaco
    decorationsRef.current = instance.createDecorationsCollection([])
  }, [])

  // Маркеры диагностик из серверного компилятора: свои, отдельно от тех, что
  // ставит языковой сервис самого Monaco.
  useEffect(() => {
    const monaco = monacoRef.current
    const instance = editorRef.current
    if (!monaco || !instance) return

    const model = instance.getModel()
    if (!model) return

    const markers = (diagnostics ?? [])
      .filter((diagnostic) => !diagnostic.inHarness)
      .map((diagnostic) => ({
        severity:
          diagnostic.category === 'error'
            ? monaco.MarkerSeverity.Error
            : monaco.MarkerSeverity.Warning,
        message: diagnostic.message,
        startLineNumber: diagnostic.line,
        startColumn: diagnostic.column,
        endLineNumber: diagnostic.line,
        endColumn: model.getLineMaxColumn(Math.min(diagnostic.line, model.getLineCount())),
      }))

    monaco.editor.setModelMarkers(model, 'trainer-server', markers)
  }, [diagnostics])

  // Подсветка строки, на которой упал прогон.
  useEffect(() => {
    const collection = decorationsRef.current
    const instance = editorRef.current
    if (!collection || !instance) return

    const model = instance.getModel()
    if (!model || !errorLine || errorLine > model.getLineCount()) {
      collection.set([])
      return
    }

    collection.set([
      {
        range: { startLineNumber: errorLine, startColumn: 1, endLineNumber: errorLine, endColumn: 1 },
        options: {
          isWholeLine: true,
          className: 'trainer-error-line',
          glyphMarginClassName: 'trainer-error-glyph',
        },
      },
    ])
    instance.revealLineInCenterIfOutsideViewport(errorLine)
  }, [errorLine])

  return (
    <Editor
      height={height}
      language={MONACO_LANGUAGE[language]}
      theme={resolvedTheme === 'light' ? THEME_LIGHT : THEME_DARK}
      value={value}
      onChange={(next) => onChange(next ?? '')}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      loading={
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Загрузка редактора…
        </div>
      }
      options={{
        readOnly,
        fontSize: 14,
        lineHeight: 22,
        fontFamily:
          'var(--font-mono, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace)',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        insertSpaces: true,
        renderLineHighlight: 'line',
        glyphMargin: true,
        smoothScrolling: true,
        padding: { top: 12, bottom: 12 },
        bracketPairColorization: { enabled: true },
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
        // Подсказки помогают учиться, но не должны подставлять целое решение.
        quickSuggestions: { other: true, comments: false, strings: false },
        suggestOnTriggerCharacters: true,
        wordWrap: 'off',
      }}
    />
  )
}
