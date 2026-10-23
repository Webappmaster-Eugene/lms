'use client'

import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import type { TextareaFieldClientComponent } from 'payload'

import { GUIDE_CALLOUTS, guideMarkdownHeadings, isGuideCalloutType, remarkGuideCallouts, type GuideCalloutType } from '@/lib/guide-markdown'
import { guideReadingMinutes } from '@/lib/guides'

import './guide-admin.scss'

type Mode = 'write' | 'split' | 'preview'
const MODES: { value: Mode; label: string }[] = [
  { value: 'write', label: 'Текст' },
  { value: 'split', label: 'Рядом' },
  { value: 'preview', label: 'Просмотр' },
]
const MODE_KEY = 'guide-editor-mode'
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
/** Скриншот шага редко больше пары мегабайт; 10 МБ — почти наверняка не тот файл. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const TEMPLATE = `Вступление: для кого этот гайд и что человек получит в конце. Одна-две фразы.

## Что понадобится

- Пункт
- Пункт

## Шаг 1. Название шага

1. Действие
2. Действие

> [!TIP]
> Совет, который сэкономит время.

## Шаг 2. Название шага

Текст шага.

> [!WARNING]
> Ловушка, на которой чаще всего ошибаются.

## Чек-лист

- [ ] Что должно получиться
- [ ] Что проверить
`

type Edit = { start: number; end: number; text: string; select?: [number, number] }

const subscribeNever = () => () => {}

function readMode(): Mode {
  try {
    const saved = window.localStorage.getItem(MODE_KEY)
    if (saved === 'write' || saved === 'split' || saved === 'preview') return saved
  } catch {
    // Хранилище недоступно (приватный режим) — режим по ширине экрана.
  }
  return window.matchMedia('(min-width: 1100px)').matches ? 'split' : 'write'
}

/** Предпросмотр — тот же разбор, что на сайте (GFM, врезки), без подсветки кода. */
const previewComponents: Components = {
  aside: ({ node, children }) => {
    const type = node?.properties?.dataCallout
    if (!isGuideCalloutType(type)) return <aside>{children}</aside>
    const title = node?.properties?.dataTitle
    return (
      <aside className={`guide-prose__callout guide-prose__callout--${type satisfies GuideCalloutType}`}>
        <p className="guide-prose__callout-title">{typeof title === 'string' ? title : GUIDE_CALLOUTS[type]}</p>
        {children}
      </aside>
    )
  },
  a: ({ node: _node, href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  table: ({ node: _node, ...props }) => <div className="guide-prose__table"><table {...props} /></div>,
  // eslint-disable-next-line @next/next/no-img-element -- предпросмотр Markdown: размеры картинки неизвестны
  img: ({ node: _node, src, alt, title }) => (typeof src === 'string' && src ? <span className="guide-prose__figure"><img src={src} alt={alt ?? ''} />{title && <span>{title}</span>}</span> : null),
}

function ToolButton({ label, hint, onClick, disabled, children }: { label: string; hint?: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" className="guide-editor__tool" title={hint ? `${label} (${hint})` : label} aria-label={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

/**
 * Поле «Текст гайда» в CMS: Markdown с панелью форматирования и предпросмотром.
 * Правки идут через insertText — Ctrl+Z отменяет и кнопки панели, а не только ввод с клавиатуры.
 */
export const GuideMarkdownEditor: TextareaFieldClientComponent = ({ field, path, readOnly }) => {
  // Пустой текст отклоняет validate поля на сервере, ошибка приходит в форму и показывается ниже.
  const { value, setValue, showError } = useField<string>({ path })
  const text = value ?? ''
  const deferred = useDeferredValue(text)
  const area = useRef<HTMLTextAreaElement>(null)
  const preview = useRef<HTMLDivElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  // Режим из прошлого раза читается только в браузере: на сервере редактор рендерится в «Тексте».
  const preferred = useSyncExternalStore(subscribeNever, readMode, () => 'write' as const)
  const [chosen, setMode] = useState<Mode | null>(null)
  const mode = chosen ?? preferred
  const [fullscreen, setFullscreen] = useState(false)
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const calloutId = useId()
  const inputId = `field-${path.replace(/\./g, '__')}`
  const disabled = Boolean(readOnly)

  useEffect(() => {
    if (!fullscreen) return
    const close = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setFullscreen(false) }
    document.addEventListener('keydown', close)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', close)
      document.body.style.overflow = ''
    }
  }, [fullscreen])

  function changeMode(next: Mode) {
    setMode(next)
    try {
      window.localStorage.setItem(MODE_KEY, next)
    } catch {
      // Не запомнили режим — не страшно, он выбирается заново при открытии.
    }
  }

  const apply = useCallback((edit: Edit) => {
    const element = area.current
    if (!element || disabled) return
    element.focus()
    element.setSelectionRange(edit.start, edit.end)
    // execCommand кладёт правку в историю отмены браузера; где его нет — меняем значение напрямую.
    const inserted = typeof document.execCommand === 'function' && document.execCommand('insertText', false, edit.text)
    if (!inserted) {
      element.setRangeText(edit.text, edit.start, edit.end, 'end')
      setValue(element.value)
    }
    const [from, to] = edit.select ?? [edit.start + edit.text.length, edit.start + edit.text.length]
    element.setSelectionRange(from, to)
  }, [disabled, setValue])

  const selection = () => {
    const element = area.current
    const start = element?.selectionStart ?? text.length
    const end = element?.selectionEnd ?? text.length
    return { start, end, selected: text.slice(start, end) }
  }

  /** Обрамляет выделение: **жирный**, `код`, [ссылка](…). Без выделения вставляет образец и выделяет его. */
  function wrap(before: string, after: string, sample: string) {
    const { start, end, selected } = selection()
    const inner = selected || sample
    apply({ start, end, text: `${before}${inner}${after}`, select: [start + before.length, start + before.length + inner.length] })
  }

  /** Меняет начало каждой выделенной строки: заголовок, список, цитата. */
  function prefixLines(prefix: (index: number) => string, strip: RegExp) {
    const { start, end } = selection()
    const lineStart = text.lastIndexOf('\n', start - 1) + 1
    const nextBreak = text.indexOf('\n', end > start && text[end - 1] === '\n' ? end - 1 : end)
    const lineEnd = nextBreak === -1 ? text.length : nextBreak
    const lines = text.slice(lineStart, lineEnd).split('\n')
    const replaced = lines.map((line, index) => `${prefix(index)}${line.replace(strip, '')}`).join('\n')
    apply({ start: lineStart, end: lineEnd, text: replaced, select: [lineStart, lineStart + replaced.length] })
  }

  /** Вставляет блок отдельным абзацем: Markdown требует пустую строку вокруг таблиц, кода и врезок. */
  function block(content: string, selectFrom?: number, selectLength?: number) {
    const { start, end } = selection()
    const before = text.slice(0, start)
    const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
    const after = text.slice(end)
    const tail = after.startsWith('\n\n') || after === '' ? '' : after.startsWith('\n') ? '\n' : '\n\n'
    const insert = `${lead}${content}${tail}`
    const offset = start + lead.length
    apply({ start, end, text: insert, select: selectFrom === undefined ? undefined : [offset + selectFrom, offset + selectFrom + (selectLength ?? 0)] })
  }

  const heading = (level: 2 | 3) => prefixLines(() => `${'#'.repeat(level)} `, /^#{1,6}\s+/)
  const bullet = () => prefixLines(() => '- ', /^(\s*)([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/)
  const numbered = () => prefixLines((index) => `${index + 1}. `, /^(\s*)([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/)
  const checklist = () => prefixLines(() => '- [ ] ', /^(\s*)([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/)

  function link() {
    const { start, end, selected } = selection()
    const label = selected || 'текст ссылки'
    const insert = `[${label}](https://)`
    const urlStart = start + label.length + 3
    apply({ start, end, text: insert, select: selected ? [urlStart, urlStart + 8] : [start + 1, start + 1 + label.length] })
  }

  function codeBlock() {
    const { selected } = selection()
    const body = selected || 'команда'
    block(`\`\`\`bash\n${body}\n\`\`\``, 8, body.length)
  }

  function table() {
    block('| Колонка | Колонка | Колонка |\n| --- | --- | --- |\n| Текст | Текст | Текст |\n| Текст | Текст | Текст |', 2, 7)
  }

  function callout(type: GuideCalloutType) {
    const { selected } = selection()
    const body = (selected || 'Текст врезки').split('\n').map((line) => `> ${line}`).join('\n')
    const marker = `> [!${type.toUpperCase()}]\n`
    block(`${marker}${body}`, marker.length + 2, (selected || 'Текст врезки').split('\n')[0].length)
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!IMAGE_TYPES.includes(file.type)) {
      setStatus({ error: true, text: `«${file.name}»: подходят PNG, JPEG, WebP и GIF` })
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setStatus({ error: true, text: `«${file.name}» больше 10 МБ — уменьшите картинку` })
      return
    }
    // Позицию запоминаем до загрузки: пока файл идёт, фокус может уйти из поля.
    const at = selection()
    const alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Скриншот'
    setUploading(true)
    setStatus({ error: false, text: `Загружаем «${file.name}»…` })
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('_payload', JSON.stringify({ alt }))
      const res = await fetch('/api/media', { method: 'POST', body: form, credentials: 'include' })
      if (!res.ok) throw new Error(`POST /api/media → ${res.status}`)
      const { doc } = (await res.json()) as { doc?: { url?: string | null } }
      if (!doc?.url) throw new Error('сервер не вернул адрес картинки')
      // Адрес без домена: гайд не зависит от того, на каком адресе открыта платформа.
      const url = doc.url.replace(/^https?:\/\/[^/]+/, '')
      const markup = `![${alt}](${url})`
      const before = text.slice(0, at.start)
      const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
      apply({ start: at.start, end: at.end, text: `${lead}${markup}\n\n`, select: [at.start + lead.length + 2, at.start + lead.length + 2 + alt.length] })
      setStatus({ error: false, text: `Картинка загружена в медиатеку. Поправьте описание в квадратных скобках — его прочитает экранный диктор.` })
    } catch (error) {
      console.error('Не удалось загрузить картинку гайда', error)
      setStatus({ error: true, text: `Не удалось загрузить «${file.name}»: ${error instanceof Error ? error.message : 'неизвестная ошибка'}` })
    } finally {
      setUploading(false)
    }
  }

  function keys(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return
    const key = event.key.toLowerCase()
    if (key === 'b' || key === 'и') { event.preventDefault(); wrap('**', '**', 'жирный текст') }
    else if (key === 'i' || key === 'ш') { event.preventDefault(); wrap('*', '*', 'курсив') }
    else if (key === 'k' || key === 'л') { event.preventDefault(); link() }
  }

  /** В режиме «Рядом» предпросмотр едет вместе с текстом — пропорционально высоте. */
  function syncScroll() {
    const source = area.current
    const target = preview.current
    if (!source || !target || mode !== 'split') return
    const ratio = source.scrollTop / Math.max(1, source.scrollHeight - source.clientHeight)
    target.scrollTop = ratio * (target.scrollHeight - target.clientHeight)
  }

  const stats = useMemo(() => {
    const sections = guideMarkdownHeadings(deferred).length
    return `≈ ${guideReadingMinutes(deferred)} мин чтения · разделов: ${sections} · символов: ${deferred.length}`
  }, [deferred])

  const description = typeof field.admin?.description === 'string' ? field.admin.description : 'Разделы «## Название» становятся оглавлением. Врезки: «> [!TIP]», «> [!WARNING]». Ctrl+B — жирный, Ctrl+I — курсив, Ctrl+K — ссылка.'

  return (
    <div className={`field-type guide-editor${fullscreen ? ' guide-editor--fullscreen' : ''}${showError ? ' error' : ''}`}>
      <FieldLabel htmlFor={inputId} label={field.label} path={path} required />
      <div className="guide-editor__bar" role="toolbar" aria-label="Форматирование текста гайда">
        <div className="guide-editor__group">
          <ToolButton label="Раздел — пункт оглавления" onClick={() => heading(2)} disabled={disabled}>H2</ToolButton>
          <ToolButton label="Подраздел" onClick={() => heading(3)} disabled={disabled}>H3</ToolButton>
        </div>
        <div className="guide-editor__group">
          <ToolButton label="Жирный" hint="Ctrl+B" onClick={() => wrap('**', '**', 'жирный текст')} disabled={disabled}><b>Ж</b></ToolButton>
          <ToolButton label="Курсив" hint="Ctrl+I" onClick={() => wrap('*', '*', 'курсив')} disabled={disabled}><i>К</i></ToolButton>
          <ToolButton label="Код в строке" onClick={() => wrap('`', '`', 'код')} disabled={disabled}>{'</>'}</ToolButton>
        </div>
        <div className="guide-editor__group">
          <ToolButton label="Список" onClick={bullet} disabled={disabled}>• —</ToolButton>
          <ToolButton label="Нумерованный список" onClick={numbered} disabled={disabled}>1.</ToolButton>
          <ToolButton label="Чек-лист" onClick={checklist} disabled={disabled}>☐</ToolButton>
        </div>
        <div className="guide-editor__group">
          <ToolButton label="Ссылка" hint="Ctrl+K" onClick={link} disabled={disabled}>Ссылка</ToolButton>
          <ToolButton label="Картинка — загрузить в медиатеку" onClick={() => imageInput.current?.click()} disabled={disabled || uploading}>{uploading ? 'Загрузка…' : 'Картинка'}</ToolButton>
          <ToolButton label="Таблица" onClick={table} disabled={disabled}>Таблица</ToolButton>
          <ToolButton label="Блок кода" onClick={codeBlock} disabled={disabled}>Код</ToolButton>
        </div>
        <div className="guide-editor__group">
          <label className="guide-editor__sr" htmlFor={calloutId}>Врезка</label>
          <select
            id={calloutId}
            className="guide-editor__select"
            value=""
            disabled={disabled}
            onChange={(event) => { if (isGuideCalloutType(event.target.value)) callout(event.target.value) }}
          >
            <option value="" disabled>Врезка…</option>
            {Object.entries(GUIDE_CALLOUTS).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
          </select>
          {!text.trim() && <ToolButton label="Вставить шаблон гайда" onClick={() => block(TEMPLATE.trimEnd())} disabled={disabled}>Шаблон</ToolButton>}
        </div>
        <div className="guide-editor__group guide-editor__group--end">
          <div className="guide-editor__modes" role="group" aria-label="Вид редактора">
            {MODES.map((item) => (
              <button key={item.value} type="button" aria-pressed={mode === item.value} onClick={() => changeMode(item.value)}>{item.label}</button>
            ))}
          </div>
          <ToolButton label={fullscreen ? 'Свернуть (Esc)' : 'На весь экран'} onClick={() => setFullscreen((value) => !value)}>{fullscreen ? 'Свернуть' : '⛶'}</ToolButton>
        </div>
      </div>
      <input ref={imageInput} type="file" accept={IMAGE_TYPES.join(',')} hidden onChange={uploadImage} />
      <div className={`guide-editor__panes guide-editor__panes--${mode}`}>
        <textarea
          ref={area}
          id={inputId}
          name={path}
          className="guide-editor__input"
          value={text}
          readOnly={disabled}
          spellCheck
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={keys}
          onScroll={syncScroll}
          placeholder="Начните с вступления, разделы — строкой «## Название». Пустой гайд можно начать с кнопки «Шаблон»."
          hidden={mode === 'preview'}
        />
        {mode !== 'write' && (
          <div ref={preview} className="guide-editor__preview guide-prose" aria-label="Предпросмотр гайда">
            {deferred.trim()
              ? <Markdown remarkPlugins={[remarkGfm, remarkGuideCallouts]} components={previewComponents}>{deferred}</Markdown>
              : <p className="guide-editor__empty">Здесь появится гайд таким, каким его увидит ученик.</p>}
          </div>
        )}
      </div>
      <div className="guide-editor__status">
        <span>{stats}</span>
        {status && <span role="status" className={status.error ? 'guide-editor__status-error' : undefined}>{status.text}</span>}
      </div>
      <FieldError path={path} showError={showError} />
      <FieldDescription description={description} path={path} />
    </div>
  )
}
