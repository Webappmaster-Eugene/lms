'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import { BookmarkPlus, Loader2, Pencil } from 'lucide-react'

import { messagePreview } from '@/lib/comment-threads'
import {
  TEMPLATE_TITLE_MAX, matchTemplates, suggestTemplateTitle, templateFromText,
  type ReplyTemplateItem, type TemplateValues,
} from '@/lib/reply-templates'

export const REPLY_TEMPLATES_ADMIN_HREF = '/admin/collections/reply-templates'

/** Заготовки, которые экран ментора отдаёт полю ответа. */
export type ComposerTemplates = {
  items: readonly ReplyTemplateItem[]
  /** Имя ученика и урок этой ветки - для {имя} и {урок}. */
  values: TemplateValues
  /** Вставили заготовку: экран считает, как часто ей пользуются. */
  onUse: (id: number) => void
  /** true - сохранено, форма закрывается; false - введённое остаётся для повтора. */
  onSave: (title: string, content: string) => Promise<boolean>
  onAddStarters: () => Promise<void>
}

type Props = {
  id: string
  templates: ComposerTemplates
  /** Текст поля: из него сохраняется новая заготовка. */
  text: string
  /** false - текст не поместился в поле. */
  onInsert: (item: ReplyTemplateItem) => boolean
  onClose: () => void
}

/**
 * Список заготовок под полем ответа: поиск, вставка щелчком или Enter,
 * сохранение текущего ответа новой заготовкой.
 */
export function ReplyTemplatePicker({ id, templates, text, onInsert, onClose }: Props) {
  const { items, values, onSave, onAddStarters } = templates
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [saveTitle, setSaveTitle] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'starters' | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const matches = matchTemplates(items, query)
  const canSave = text.trim() !== ''

  function insert(item: ReplyTemplateItem) {
    if (onInsert(item)) return
    setNotice(`«${item.title}» не помещается: в ответе стало бы больше знаков, чем можно отправить`)
  }

  function moveFocus(from: HTMLElement, step: 1 | -1) {
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-template]') ?? [])]
    const index = buttons.indexOf(from as HTMLButtonElement)
    if (index === -1) {
      if (step === 1) buttons[0]?.focus()
      return
    }
    const next = buttons[index + step]
    if (next) next.focus()
    else if (step === -1) searchRef.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'ArrowDown' && (target === searchRef.current || target.dataset.template !== undefined)) {
      event.preventDefault()
      moveFocus(target, 1)
    } else if (event.key === 'ArrowUp' && target.dataset.template !== undefined) {
      event.preventDefault()
      moveFocus(target, -1)
    }
  }

  async function save() {
    const title = saveTitle?.trim()
    if (!title || busy) return
    setBusy('save')
    try {
      if (await onSave(title, templateFromText(text.trim(), values))) setSaveTitle(null)
    } finally {
      setBusy(null)
    }
  }

  async function addStarters() {
    setBusy('starters')
    try {
      await onAddStarters()
    } finally {
      setBusy(null)
    }
  }

  const linkClass = 'inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50'

  return (
    <div id={id} role="region" aria-label="Заготовки ответов" onKeyDown={onKeyDown} className="space-y-2 rounded-lg border border-border bg-card p-2">
      <input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setNotice(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && matches[0]) {
            event.preventDefault()
            insert(matches[0])
          }
        }}
        aria-label="Найти заготовку"
        placeholder="Найти заготовку"
        autoFocus
        className="block min-h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
      />

      {items.length === 0 ? (
        <div className="space-y-2 px-1 py-2 text-sm text-muted-foreground">
          <p>Заготовок пока нет. Сохраните ответ кнопкой ниже или добавьте примеры, их можно поправить под себя.</p>
          <button type="button" onClick={() => void addStarters()} disabled={busy !== null} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50">
            {busy === 'starters' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Добавить примеры
          </button>
        </div>
      ) : matches.length === 0 ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">Ничего не нашлось</p>
      ) : (
        <ul ref={listRef} className="max-h-72 space-y-0.5 overflow-y-auto" aria-label="Найденные заготовки">
          {matches.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                data-template=""
                onClick={() => insert(item)}
                className="block min-h-11 w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <span className="block text-sm font-medium text-foreground [overflow-wrap:anywhere]">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{messagePreview(item.content).split('\n')[0]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {notice && <p role="alert" className="px-1 text-xs text-destructive">{notice}</p>}

      {saveTitle === null ? (
        <div className="flex flex-wrap items-center justify-between gap-1 border-t border-border pt-1.5">
          <button type="button" className={linkClass} onClick={() => setSaveTitle(suggestTemplateTitle(text))} disabled={!canSave}>
            <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
            Сохранить текст как заготовку
          </button>
          <a href={REPLY_TEMPLATES_ADMIN_HREF} className={linkClass}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Изменить заготовки
          </a>
        </div>
      ) : (
        <form
          className="space-y-1.5 border-t border-border pt-2"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <div className="flex flex-wrap gap-2">
            <input
              value={saveTitle}
              onChange={(event) => setSaveTitle(event.target.value)}
              aria-label="Название заготовки"
              placeholder="Название заготовки"
              maxLength={TEMPLATE_TITLE_MAX}
              // Кнопка «Сохранить текст» исчезает вместе с фокусом: без переноса он упал бы на body.
              autoFocus
              className="block min-h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
            <button type="submit" disabled={!saveTitle.trim() || busy !== null} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
              {busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Сохранить
            </button>
            <button type="button" onClick={() => setSaveTitle(null)} disabled={busy !== null} className="min-h-9 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50">
              Отмена
            </button>
          </div>
          <p className="px-1 text-xs text-muted-foreground">Имя ученика и название урока сохранятся метками {'{имя}'} и {'{урок}'}.</p>
        </form>
      )}
    </div>
  )
}
