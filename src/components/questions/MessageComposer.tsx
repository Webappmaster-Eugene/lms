'use client'

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Clock, Code2, Eye, Loader2, Pencil, Send } from 'lucide-react'

import { MessageContent, type TimestampTarget } from '@/components/questions/MessageContent'
import { useHydrated } from '@/hooks/use-hydrated'
import { usePageHasVideo } from '@/hooks/use-page-has-video'
import { COMMENT_MAX_LENGTH } from '@/lib/comment-threads'
import { clearDraft, readDraft, saveDraft } from '@/lib/message-drafts'
import { insertCode, insertText, type FieldEdit } from '@/lib/message-markdown'
import { formatTime } from '@/lib/video-memory'
import { cn } from '@/lib/utils'

export type ComposerAction = {
  id: string
  label: string
  /** Доступное имя, если видимой подписи мало: «Отправить вопрос». */
  ariaLabel?: string
  busyLabel?: string
  busyAriaLabel?: string
  secondary?: boolean
}

type Props = {
  /** Доступное имя поля. */
  label: string
  placeholder?: string
  /** Ключ черновика; без него текст не запоминается (правка уже отправленного). */
  draftKey?: string
  initialValue?: string
  autoFocus?: boolean
  /** До гидратации поле закрыто: введённое до подключения обработчиков пропало бы. */
  disabled?: boolean
  /** Первое действие - основное, его же запускает Ctrl/⌘+Enter. */
  actions: ComposerAction[]
  /** true - отправлено: поле и черновик очищаются; false - текст остаётся для повтора. */
  onSubmit: (text: string, actionId: string) => Promise<boolean>
  onCancel?: () => void
  /** Подсказка «как спросить» - для вопроса ученика. */
  guide?: boolean
  /** Кнопка «Время видео» - на странице урока с видео. */
  videoTime?: boolean
  timestamps?: TimestampTarget
  /** Дополнительные кнопки слева от отправки, например «Отметить решённым». */
  extra?: ReactNode
}

/** От этой доли предела появляется счётчик знаков. */
const COUNTER_FROM = 0.8

/**
 * Поле сообщения в переписке ученика и ментора: растёт по тексту, умеет блок
 * кода и метку времени видео, показывает просмотр и хранит черновик.
 */
export function MessageComposer({
  label, placeholder, draftKey, initialValue, autoFocus, disabled = false, actions, onSubmit, onCancel,
  guide = false, videoTime = false, timestamps = null, extra,
}: Props) {
  // Пока поле этого ключа не трогали, в нём черновик. Он читается после гидратации: на сервере хранилища нет.
  // Ключ хранится вместе с текстом: при переходе к другому уроку компонент живёт дальше, а текст - нет.
  const [edited, setEdited] = useState<{ key?: string; value: string } | null>(initialValue === undefined ? null : { key: draftKey, value: initialValue })
  const hydrated = useHydrated()
  const text = edited && edited.key === draftKey ? edited.value : hydrated && draftKey ? readDraft(draftKey) : ''
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const hasVideo = usePageHasVideo() && videoTime
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const guideId = useId()

  useLayoutEffect(() => {
    const area = areaRef.current
    if (!area) return
    // Высота по тексту; потолок задаёт max-height, дальше поле прокручивается.
    area.style.height = 'auto'
    area.style.height = `${area.scrollHeight}px`
  }, [text, preview])

  function change(value: string) {
    setEdited({ key: draftKey, value })
    if (draftKey) saveDraft(draftKey, value)
  }

  function apply(edit: FieldEdit) {
    if (edit.value.length > COMMENT_MAX_LENGTH) return
    change(edit.value)
    requestAnimationFrame(() => {
      const area = areaRef.current
      if (!area) return
      area.focus()
      area.setSelectionRange(edit.selectionStart, edit.selectionEnd)
    })
  }

  function selection(): [number, number] {
    const area = areaRef.current
    return [area?.selectionStart ?? text.length, area?.selectionEnd ?? text.length]
  }

  function addVideoTime() {
    const video = document.querySelector('video')
    if (!video) return
    apply(insertText(text, ...selection(), `[${formatTime(video.currentTime)}] `))
  }

  async function submit(action: ComposerAction) {
    const value = text.trim()
    if (!value || busy || disabled) return
    setBusy(action.id)
    try {
      if (await onSubmit(value, action.id)) {
        setEdited({ key: draftKey, value: '' })
        setPreview(false)
        if (draftKey) clearDraft(draftKey)
      }
    } finally {
      setBusy(null)
    }
  }

  const empty = !text.trim()
  const locked = disabled || busy !== null
  const toolClass = 'inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50'

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
        {preview ? (
          <div className="max-h-[50vh] min-h-[5.5rem] overflow-y-auto px-3 py-2.5 text-sm" aria-label="Просмотр сообщения" role="region">
            {empty
              ? <p className="text-muted-foreground">Пока нечего показать</p>
              : <MessageContent content={text} timestamps={timestamps} />}
          </div>
        ) : (
          <textarea
            ref={areaRef}
            value={text}
            onChange={(event) => change(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                void submit(actions[0])
              } else if (event.key === 'Escape' && onCancel) {
                event.preventDefault()
                onCancel()
              }
            }}
            aria-label={label}
            aria-describedby={guide && guideOpen ? guideId : undefined}
            placeholder={placeholder}
            maxLength={COMMENT_MAX_LENGTH}
            rows={3}
            autoFocus={autoFocus}
            disabled={disabled}
            className="block max-h-[50vh] min-h-[5.5rem] w-full resize-none overflow-y-auto bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
          />
        )}
        <div className="flex flex-wrap items-center gap-0.5 border-t border-border bg-muted/40 px-1 py-0.5">
          <button type="button" className={toolClass} onClick={() => apply(insertCode(text, ...selection()))} disabled={disabled || preview}>
            <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
            Код
          </button>
          {hasVideo && (
            <button type="button" className={toolClass} onClick={addVideoTime} disabled={disabled || preview}>
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Время видео
            </button>
          )}
          <button type="button" className={toolClass} aria-pressed={preview} onClick={() => setPreview(!preview)} disabled={disabled}>
            {preview ? <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
            {preview ? 'Писать' : 'Просмотр'}
          </button>
          {text.length >= COMMENT_MAX_LENGTH * COUNTER_FROM && (
            <span className={cn('ml-auto px-2 text-xs tabular-nums', text.length >= COMMENT_MAX_LENGTH ? 'text-destructive' : 'text-muted-foreground')}>
              {text.length}/{COMMENT_MAX_LENGTH}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {guide && (
          <button
            type="button"
            aria-expanded={guideOpen}
            aria-controls={guideId}
            onClick={() => setGuideOpen(!guideOpen)}
            className="mr-auto inline-flex min-h-9 items-center gap-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Как спросить, чтобы ответили с первого раза
            <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', guideOpen && 'rotate-180')} aria-hidden="true" />
          </button>
        )}
        <span className="hidden text-xs text-muted-foreground sm:inline">Ctrl/⌘+Enter - {actions[0].label.toLowerCase()}</span>
        {extra}
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy !== null} className="min-h-11 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50">
            Отмена
          </button>
        )}
        {actions.map((action) => {
          const running = busy === action.id
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => void submit(action)}
              disabled={locked || empty}
              aria-label={running ? (action.busyAriaLabel ?? action.busyLabel) : action.ariaLabel}
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-50',
                action.secondary
                  ? 'border border-border text-foreground hover:bg-accent'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : !action.secondary && <Send className="h-4 w-4" aria-hidden="true" />}
              {running ? (action.busyLabel ?? action.label) : action.label}
            </button>
          )
        })}
      </div>

      {guide && guideOpen && (
        <ul id={guideId} className="list-disc space-y-1 rounded-lg bg-muted/50 py-2.5 pl-8 pr-3 text-xs text-muted-foreground">
          <li>Что делаете и какой результат ждёте.</li>
          <li>Что получилось вместо этого. Ошибку вставьте целиком, а не пересказом.</li>
          <li>Код - блоком, кнопка «Код» сохранит отступы.</li>
          <li>Если вопрос про видео - отметьте момент кнопкой «Время видео».</li>
          <li>Что уже пробовали и что из этого вышло.</li>
        </ul>
      )}
    </div>
  )
}
