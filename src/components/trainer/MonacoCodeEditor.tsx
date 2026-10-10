'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import Editor, { loader, type BeforeMount, type Monaco, type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'

import { MONACO_LANGUAGE } from '@/lib/trainer/constants'
import type { CodeEditorProps } from './CodeEditor'

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
const configuredThemes = new WeakSet<Monaco>()
const configuredTypeScript = new WeakSet<Monaco>()
const reactDeclarations = new WeakMap<Monaco, Promise<void>>()

function loadReactDeclarations(monaco: Monaco): Promise<void> {
  const existing = reactDeclarations.get(monaco)
  if (existing) return existing
  const pending = (async () => {
    const response = await fetch('/monaco/react-types.json')
    if (!response.ok) throw new Error('Не удалось загрузить подсказки React')
    const declarations: unknown = await response.json()
    if (!declarations || typeof declarations !== 'object' || Array.isArray(declarations)) {
      throw new Error('Некорректный файл подсказок React')
    }
    const libraries = Object.entries(declarations)
    if (libraries.some(([, source]) => typeof source !== 'string')) {
      throw new Error('Некорректный файл подсказок React')
    }
    for (const defaults of [monaco.languages.typescript.typescriptDefaults, monaco.languages.typescript.javascriptDefaults]) {
      for (const [name, source] of libraries) {
        if (typeof source === 'string') defaults.addExtraLib(source, `inmemory://trainer/node_modules/@types/lms-react/${name}`)
      }
    }
  })().catch((error: unknown) => {
    reactDeclarations.delete(monaco)
    throw error
  })
  reactDeclarations.set(monaco, pending)
  return pending
}

/**
 * Темы под токены дизайн-системы.
 *
 * Monaco принимает только hex, а палитра проекта живёт в HSL-переменных CSS,
 * поэтому значения заданы явно — читать computed style на старте редактора
 * дороже и ненадёжнее (переменные объявлены на :root, а не на элементе).
 */
function defineThemes(monaco: Monaco): void {
  if (configuredThemes.has(monaco)) return
  configuredThemes.add(monaco)
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
  if (configuredTypeScript.has(monaco)) return
  configuredTypeScript.add(monaco)
  const defaults = [monaco.languages.typescript.typescriptDefaults, monaco.languages.typescript.javascriptDefaults]

  for (const target of defaults) {
    target.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2022,
      lib: ['es2022', 'dom'],
      strict: true,
      noEmit: true,
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
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

export function MonacoCodeEditor({
  value,
  onChange,
  language,
  editorLanguage,
  filePath,
  ariaLabel = 'Код решения',
  readOnly = false,
  diagnostics,
  errorLine,
  height = '100%',
  onRun,
  onSubmit,
  onReady,
}: CodeEditorProps & { onReady: (instance: editor.IStandaloneCodeEditor) => void }) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [reactTypesError, setReactTypesError] = useState<string | null>(null)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const editorId = useId()
  const modelPrefix = `inmemory://trainer/${encodeURIComponent(editorId)}/`
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)
  // Команды Monaco регистрируются один раз при монтировании, а обработчики
  // меняются на каждом рендере — поэтому вызываются через ref.
  const shortcutsRef = useRef({ onRun, onSubmit, readOnly })
  const onChangeRef = useRef(onChange)
  const resolvedLanguage = editorLanguage ?? MONACO_LANGUAGE[language]
  const isFileEditor = filePath !== undefined
  useEffect(() => () => {
    // При смене вкладки Monaco хранит модели для undo; освобождаем весь проект при уходе.
    for (const model of monacoRef.current?.editor.getModels() ?? []) {
      if (model.uri.toString().startsWith(modelPrefix)) model.dispose()
    }
  }, [modelPrefix])
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])
  useEffect(() => {
    shortcutsRef.current = { onRun, onSubmit, readOnly }
  }, [onRun, onSubmit, readOnly])

  // Темы регистрируются ДО создания редактора: если сделать это в onMount,
  // первый кадр отрисуется дефолтной темой Monaco — в тёмном интерфейсе это
  // белый прямоугольник, который потом дёргается.
  const handleBeforeMount = useCallback<BeforeMount>((monaco) => {
    defineThemes(monaco)
    if (resolvedLanguage === 'javascript' || resolvedLanguage === 'typescript') configureTypeScript(monaco)
  }, [resolvedLanguage])

  useEffect(() => {
    if (monacoRef.current && (resolvedLanguage === 'javascript' || resolvedLanguage === 'typescript')) {
      configureTypeScript(monacoRef.current)
    }
  }, [resolvedLanguage, mounted])

  useEffect(() => {
    const monaco = monacoRef.current
    if (!monaco || (language !== 'react' && language !== 'next')) return
    if (resolvedLanguage !== 'javascript' && resolvedLanguage !== 'typescript') return
    let active = true
    // Типы фреймворка нужны только frontend-проекту; их загрузка не блокирует ввод.
    void loadReactDeclarations(monaco).then(
      () => { if (active) setReactTypesError(null) },
      () => { if (active) setReactTypesError('Подсказки типов React недоступны. Код можно запускать.') },
    )
    return () => { active = false }
  }, [language, resolvedLanguage, mounted])

  const handleChange = useCallback((next: string | undefined) => onChangeRef.current(next ?? ''), [])
  // Без memo Monaco применяет настройки заново при каждом введённом символе.
  const options = useMemo<editor.IStandaloneEditorConstructionOptions>(() => ({
    readOnly,
    ariaLabel,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace)',
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
    quickSuggestions: { other: true, comments: false, strings: false },
    suggestOnTriggerCharacters: true,
    wordWrap: 'off',
    // Вхождения инициируют запросы к воркеру, отменяющиеся при смене файла.
    occurrencesHighlight: isFileEditor ? 'off' : 'singleFile',
  }), [readOnly, ariaLabel, isFileEditor])

  const handleMount = useCallback<OnMount>((instance, monaco) => {
    editorRef.current = instance
    monacoRef.current = monaco
    decorationsRef.current = instance.createDecorationsCollection([])
    setMounted(true)
    onReady(instance)
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      if (!shortcutsRef.current.readOnly) shortcutsRef.current.onRun?.()
    })
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
      if (!shortcutsRef.current.readOnly) shortcutsRef.current.onSubmit?.()
    })
  }, [onReady])

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
  }, [diagnostics, mounted])

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
  }, [errorLine, mounted])

  return (
    <>
      <Editor
        height={height}
        path={filePath ? `${modelPrefix}${filePath}` : undefined}
        language={resolvedLanguage}
        theme={resolvedTheme === 'light' ? THEME_LIGHT : THEME_DARK}
        value={value}
        onChange={handleChange}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        loading={
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Загрузка редактора…
          </div>
        }
        options={options}
      />
      {reactTypesError && <p role="status" className="absolute bottom-2 right-2 z-10 max-w-xs rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground">{reactTypesError}</p>}
    </>
  )
}
