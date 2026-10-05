'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { contentKey } from '@/lib/content-management/keys'

import type { Course, Lesson, Section } from '@/payload-types'
import { EditorActions } from '@/components/content-management/EditorActions'
import { LessonBlocks } from '@/components/content-management/LessonBlocks'
import { inputClass, optionalNumber, panelClass, relationId, saveContent, saveError, useContentDraft } from '@/components/content-management/form-utils'

type Props = { lesson?: Lesson; course: Course; sections: Section[]; defaultSection?: number }

function lessonDraft(lesson?: Lesson, defaultSection?: number) {
  return {
    title: lesson?.title ?? '', slug: lesson?.slug ?? '', description: lesson?.description ?? '',
    section: relationId(lesson?.section) ?? defaultSection ?? null,
    estimatedMinutes: lesson?.estimatedMinutes?.toString() ?? '', order: (lesson?.order ?? 0).toString(),
    content: lesson?.content ?? [], isPublished: lesson?.isPublished ?? false,
  }
}

export function LessonForm({ lesson, course, sections, defaultSection }: Props) {
  const router = useRouter()
  const [saved, setSaved] = useState(lesson)
  const [createKey] = useState(() => contentKey())
  const { draft, setDraft, dirty, markSaved, canLeave } = useContentDraft(lessonDraft(lesson, defaultSection))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const courseSections = sections.filter((section) => relationId(section.course) === course.id)
  const selectedSection = courseSections.find((section) => section.id === draft.section)
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
      const doc = await saveContent<Lesson>('lessons', saved?.id, {
        ...draft, title: draft.title.trim(), slug: saved ? draft.slug.trim() : undefined,
        estimatedMinutes: optionalNumber(draft.estimatedMinutes), order: Number(draft.order), course: course.id,
        ...(saved ? { expectedUpdatedAt: saved.updatedAt } : {}),
      }, createKey)
      setSaved(doc)
      markSaved(lessonDraft(doc))
      setSuccess(doc.isPublished ? 'Урок опубликован.' : 'Черновик урока сохранён.')
      router.replace(`/manage/lessons/${doc.id}`)
      router.refresh()
    } catch (cause) {
      setError(saveError(cause))
    } finally {
      setSaving(false)
    }
  }
  function back() {
    if (canLeave()) router.push(`/manage/courses/${course.id}`)
  }
  return <form onSubmit={submit} aria-label={saved ? 'Редактирование урока' : 'Новый урок'} className="space-y-6">
    <p className="text-sm text-muted-foreground">Курс: <span className="font-medium text-foreground">{course.title}</span></p>
    <fieldset disabled={saving} className={panelClass}>
      <legend className="px-1 text-lg font-semibold">Об уроке</legend>
      <div className="space-y-2"><label htmlFor="lesson-title" className="block text-sm font-medium">Название урока</label><input id="lesson-title" required maxLength={200} className={inputClass} value={draft.title} onChange={(event) => change('title', event.target.value)} /></div>
      <div className="space-y-2"><label htmlFor="lesson-description" className="block text-sm font-medium">Краткое описание</label><textarea id="lesson-description" rows={3} maxLength={300} className={inputClass} value={draft.description} onChange={(event) => change('description', event.target.value)} aria-describedby="lesson-description-count" /><p id="lesson-description-count" className="text-right text-xs text-muted-foreground">{draft.description.length} / 300</p></div>
      <div className="grid gap-5 sm:grid-cols-3">
        <div className="space-y-2"><label htmlFor="lesson-section" className="block text-sm font-medium">Раздел курса</label><select id="lesson-section" className={inputClass} value={draft.section ?? ''} onChange={(event) => change('section', optionalNumber(event.target.value))}><option value="">Без раздела</option>{courseSections.map((section) => <option key={section.id} value={section.id}>{section.title}{!section.isPublished ? ' (черновик)' : ''}</option>)}</select></div>
        <div className="space-y-2"><label htmlFor="lesson-minutes" className="block text-sm font-medium">Время на урок, минут</label><input id="lesson-minutes" type="number" min="0" max="1000000" step="any" className={inputClass} value={draft.estimatedMinutes} onChange={(event) => change('estimatedMinutes', event.target.value)} /></div>
        <div className="space-y-2"><label htmlFor="lesson-order" className="block text-sm font-medium">Порядок в разделе</label><input id="lesson-order" required type="number" min="0" max="1000000" step="1" className={inputClass} value={draft.order} onChange={(event) => change('order', event.target.value)} /></div>
      </div>
    </fieldset>
    <fieldset disabled={saving} className={panelClass}>
      <legend className="sr-only">Материалы урока</legend>
      <LessonBlocks value={draft.content} onChange={(value) => change('content', value)} disabled={saving} />
    </fieldset>
    <fieldset disabled={saving} className={panelClass}>
      <legend className="px-1 text-lg font-semibold">Доступ ученикам</legend>
      <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={draft.isPublished} onChange={(event) => change('isPublished', event.target.checked)} />Опубликовать урок</label>
      <p className="text-sm text-muted-foreground">{draft.isPublished ? 'После сохранения урок станет доступен ученикам в опубликованном курсе.' : 'Черновик виден только администраторам.'}</p>
      {draft.isPublished && (!course.isPublished || (selectedSection && !selectedSection.isPublished)) && <p className="text-sm text-warning">Сначала опубликуйте курс и выбранный раздел.</p>}
      <details><summary className="cursor-pointer text-sm font-medium">Адрес страницы</summary><div className="mt-3 space-y-2">{saved && <><label htmlFor="lesson-slug" className="block text-sm">Адрес урока</label><input id="lesson-slug" maxLength={200} required className={inputClass} value={draft.slug} onChange={(event) => change('slug', event.target.value)} /></>}<p className="text-sm text-muted-foreground">{saved ? 'Изменение адреса нарушит ранее сохранённые ссылки.' : 'Адрес создастся автоматически. Его можно изменить после первого сохранения.'}</p></div></details>
    </fieldset>
    <EditorActions saving={saving} dirty={dirty} published={draft.isPublished} error={error} success={success} onBack={back} create={!saved} previewHref={saved?.isPublished ? `/lessons/${saved.slug}` : undefined} />
  </form>
}
