'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AssignmentRule } from './contracts'
import { result } from './request'
import { apiFetch } from '@/lib/http-client'
import { evaluateAccess, isOrdinaryCourse, isSpecialRule, toggleAccess, type AccessCatalog, type AccessMode, type AccessState, type CatalogCourse, type CatalogLesson, type CatalogRoadmap, type CatalogSection, type TreeTarget } from '@/lib/learning-access-edit'

const endpoint = '/api/manage/learning-access'
const stateNames: Record<AccessState, string> = { full: 'Открыт', partial: 'Частично', closed: 'Закрыт' }

type Pending = { target: TreeTarget; want: 'full' | 'closed'; special: AssignmentRule[] }

function Mark({ title, state, disabled, onToggle }: { title: string; state: AccessState; disabled: boolean; onToggle: () => void }) {
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => { if (box.current) box.current.indeterminate = state === 'partial' }, [state])
  return <label className="access-tree__mark"><input ref={box} type="checkbox" checked={state === 'full'} disabled={disabled} onChange={onToggle} /><span>{title}</span></label>
}

function Row({ title, state, disabled, expanded, onExpand, onToggle, onClose, closable = state === 'partial', note, children }: { title: string; state: AccessState; disabled: boolean; expanded?: boolean; onExpand?: () => void; onToggle: () => void; onClose: () => void; closable?: boolean; note?: ReactNode; children?: ReactNode }) {
  return <li>
    <div className="access-tree__row" data-state={state}>
      {onExpand ? <button type="button" className="access-tree__expand" aria-expanded={expanded} aria-label={`${expanded ? 'Свернуть' : 'Раскрыть'}: ${title}`} onClick={onExpand}>{expanded ? '-' : '+'}</button> : <span className="access-tree__spacer" />}
      <Mark title={title} state={state} disabled={disabled} onToggle={onToggle} />
      <span className="access-tree__side">{note}<strong data-state={state}>{stateNames[state]}</strong>{closable && <button type="button" disabled={disabled} aria-label={`Закрыть целиком: ${title}`} onClick={onClose}>Закрыть</button>}</span>
    </div>
    {children}
  </li>
}

type Props = { rules: AssignmentRule[]; mode: AccessMode; knownLessons: readonly CatalogLesson[]; disabled: boolean; onChange: (rules: AssignmentRule[]) => void }

/** Каталог грузится один раз, уроки - при раскрытии курса: в самых больших курсах их больше сотни. */
export function AccessTree({ rules, mode, knownLessons, disabled, onChange }: Props) {
  const [catalog, setCatalog] = useState<AccessCatalog | null>(null)
  const [catalogError, setCatalogError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [courseLessons, setCourseLessons] = useState<ReadonlyMap<number, CatalogLesson[]>>(new Map())
  const [lessonErrors, setLessonErrors] = useState<ReadonlyMap<number, string>>(new Map())
  const [pending, setPending] = useState<Pending | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const abort = new AbortController()
    apiFetch(`${endpoint}?kind=catalog`, { signal: abort.signal, credentials: 'same-origin' }).then(result<AccessCatalog>)
      .then((data) => { if (!abort.signal.aborted) setCatalog(data) })
      .catch((error) => { if (!abort.signal.aborted) setCatalogError(error instanceof Error ? error.message : 'Не удалось загрузить каталог') })
    return () => abort.abort()
  }, [attempt])

  const lessons = useMemo(() => {
    const known = new Map<number, CatalogLesson>()
    for (const lesson of knownLessons) known.set(lesson.id, lesson)
    for (const list of courseLessons.values()) for (const lesson of list) known.set(lesson.id, lesson)
    return [...known.values()]
  }, [knownLessons, courseLessons])
  const evaluator = useMemo(() => catalog ? evaluateAccess({ catalog, lessons, rules, mode }) : null, [catalog, lessons, rules, mode])

  if (catalogError) return <section className="access-tree" aria-label="Дерево доступа"><div role="alert" className="learning-access__error"><p>{catalogError}</p><button type="button" onClick={() => { setCatalogError(''); setAttempt(attempt + 1) }}>Загрузить снова</button></div></section>
  if (!catalog || !evaluator) return <section className="access-tree" aria-label="Дерево доступа"><p role="status">Загружаем каталог…</p></section>

  const loadedCatalog = catalog
  const access = evaluator
  function loadLessons(courseId: number) {
    if (courseLessons.has(courseId)) return
    setLessonErrors((current) => { const next = new Map(current); next.delete(courseId); return next })
    apiFetch(`${endpoint}?kind=lessons&course=${courseId}`, { credentials: 'same-origin' }).then(result<{ docs: CatalogLesson[] }>)
      .then((data) => setCourseLessons((current) => new Map(current).set(courseId, data.docs)))
      .catch((error) => setLessonErrors((current) => new Map(current).set(courseId, error instanceof Error ? error.message : 'Не удалось загрузить уроки')))
  }
  function flip(key: string) {
    setExpanded((current) => { const next = new Set(current); if (!next.delete(key)) next.add(key); return next })
  }
  function apply(target: TreeTarget, want: 'full' | 'closed', confirmed = false) {
    const outcome = toggleAccess({ catalog: loadedCatalog, lessons, rules, mode }, target, want, confirmed)
    setMessage('')
    setPending(null)
    if (outcome.status === 'changed') onChange(outcome.rules)
    else if (outcome.status === 'confirm') setPending({ target, want, special: outcome.special })
    else setMessage(outcome.reason)
  }
  const toggle = (target: TreeTarget, state: AccessState) => apply(target, state === 'full' ? 'closed' : 'full')
  const specialNote = (relationTo: TreeTarget['relationTo'], value: number) => {
    const own = rules.find((rule) => rule.target.relationTo === relationTo && rule.target.value === value)
    return own && isSpecialRule(own) ? <small>Срок или комментарий</small> : null
  }

  const query = search.trim().toLowerCase()
  const matches = (title: string) => title.toLowerCase().includes(query)
  const published = new Set(loadedCatalog.roadmaps.filter((roadmap) => roadmap.isPublished).map((roadmap) => roadmap.id))
  const ordinary = loadedCatalog.courses.filter((course) => isOrdinaryCourse(course) && published.has(course.roadmap))
  const openCount = ordinary.filter((course) => access.course(course.id) !== 'closed').length

  function lessonRow(lesson: CatalogLesson, parentAvailable: boolean) {
    const target: TreeTarget = { relationTo: 'lessons', value: lesson.id, title: lesson.title }
    const state = access.lesson(lesson)
    return <Row key={`l${lesson.id}`} title={lesson.title} state={state} disabled={disabled || !parentAvailable || !lesson.isPublished} onToggle={() => toggle(target, state)} onClose={() => apply(target, 'closed')} note={<>{!lesson.isPublished && <small>Черновик</small>}{specialNote('lessons', lesson.id)}</>} />
  }

  function sectionRow(section: CatalogSection, courseAvailable: boolean) {
    const key = `s${section.id}`
    const target: TreeTarget = { relationTo: 'sections', value: section.id, title: section.title }
    const state = access.section(section.id)
    const available = courseAvailable && section.isPublished
    const open = expanded.has(key)
    const own = (courseLessons.get(section.course) ?? []).filter((lesson) => lesson.section === section.id)
    const failure = lessonErrors.get(section.course)
    return <Row key={key} title={section.title} state={state} disabled={disabled || !available} expanded={open} onExpand={() => { flip(key); loadLessons(section.course) }} onToggle={() => toggle(target, state)} onClose={() => apply(target, 'closed')} note={<>{!section.isPublished && <small>Черновик</small>}{specialNote('sections', section.id)}</>}>
      {open && <ul>{courseLessons.has(section.course) ? own.map((lesson) => lessonRow(lesson, available)) : failure ? <li role="alert">{failure} <button type="button" onClick={() => loadLessons(section.course)}>Повторить</button></li> : <li role="status">Загружаем уроки…</li>}</ul>}
    </Row>
  }

  function courseRow(course: CatalogCourse, roadmapAvailable: boolean) {
    const key = `c${course.id}`
    const target: TreeTarget = { relationTo: 'courses', value: course.id, title: course.title }
    const state = access.course(course.id)
    const available = roadmapAvailable && course.isPublished
    const open = expanded.has(key)
    const sections = loadedCatalog.sections.filter((section) => section.course === course.id)
    const loose = (courseLessons.get(course.id) ?? []).filter((lesson) => lesson.section === null)
    const failure = lessonErrors.get(course.id)
    // Буткемп назначается только целиком: его разделы и уроки отклонит сервер.
    const expand = course.isBootcamp ? undefined : () => { flip(key); loadLessons(course.id) }
    return <Row key={key} title={course.title} state={state} disabled={disabled || !available} expanded={open} onExpand={expand} onToggle={() => toggle(target, state)} onClose={() => apply(target, 'closed')} note={<>{!course.isPublished && <small>Черновик</small>}{course.isBootcamp ? <small>Буткемп, только целиком</small> : course.assignedOnly && <small>Только по назначению</small>}{specialNote('courses', course.id)}</>}>
      {open && !course.isBootcamp && <ul>
        {sections.map((section) => sectionRow(section, available))}
        {loose.map((lesson) => lessonRow(lesson, available))}
        {failure && <li role="alert">{failure} <button type="button" onClick={() => loadLessons(course.id)}>Повторить</button></li>}
        {!failure && !courseLessons.has(course.id) && <li role="status">Загружаем уроки…</li>}
        {courseLessons.has(course.id) && sections.length === 0 && loose.length === 0 && <li>В курсе пока нет уроков.</li>}
      </ul>}
    </Row>
  }

  function roadmapRow(roadmap: CatalogRoadmap) {
    const key = `r${roadmap.id}`
    const target: TreeTarget = { relationTo: 'roadmaps', value: roadmap.id, title: roadmap.title }
    const state = access.roadmap(roadmap.id)
    const all = loadedCatalog.courses.filter((course) => course.roadmap === roadmap.id)
    const visible = !query || matches(roadmap.title) ? all : all.filter((course) => matches(course.title))
    if (query && !visible.length && !matches(roadmap.title)) return null
    const own = all.filter(isOrdinaryCourse)
    const closedTypes = all.filter((course) => course.isPublished && !isOrdinaryCourse(course)).length
    const open = expanded.has(key) || Boolean(query)
    // Тема показана заголовком: курс входит в неё полем курса либо полем самой темы.
    const groups = new Map<number | null, CatalogCourse[]>()
    const nodeOf = (course: CatalogCourse) => course.roadmapNode ?? loadedCatalog.nodes.find((node) => node.course === course.id)?.id ?? null
    for (const node of loadedCatalog.nodes) if (node.roadmap === roadmap.id) groups.set(node.id, [])
    groups.set(null, [])
    for (const course of visible) {
      const nodeId = nodeOf(course)
      const list = groups.get(nodeId) ?? groups.get(null)
      list?.push(course)
    }
    const heading = (id: number | null) => id === null ? 'Без темы' : loadedCatalog.nodes.find((node) => node.id === id)?.label ?? 'Без темы'
    return <Row key={key} title={roadmap.title} state={state} disabled={disabled || !roadmap.isPublished || own.length === 0} expanded={open} onExpand={() => flip(key)} onToggle={() => toggle(target, state)} onClose={() => apply(target, 'closed')} closable={state === 'partial' && access.ordinaryRoadmap(roadmap.id) !== 'closed'} note={<>{!roadmap.isPublished && <small>Черновик</small>}<small>Курсов открыто: {own.filter((course) => access.course(course.id) !== 'closed').length} из {own.length}</small>{closedTypes > 0 && <small>Закрытых курсов отдельно: {closedTypes}</small>}{specialNote('roadmaps', roadmap.id)}</>}>
      {open && <div className="access-tree__groups">{[...groups].filter(([, list]) => list.length).map(([id, list]) => <div key={id ?? 'none'}><h4>{heading(id)}</h4><ul>{list.map((course) => courseRow(course, roadmap.isPublished))}</ul></div>)}</div>}
    </Row>
  }

  return <section className="access-tree" aria-label="Дерево доступа">
    <h2>Что открыть ученику</h2>
    <p>Отметьте роадмап целиком, отдельные курсы, разделы или уроки. Снятая отметка внутри открытого материала становится исключением. Изменения вступают в силу после сохранения.</p>
    <label>Поиск по роадмапам и курсам<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Например, React или System Design" /></label>
    <p className="access-tree__summary">Открыто обычных курсов: {openCount} из {ordinary.length}</p>
    {message && <p role="alert" className="learning-access__error">{message}</p>}
    {pending && <div role="alert" className="learning-access__error"><p>Для этого действия придётся удалить правила со сроком, комментарием или темой с закрытым курсом:</p><ul>{pending.special.map((rule) => <li key={`${rule.target.relationTo}:${rule.target.value}`}>{rule.title ?? `Материал ${rule.target.value}`}</li>)}</ul><div className="access-tree__actions"><button type="button" disabled={disabled} onClick={() => apply(pending.target, pending.want, true)}>Удалить правила и продолжить</button><button type="button" onClick={() => setPending(null)}>Отмена</button></div></div>}
    <ul className="access-tree__root">{loadedCatalog.roadmaps.map(roadmapRow)}</ul>
  </section>
}
