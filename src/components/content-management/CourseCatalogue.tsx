import Link from 'next/link'
import type { Course, Roadmap, RoadmapNode } from '@/payload-types'
import { relationId } from '@/lib/content-management/pages'
import { managementLink, managementPrimary, PublicationStatus } from '@/components/content-management/ManagementHeading'

export function CourseCatalogue({ courses, roadmaps, nodes, roadmapId, nodeId, query = '' }: {
  courses: Course[]
  roadmaps: Roadmap[]
  nodes?: RoadmapNode[]
  roadmapId?: number
  nodeId?: number
  query?: string
}) {
  const needle = query.trim().toLocaleLowerCase('ru')
  const filtered = courses.filter((course) => (!nodeId || relationId(course.roadmapNode) === nodeId) && (!needle || course.title.toLocaleLowerCase('ru').includes(needle)))
  const roadmapTitles = new Map(roadmaps.map((roadmap) => [roadmap.id, roadmap.title]))
  const newUrl = `/manage/courses/new${roadmapId ? `?roadmap=${roadmapId}${nodeId ? `&node=${nodeId}` : ''}` : ''}`

  return (
    <section aria-label="Курсы для редактирования" className="space-y-4">
      <form className="flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor="course-search" className="text-sm font-medium">Найти курс</label>
          <input id="course-search" name="q" type="search" defaultValue={query} placeholder="Название курса" className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring" />
        </div>
        {nodes && (
          <div className="min-w-0 space-y-1 sm:w-64">
            <label htmlFor="course-topic" className="text-sm font-medium">Тема карты</label>
            <select id="course-topic" name="node" defaultValue={nodeId ?? ''} className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring">
              <option value="">Все темы</option>
              {nodes.filter((node) => node.nodeType === 'topic' || node.nodeType === 'subtopic').map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}
            </select>
          </div>
        )}
        <button className={managementLink} type="submit">Найти</button>
      </form>

      {filtered.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {filtered.map((course) => (
            <li key={course.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1 space-y-2">
                <Link href={`/manage/courses/${course.id}`} className="break-words font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-ring">{course.title}</Link>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <PublicationStatus published={course.isPublished === true} />
                  <span>{roadmapTitles.get(relationId(course.roadmap) ?? 0)}</span>
                </div>
              </div>
              <Link href={`/manage/courses/${course.id}`} className={managementLink} aria-label={`Программа курса «${course.title}»`}>Программа и уроки</Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-6">
          <h2 className="font-semibold">{query || nodeId ? 'Курсы не найдены' : 'Добавьте первый курс'}</h2>
          <p className="mb-4 mt-2 text-sm text-muted-foreground">{query || nodeId ? 'Измените поиск или создайте курс для этой темы.' : 'Сначала задайте название и описание, затем соберите разделы и уроки.'}</p>
          <Link href={newUrl} className={managementPrimary}>Добавить курс</Link>
        </div>
      )}
    </section>
  )
}
