'use client'

import { useId, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { contentKey } from '@/lib/content-management/keys'

import type { Section } from '@/payload-types'
import { EditorActions } from '@/components/content-management/EditorActions'
import { inputClass, panelClass, saveContent, saveError, useContentDraft } from '@/components/content-management/form-utils'

type Props = { section?: Section; courseId: number }

function sectionDraft(section?: Section) {
  return { title: section?.title ?? '', slug: section?.slug ?? '', description: section?.description ?? '', order: (section?.order ?? 0).toString(), isPublished: section?.isPublished ?? false }
}

export function SectionForm({ section, courseId }: Props) {
  const router = useRouter()
  const id = useId()
  const [saved, setSaved] = useState(section)
  const [createKey, setCreateKey] = useState(() => contentKey())
  const { draft, setDraft, dirty, markSaved } = useContentDraft(sectionDraft(section))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  function change<K extends keyof typeof draft>(key: K, value: typeof draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    setSuccess('')
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const doc = await saveContent<Section>('sections', saved?.id, {
        ...draft, title: draft.title.trim(), slug: saved ? draft.slug.trim() : undefined, order: Number(draft.order), course: courseId,
        ...(saved ? { expectedUpdatedAt: saved.updatedAt } : {}),
      }, createKey)
      if (section) {
        setSaved(doc)
        markSaved(sectionDraft(doc))
      } else {
        markSaved(sectionDraft())
        setCreateKey(contentKey())
      }
      setSuccess(doc.isPublished ? `Раздел «${doc.title}» опубликован.` : `Черновик раздела «${doc.title}» сохранён.`)
      router.refresh()
    } catch (cause) {
      setError(saveError(cause))
    } finally {
      setSaving(false)
    }
  }
  return <form onSubmit={submit} aria-label={section ? `Раздел ${section.title}` : 'Новый раздел'} className="space-y-4">
    <fieldset disabled={saving} className={panelClass}>
      <legend className="px-1 font-semibold">{section ? 'Изменить раздел' : 'Добавить раздел'}</legend>
      <div className="space-y-2"><label htmlFor={`${id}-title`} className="block text-sm font-medium">Название раздела</label><input id={`${id}-title`} required maxLength={200} className={inputClass} value={draft.title} onChange={(event) => change('title', event.target.value)} /></div>
      <div className="space-y-2"><label htmlFor={`${id}-description`} className="block text-sm font-medium">Описание раздела</label><textarea id={`${id}-description`} rows={3} maxLength={500} className={inputClass} value={draft.description} onChange={(event) => change('description', event.target.value)} aria-describedby={`${id}-count`} /><p id={`${id}-count`} className="text-right text-xs text-muted-foreground">{draft.description.length} / 500</p></div>
      <div className="space-y-2"><label htmlFor={`${id}-order`} className="block text-sm font-medium">Порядок в курсе</label><input id={`${id}-order`} required type="number" min="0" max="1000000" step="1" className={inputClass} value={draft.order} onChange={(event) => change('order', event.target.value)} /></div>
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={draft.isPublished} onChange={(event) => change('isPublished', event.target.checked)} />Опубликовать раздел</label>
      <p className="text-sm text-muted-foreground">Раздел можно опубликовать после курса. Уроки внутри публикуются отдельно.</p>
      <details><summary className="cursor-pointer text-sm font-medium">Адрес раздела</summary><div className="mt-3 space-y-2">{saved && <><label htmlFor={`${id}-slug`} className="block text-sm">Адрес</label><input id={`${id}-slug`} maxLength={200} required className={inputClass} value={draft.slug} onChange={(event) => change('slug', event.target.value)} /></>}<p className="text-sm text-muted-foreground">{saved ? 'Меняйте адрес только при необходимости.' : 'Адрес создастся автоматически. Его можно изменить после первого сохранения.'}</p></div></details>
    </fieldset>
    <EditorActions saving={saving} dirty={dirty} published={draft.isPublished} error={error} success={success} create={!saved} />
  </form>
}
