'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { $createParagraphNode, $getSelection, $isRangeSelection, $setSelection, FORMAT_TEXT_COMMAND, REDO_COMMAND, UNDO_COMMAND, type RangeSelection } from '@payloadcms/richtext-lexical/lexical'
import { LinkNode, TOGGLE_LINK_COMMAND } from '@payloadcms/richtext-lexical/lexical/link'
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, ListItemNode, ListNode } from '@payloadcms/richtext-lexical/lexical/list'
import { HeadingNode, QuoteNode, $createHeadingNode } from '@payloadcms/richtext-lexical/lexical/rich-text'
import { $setBlocksType } from '@payloadcms/richtext-lexical/lexical/selection'
import { LexicalComposer } from '@payloadcms/richtext-lexical/lexical/react/LexicalComposer'
import { ContentEditable } from '@payloadcms/richtext-lexical/lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@payloadcms/richtext-lexical/lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@payloadcms/richtext-lexical/lexical/react/LexicalHistoryPlugin'
import { LinkPlugin } from '@payloadcms/richtext-lexical/lexical/react/LexicalLinkPlugin'
import { ListPlugin } from '@payloadcms/richtext-lexical/lexical/react/LexicalListPlugin'
import { RichTextPlugin } from '@payloadcms/richtext-lexical/lexical/react/LexicalRichTextPlugin'
import { useLexicalComposerContext } from '@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext'

import type { Course } from '@/payload-types'
import { ContentLinkNode } from '@/components/content-management/ContentLinkNode'

type RichValue = NonNullable<Course['description']>

export function emptyRichText(): RichValue {
  return { root: { type: 'root', children: [{ type: 'paragraph', children: [], direction: null, format: '', indent: 0, version: 1 }], direction: null, format: '', indent: 0, version: 1 } }
}

/** Only the discriminator changes; Payload's fields and other node data stay intact. */
export function adaptLinkTypes(value: RichValue, type: 'link' | 'content-link'): RichValue {
  function visit(node: Record<string, unknown>): Record<string, unknown> {
    const next = { ...node }
    if (next.type === 'link' || next.type === 'content-link') next.type = type
    if (Array.isArray(next.children)) next.children = next.children.map((child) => visit(child as Record<string, unknown>))
    return next
  }
  return { ...value, root: visit(value.root) as RichValue['root'] }
}

const nodeKeys: Record<string, readonly string[]> = {
  root: ['type', 'children', 'direction', 'format', 'indent', 'version'],
  paragraph: ['type', 'children', 'direction', 'format', 'indent', 'version', 'textFormat', 'textStyle'],
  heading: ['type', 'children', 'direction', 'format', 'indent', 'version', 'tag'],
  quote: ['type', 'children', 'direction', 'format', 'indent', 'version'],
  text: ['type', 'text', 'detail', 'format', 'mode', 'style', 'version'],
  linebreak: ['type', 'version'],
  list: ['type', 'children', 'direction', 'format', 'indent', 'version', 'listType', 'start', 'tag'],
  listitem: ['type', 'children', 'direction', 'format', 'indent', 'version', 'value', 'checked'],
  link: ['type', 'children', 'direction', 'format', 'indent', 'version', 'fields', 'id'],
}

export function canEditRichText(value: RichValue): boolean {
  const visit = (node: unknown): boolean => {
    if (!node || typeof node !== 'object') return false
    const record = node as Record<string, unknown>
    if (typeof record.type !== 'string' || !nodeKeys[record.type]) return false
    const allowed = nodeKeys[record.type]
    if (Object.keys(record).some((key) => !allowed.includes(key) && !(Array.isArray(record.children) && (key === 'textFormat' || key === 'textStyle')))) return false
    if (record.type === 'link') {
      const fields = record.fields as Record<string, unknown> | undefined
      if (fields?.linkType !== 'custom') return false
    }
    return !('children' in record) || (Array.isArray(record.children) && record.children.every(visit))
  }
  return Object.keys(value).every((key) => key === 'root') && visit(value.root)
}

const toolClass = 'min-h-[44px] rounded px-3 py-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50'

function Changes({ value, onChange }: { value: RichValue; onChange: (value: RichValue) => void }) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    const current = editor.getEditorState().toJSON()
    // Compare imported states so harmless Lexical defaults do not reset the caret.
    const incoming = editor.parseEditorState(JSON.stringify(adaptLinkTypes(value, 'content-link')))
    if (JSON.stringify(current) !== JSON.stringify(incoming.toJSON())) editor.setEditorState(incoming, { tag: 'external-value' })
  }, [editor, value])
  useEffect(() => {
    let previous = JSON.stringify(editor.getEditorState().toJSON())
    return editor.registerUpdateListener(({ editorState, tags }) => {
      const next = editorState.toJSON()
      const serialized = JSON.stringify(next)
      if (previous === serialized) return
      previous = serialized
      if (tags.has('external-value')) return
      onChange(adaptLinkTypes({ ...next, root: { ...next.root, children: next.root.children.map((child) => ({ ...child })) } }, 'link'))
    })
  }, [editor, onChange])
  return null
}

function Tools({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext()
  const [showLink, setShowLink] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const linkSelection = useRef<RangeSelection | null>(null)
  useEffect(() => { editor.setEditable(!disabled) }, [disabled, editor])
  function applyLink() {
    if (!/^(https?:\/\/)/i.test(url.trim())) {
      setError('Укажите ссылку с https:// или http://')
      return
    }
    editor.update(() => {
      if (linkSelection.current) $setSelection(linkSelection.current.clone())
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, url.trim())
    })
    setShowLink(false)
    setError('')
    editor.focus()
  }
  return <>
    <div className="flex flex-wrap items-center gap-1 border-b p-2" role="group" aria-label="Форматирование текста" onMouseDown={(event) => { if ((event.target as HTMLElement).closest('button')) event.preventDefault() }}>
      <button type="button" disabled={disabled} className={toolClass} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}>Жирный</button>
      <button type="button" disabled={disabled} className={toolClass} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}>Курсив</button>
      <button type="button" disabled={disabled} className={toolClass} onClick={() => editor.update(() => { const selection = $getSelection(); if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createHeadingNode('h2')) })}>Заголовок</button>
      <button type="button" disabled={disabled} className={toolClass} onClick={() => editor.update(() => { const selection = $getSelection(); if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createParagraphNode()) })}>Абзац</button>
      <button type="button" disabled={disabled} className={toolClass} onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}>Список</button>
      <button type="button" disabled={disabled} className={toolClass} onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}>Нумерация</button>
      <button type="button" disabled={disabled} className={toolClass} onClick={() => {
        editor.getEditorState().read(() => { const selection = $getSelection(); linkSelection.current = $isRangeSelection(selection) ? selection.clone() : null })
        setShowLink(!showLink)
      }}>Ссылка</button>
      <button type="button" disabled={disabled} className={toolClass} onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}>Отменить</button>
      <button type="button" disabled={disabled} className={toolClass} onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}>Повторить</button>
    </div>
    {showLink && <div className="space-y-2 border-b p-3">
      <label className="block text-sm">Адрес ссылки<input aria-label="Адрес ссылки" className="mt-1 w-full rounded border bg-background px-3 py-2" value={url} onChange={(event) => setUrl(event.target.value)} disabled={disabled} /></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2"><button className={toolClass} type="button" disabled={disabled} onClick={applyLink}>Применить ссылку</button><button className={toolClass} type="button" disabled={disabled} onClick={() => { editor.update(() => { if (linkSelection.current) $setSelection(linkSelection.current.clone()); editor.dispatchCommand(TOGGLE_LINK_COMMAND, null) }); setShowLink(false) }}>Убрать ссылку</button></div>
    </div>}
  </>
}

export function RichTextEditor({ value, onChange, label, id, disabled = false }: {
  value: Course['description'] | null | undefined
  onChange: (value: RichValue) => void
  label: string
  id: string
  disabled?: boolean
}) {
  const [error, setError] = useState('')
  const [initial] = useState(() => value ?? emptyRichText())
  const current = value ?? initial
  const supported = canEditRichText(initial) && canEditRichText(current)
  const config = useMemo(() => ({
    namespace: id,
    editable: !disabled,
    editorState: supported ? JSON.stringify(adaptLinkTypes(initial, 'content-link')) : null,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, ContentLinkNode, { replace: LinkNode, with: (node: LinkNode) => new ContentLinkNode(node.getURL()), withKlass: ContentLinkNode }],
    theme: { paragraph: 'my-2', heading: { h1: 'text-2xl font-bold', h2: 'text-xl font-semibold', h3: 'text-lg font-semibold' }, text: { bold: 'font-bold', italic: 'italic', underline: 'underline', strikethrough: 'line-through', code: 'rounded bg-muted px-1 font-mono' }, list: { ul: 'list-disc pl-6', ol: 'list-decimal pl-6', listitem: 'my-1' }, link: 'text-info underline' },
    onError: () => setError('Не удалось открыть этот текст для редактирования. Исходное форматирование сохранено. Остальные поля можно изменить.'),
  }), [id, initial, supported, disabled])
  return <div className="space-y-2">
    <p id={`${id}-label`} className="text-sm font-medium">{label}</p>
    {!supported || error ? <p role="alert" className="rounded border border-warning/40 bg-warning/10 p-3 text-sm">{error || 'Этот текст содержит сложные элементы, которые пока нельзя править здесь. Исходный текст сохранён; остальные поля доступны для редактирования.'}</p> : <div className="overflow-hidden rounded border bg-background">
      <LexicalComposer initialConfig={config}>
        <Tools disabled={disabled} />
        <RichTextPlugin contentEditable={<ContentEditable id={id} aria-labelledby={`${id}-label`} className="min-h-40 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring" />} ErrorBoundary={LexicalErrorBoundary} />
        <HistoryPlugin /><ListPlugin /><LinkPlugin validateUrl={(url) => /^(https?:\/\/)/i.test(url)} />
        <Changes value={current} onChange={onChange} />
      </LexicalComposer>
    </div>}
  </div>
}
