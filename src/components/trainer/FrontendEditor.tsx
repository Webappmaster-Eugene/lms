'use client'

import { useId, useMemo, useState, type FormEvent } from 'react'
import { FilePlus2, Pencil, Trash2 } from 'lucide-react'

import { CodeEditor, type CodeEditorProps } from '@/components/trainer/CodeEditor'
import { parseFrontendFiles, validFrontendPath } from '@/lib/trainer/runtime-spec'

type FrontendEditorProps = {
  value: string
  onChange: (value: string) => void
  language: 'html' | 'react' | 'next'
  readOnly?: boolean
  onRun?: () => void
  onSubmit?: () => void
  previewHtml?: string | null
  previewUrl?: string | null
}

type FileAction = 'add' | 'rename' | 'delete' | null

const buttonClass = 'inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-xs hover:bg-accent disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function parseFiles(value: string): { files: Record<string, string>; error: string | null } {
  try {
    return { files: parseFrontendFiles(value), error: null }
  } catch (error) {
    return { files: {}, error: `${error instanceof Error ? error.message : 'Не удалось прочитать проект'}. Исправьте JSON ниже: {"имя файла": "код"}.` }
  }
}

function fileLanguage(name: string): CodeEditorProps['editorLanguage'] {
  if (name.endsWith('.html')) return 'html'
  if (name.endsWith('.css')) return 'css'
  if (name.endsWith('.json')) return 'json'
  if (/\.tsx?$/.test(name)) return 'typescript'
  return 'javascript'
}

export function FrontendEditor({
  value,
  onChange,
  language,
  readOnly = false,
  onRun,
  onSubmit,
  previewHtml = null,
  previewUrl = null,
}: FrontendEditorProps) {
  const { files, error } = useMemo(() => parseFiles(value), [value])
  const names = Object.keys(files)
  const [selectedFile, setSelectedFile] = useState('')
  const activeFile = Object.hasOwn(files, selectedFile) ? selectedFile : names[0] ?? ''
  const [action, setAction] = useState<FileAction>(null)
  const [fileName, setFileName] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const formId = useId()

  const openAction = (nextAction: FileAction) => {
    setAction(nextAction)
    setFileName(nextAction === 'rename' ? activeFile : '')
    setFileError(null)
  }

  const submitFile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (readOnly || (action !== 'add' && action !== 'rename')) return
    const nextName = fileName.trim()
    if (!validFrontendPath(nextName)) {
      setFileError('Используйте латиницу, цифры, дефис или подчёркивание. Пример: components/Button.tsx. Расширения: html, css, js, jsx, ts, tsx, json.')
      return
    }
    if (Object.hasOwn(files, nextName) && !(action === 'rename' && nextName === activeFile)) {
      setFileError('Файл с таким именем уже есть. Выберите другое имя.')
      return
    }
    if (action === 'add' && names.length >= 32) {
      setFileError('В проекте уже 32 файла. Удалите ненужный файл перед добавлением.')
      return
    }
    const nextFiles = action === 'rename'
      ? Object.fromEntries(Object.entries(files).map(([name, content]) => [name === activeFile ? nextName : name, content]))
      : { ...files, [nextName]: '' }
    onChange(JSON.stringify(nextFiles, null, 2))
    setSelectedFile(nextName)
    setAction(null)
  }

  const deleteFile = () => {
    if (readOnly || names.length <= 1) return
    onChange(JSON.stringify(Object.fromEntries(Object.entries(files).filter(([name]) => name !== activeFile)), null, 2))
    setSelectedFile(names.find((name) => name !== activeFile) ?? '')
    setAction(null)
  }

  return (
    <div className="flex min-h-0 flex-col">
      {error ? (
        <div>
          <p role="alert" className="border-b border-border bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          <CodeEditor value={value} onChange={onChange} language={language} editorLanguage="json" ariaLabel="JSON проекта" readOnly={readOnly} height={400} />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center border-b border-border bg-muted/30">
            <div className="flex min-w-0 flex-1 overflow-x-auto" role="group" aria-label="Файлы проекта">
              {names.map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={name === activeFile}
                  aria-controls={`${formId}-editor`}
                  onClick={() => { setSelectedFile(name); setAction(null) }}
                  className={`shrink-0 border-b-2 px-3 py-2.5 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${name === activeFile ? 'border-primary bg-background text-foreground' : 'border-transparent text-muted-foreground hover:bg-accent'}`}
                >{name}</button>
              ))}
            </div>
            <div className="flex shrink-0 gap-1 p-1">
              <button type="button" className={buttonClass} disabled={readOnly || names.length >= 32} onClick={() => openAction('add')}><FilePlus2 size={14} aria-hidden="true" />Файл</button>
              <button type="button" className={buttonClass} disabled={readOnly} aria-label={`Переименовать ${activeFile}`} onClick={() => openAction('rename')}><Pencil size={14} aria-hidden="true" /></button>
              <button type="button" className={buttonClass} disabled={readOnly || names.length <= 1} aria-label={`Удалить ${activeFile}`} onClick={() => openAction('delete')}><Trash2 size={14} aria-hidden="true" /></button>
            </div>
          </div>
          {(action === 'add' || action === 'rename') && (
            <form onSubmit={submitFile} className="space-y-2 border-b border-border bg-muted/30 p-3">
              <label htmlFor={`${formId}-name`} className="block text-xs font-medium">{action === 'add' ? 'Имя нового файла' : 'Новое имя файла'}</label>
              <div className="flex flex-wrap gap-2">
                <input id={`${formId}-name`} value={fileName} onChange={(event) => setFileName(event.target.value)} placeholder="components/Button.tsx" disabled={readOnly} aria-invalid={Boolean(fileError)} aria-describedby={fileError ? `${formId}-error` : undefined} className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1.5 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                <button type="submit" disabled={readOnly} className={buttonClass}>{action === 'add' ? 'Добавить' : 'Переименовать'}</button>
                <button type="button" onClick={() => setAction(null)} className={buttonClass}>Отмена</button>
              </div>
              {action === 'rename' && <p className="text-xs text-muted-foreground">Обновите импорты и ссылки на этот файл в коде проекта.</p>}
              {fileError && <p id={`${formId}-error`} role="alert" className="text-xs text-destructive">{fileError}</p>}
            </form>
          )}
          {action === 'delete' && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-destructive/10 p-3">
              <p className="flex-1 text-sm">Удалить файл «{activeFile}» вместе с его кодом?</p>
              <button type="button" disabled={readOnly} onClick={deleteFile} className={`${buttonClass} text-destructive`}>Удалить файл</button>
              <button type="button" onClick={() => setAction(null)} className={buttonClass}>Отмена</button>
            </div>
          )}
          <div id={`${formId}-editor`} className="grid min-w-0 xl:grid-cols-2">
            <div className="min-w-0">
              <CodeEditor
                value={files[activeFile] ?? ''}
                onChange={(content) => onChange(JSON.stringify({ ...files, [activeFile]: content }, null, 2))}
                language={language}
                editorLanguage={fileLanguage(activeFile)}
                filePath={activeFile}
                ariaLabel={`Код файла ${activeFile}`}
                readOnly={readOnly}
                height={420}
                onRun={onRun}
                onSubmit={onSubmit}
              />
            </div>
            <section aria-label="Предпросмотр решения" className="flex min-h-[320px] min-w-0 flex-col border-t border-border xl:border-l xl:border-t-0">
              <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
                <h3 className="text-xs font-medium">Предпросмотр</h3>
                <span className="text-xs text-muted-foreground">Обновляется после запуска</span>
              </div>
              {previewHtml === null && previewUrl === null ? (
                <div className="flex flex-1 items-center justify-center p-6"><p className="max-w-xs text-center text-sm text-muted-foreground">Нажмите «Запустить», чтобы увидеть страницу и проверить её в браузере.</p></div>
              ) : (
                <iframe title="Предпросмотр решения" src={previewUrl ?? undefined} srcDoc={previewUrl ? undefined : previewHtml ?? undefined} sandbox="allow-scripts" referrerPolicy="no-referrer" className="min-h-[360px] w-full flex-1 border-0 bg-white" />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
