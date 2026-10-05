'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { contentKey } from '@/lib/content-management/keys'

import type { Course, Roadmap, RoadmapNode } from '@/payload-types'
import { EditorActions } from '@/components/content-management/EditorActions'
import { MediaPicker } from '@/components/content-management/MediaPicker'
import { RichTextEditor } from '@/components/content-management/RichTextEditor'
import { inputClass, optionalNumber, panelClass, relationId, saveContent, saveError, useContentDraft } from '@/components/content-management/form-utils'

type Props = {
  course?: Course
  roadmaps: Roadmap[]
  nodes: RoadmapNode[]
  courses: Pick<Course, 'id' | 'title'>[]
  defaultRoadmap?: number
  defaultNode?: number
}

function courseDraft(course?: Course, defaultRoadmap?: number, defaultNode?: number) {
  return {
    title: course?.title ?? '',
    slug: course?.slug ?? '',
    description: course?.description ?? null,
    roadmap: relationId(course?.roadmap) ?? defaultRoadmap ?? null,
    roadmapNode: relationId(course?.roadmapNode) ?? defaultNode ?? null,
    coverImage: relationId(course?.coverImage),
    estimatedHours: course?.estimatedHours?.toString() ?? '',
    order: (course?.order ?? 0).toString(),
    prerequisites: (course?.prerequisites ?? []).map((item) => typeof item === 'number' ? item : item.id),
    isPublished: course?.isPublished ?? false,
  }
}

export function CourseForm({ course, roadmaps, nodes, courses, defaultRoadmap, defaultNode }: Props) {
  const router = useRouter()
  const [saved, setSaved] = useState(course)
  const [createKey] = useState(() => contentKey())
  const { draft, setDraft, dirty, markSaved, canLeave } = useContentDraft(courseDraft(course, defaultRoadmap, defaultNode))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const selectedRoadmap = roadmaps.find((item) => item.id === draft.roadmap)
  const selectedNodes = nodes.filter((node) => relationId(node.roadmap) === draft.roadmap && (node.nodeType !== 'category' || node.id === draft.roadmapNode))
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
      const body = {
        ...draft,
        title: draft.title.trim(),
        slug: saved ? draft.slug.trim() : undefined,
        estimatedHours: optionalNumber(draft.estimatedHours),
        order: Number(draft.order),
        ...(saved ? { expectedUpdatedAt: saved.updatedAt } : {}),
      }
      const doc = await saveContent<Course>('courses', saved?.id, body, createKey)
      setSaved(doc)
      markSaved(courseDraft(doc))
      setSuccess(doc.isPublished ? 'Курс опубликован.' : 'Черновик курса сохранён. Теперь добавьте разделы и уроки в программу.')
      router.replace(`/manage/courses/${doc.id}`)
      router.refresh()
    } catch (cause) {
      setError(saveError(cause))
    } finally {
      setSaving(false)
    }
  }
  function back() {
    if (canLeave()) router.push('/manage')
  }
  return <form onSubmit={submit} className="space-y-6" aria-label={saved ? 'Редактирование курса' : 'Новый курс'}>
    <fieldset disabled={saving} className={panelClass}>
      <legend className="px-1 text-lg font-semibold">О курсе</legend>
      <div className="space-y-2"><label htmlFor="course-title" className="block text-sm font-medium">Название курса</label>
        <input id="course-title" className={inputClass} required maxLength={200} value={draft.title} onChange={(event) => change('title', event.target.value)} /></div>
      <RichTextEditor id="course-description" label="Описание курса" value={draft.description} onChange={(value) => change('description', value)} disabled={saving} />
      <MediaPicker id="course-cover" label="Обложка курса" value={draft.coverImage} onChange={(value) => change('coverImage', value)} imageOnly disabled={saving} />
    </fieldset>
    <fieldset disabled={saving} className={panelClass}>
      <legend className="px-1 text-lg font-semibold">Место в программе</legend>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2"><label htmlFor="course-roadmap" className="block text-sm font-medium">Роадмап</label>
          <select id="course-roadmap" className={inputClass} required disabled={Boolean(saved)} value={draft.roadmap ?? ''} onChange={(event) => {
            setDraft((current) => ({ ...current, roadmap: optionalNumber(event.target.value), roadmapNode: null }))
            setSuccess('')
          }}><option value="">Выберите роадмап</option>{roadmaps.map((item) => <option key={item.id} value={item.id}>{item.title}{!item.isPublished ? ' (черновик)' : ''}</option>)}</select>
          {saved && <p className="text-sm text-muted-foreground">Курс остаётся в исходном роадмапе.</p>}</div>
        <div className="space-y-2"><label htmlFor="course-node" className="block text-sm font-medium">Тема на карте</label>
          <select id="course-node" className={inputClass} value={draft.roadmapNode ?? ''} onChange={(event) => change('roadmapNode', optionalNumber(event.target.value))}>
            <option value="">Без привязки к теме</option>{selectedNodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2"><label htmlFor="course-hours" className="block text-sm font-medium">Время на курс, часов</label>
          <input id="course-hours" type="number" min="0" max="1000000" step="any" className={inputClass} value={draft.estimatedHours} onChange={(event) => change('estimatedHours', event.target.value)} /></div>
        <div className="space-y-2"><label htmlFor="course-order" className="block text-sm font-medium">Порядок в роадмапе</label>
          <input id="course-order" type="number" required min="0" max="1000000" step="1" className={inputClass} value={draft.order} onChange={(event) => change('order', event.target.value)} /></div>
      </div>
      <details className="rounded-md border border-border p-3"><summary className="cursor-pointer text-sm font-medium">Курсы, которые нужно пройти заранее</summary>
        <div className="mt-3 max-h-72 space-y-2 overflow-auto">
          {courses.filter((item) => item.id !== saved?.id).map((item) => <label key={item.id} className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={draft.prerequisites.includes(item.id)} onChange={(event) => change('prerequisites', event.target.checked ? [...draft.prerequisites, item.id] : draft.prerequisites.filter((id) => id !== item.id))} />{item.title}</label>)}
          {courses.length === 0 && <p className="text-sm text-muted-foreground">Других курсов пока нет.</p>}
        </div></details>
    </fieldset>
    <fieldset disabled={saving} className={panelClass}>
      <legend className="px-1 text-lg font-semibold">Доступ ученикам</legend>
      <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={draft.isPublished} onChange={(event) => change('isPublished', event.target.checked)} />Опубликовать курс</label>
      <p className="text-sm text-muted-foreground">{draft.isPublished ? 'После сохранения ученики увидят курс. Разделы и уроки публикуются отдельно.' : 'Черновик виден только администраторам. Можно спокойно подготовить программу.'}</p>
      {draft.isPublished && selectedRoadmap && !selectedRoadmap.isPublished && <p className="text-sm text-warning">Сначала опубликуйте роадмап, чтобы открыть курс ученикам.</p>}
      <details><summary className="cursor-pointer text-sm font-medium">Адрес страницы</summary><div className="mt-3 space-y-2">
        {saved && <><label htmlFor="course-slug" className="block text-sm">Адрес курса</label><input id="course-slug" maxLength={200} className={inputClass} required value={draft.slug} onChange={(event) => change('slug', event.target.value)} /></>}
        <p className="text-sm text-muted-foreground">{saved ? 'Изменение адреса нарушит ранее сохранённые ссылки.' : 'Адрес создастся автоматически. Его можно изменить после первого сохранения.'}</p>
      </div></details>
    </fieldset>
    <EditorActions saving={saving} dirty={dirty} published={draft.isPublished} error={error} success={success} onBack={back} backLabel="Назад к курсам" create={!saved} previewHref={saved?.isPublished ? `/courses/${saved.slug}` : undefined} />
  </form>
}
