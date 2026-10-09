'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { LearningTargetCollection } from '@/lib/learning-access'
import { maximumLearningRules, type AssignmentOption, type AssignmentOptions, type AssignmentPreview, type AssignmentRule, type AssignmentSnapshot } from './contracts'
import './learning-access.scss'

const endpoint = '/api/manage/learning-access'
const targetNames: Record<LearningTargetCollection, string> = { roadmaps: 'Роадмап', 'roadmap-nodes': 'Тема роадмапа', courses: 'Курс', sections: 'Раздел курса', lessons: 'Урок', 'trainer-topics': 'Тема тренажёра', 'trainer-tasks': 'Задача тренажёра' }
const emptyOptions: AssignmentOptions = { docs: [], page: 1, hasNextPage: false }

class AssignmentRequestError extends Error {
  constructor(message: string, readonly code?: 'orphaned-assignment') { super(message) }
}

async function result<T>(response: Response): Promise<T> {
  const data = await response.json()
  if (!response.ok) throw new AssignmentRequestError(typeof data.error === 'string' ? data.error : 'Не удалось выполнить запрос. Повторите попытку', data.code === 'orphaned-assignment' ? data.code : undefined)
  return data as T
}

function useOptions(kind: 'students' | 'targets', type?: LearningTargetCollection, parentId?: number | null) {
  const [search, setSearch] = useState('')
  const filterKey = `${type ?? ''}:${parentId ?? ''}:${search}`
  const [pagination, setPagination] = useState({ filterKey, page: 1 })
  const page = pagination.filterKey === filterKey ? pagination.page : 1
  const setPage = (page: number) => setPagination({ filterKey, page })
  const requestKey = `${kind}:${type ?? ''}:${parentId ?? ''}:${search}:${page}`
  const [loaded, setLoaded] = useState({ key: '', options: emptyOptions })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const abort = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')
      const query = new URLSearchParams({ kind, search, page: String(page) })
      if (type) query.set('type', type)
      if (parentId) query.set('parent', String(parentId))
      try {
        const data = await result<AssignmentOptions>(await fetch(`${endpoint}?${query}`, { signal: abort.signal, credentials: 'same-origin' }))
        if (!abort.signal.aborted) setLoaded({ key: requestKey, options: data })
      } catch (error) {
        if (!abort.signal.aborted) { setLoaded({ key: requestKey, options: emptyOptions }); setError(error instanceof Error ? error.message : 'Не удалось загрузить список') }
      } finally { if (!abort.signal.aborted) setLoading(false) }
    }, 180)
    return () => { window.clearTimeout(timer); abort.abort() }
  }, [kind, type, parentId, search, page, requestKey])
  return { search, setSearch, page, setPage, options: loaded.key === requestKey ? loaded.options : emptyOptions, loading: loading || loaded.key !== requestKey, error }
}

function PageButtons({ page, hasNextPage, loading, setPage }: { page: number; hasNextPage: boolean; loading: boolean; setPage: (page: number) => void }) {
  return <div className="learning-access__pages"><button type="button" disabled={page === 1 || loading} onClick={() => setPage(page - 1)}>Назад</button><span>Страница {page}</span><button type="button" disabled={!hasNextPage || loading} onClick={() => setPage(page + 1)}>Далее</button></div>
}

function localDate(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function dateValue(value: string) { return value ? new Date(value).toISOString() : null }

function TargetPicker({ onAdd, disabled }: { onAdd: (type: LearningTargetCollection, target: AssignmentOption, effect: 'allow' | 'deny') => void; disabled: boolean }) {
  const [type, setType] = useState<LearningTargetCollection>('roadmaps')
  const [parentId, setParentId] = useState<number | null>(null)
  const [parentTitle, setParentTitle] = useState('')
  const [effect, setEffect] = useState<'allow' | 'deny'>('allow')
  const parentType = type === 'roadmap-nodes' || type === 'courses' ? 'roadmaps' : type === 'lessons' || type === 'sections' ? 'courses' : type === 'trainer-tasks' ? 'trainer-topics' : undefined
  const parentLabel = parentType === 'roadmaps' ? 'роадмап' : parentType === 'trainer-topics' ? 'тему тренажёра' : 'курс'
  const parents = useOptions('targets', parentType ?? 'roadmaps')
  const targets = useOptions('targets', type, parentId)
  return <section className="learning-access__picker" aria-label="Добавить назначение">
    <h2>Добавить назначение</h2>
    <div className="learning-access__fields"><label>Материал<select value={type} disabled={disabled} onChange={(event) => { setType(event.target.value as LearningTargetCollection); setParentId(null); setParentTitle('') }}>{Object.entries(targetNames).map(([value, title]) => <option value={value} key={value}>{title}</option>)}</select></label><label>Действие<select value={effect} disabled={disabled} onChange={(event) => setEffect(event.target.value as 'allow' | 'deny')}><option value="allow">Открыть доступ</option><option value="deny">Закрыть доступ</option></select></label></div>
    {parentType && <details className="learning-access__filter"><summary>Ограничить поиск: выбрать {parentLabel}</summary><label>Найти {parentLabel}<input type="search" value={parents.search} disabled={disabled} onChange={(event) => parents.setSearch(event.target.value)} /></label><select aria-label="Родительский материал" disabled={disabled} value={parentId ?? ''} onChange={(event) => { const id = event.target.value ? Number(event.target.value) : null; setParentId(id); setParentTitle(parents.options.docs.find((item) => item.id === id)?.title ?? '') }}><option value="">Все материалы</option>{parentId && !parents.options.docs.some((item) => item.id === parentId) && <option value={parentId}>{parentTitle}</option>}{parents.options.docs.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select><PageButtons page={parents.page} hasNextPage={parents.options.hasNextPage} loading={parents.loading || disabled} setPage={parents.setPage} />{parents.error && <p role="alert">{parents.error}</p>}</details>}
    <label>Поиск по названию<input type="search" value={targets.search} disabled={disabled} onChange={(event) => targets.setSearch(event.target.value)} placeholder="Например, Node.js или DevOps" /></label>
    {targets.loading && <p role="status">Загружаем материалы…</p>}
    {targets.error && <p role="alert">{targets.error}</p>}
    <ul className="learning-access__targets">{targets.options.docs.map((target) => <li key={target.id}><span>{target.title}{target.published === false && <small>Черновик — доступ появится после публикации</small>}</span><button type="button" disabled={disabled || targets.loading} onClick={() => onAdd(type, target, effect)}>{effect === 'allow' ? 'Открыть' : 'Закрыть'}</button></li>)}</ul>
    {!targets.loading && targets.options.docs.length === 0 && !targets.error && <p>Материалы не найдены. Измените поиск или родительский материал.</p>}
    <PageButtons page={targets.page} hasNextPage={targets.options.hasNextPage} loading={targets.loading} setPage={targets.setPage} />
  </section>
}

export function LearningAccessManager({ initialUserId = null }: { initialUserId?: number | null }) {
  const students = useOptions('students')
  const [userId, setUserId] = useState<number | null>(initialUserId)
  const [snapshot, setSnapshot] = useState<AssignmentSnapshot | null>(null)
  const [mode, setMode] = useState<'all' | 'assigned'>('assigned')
  const [catalogVisibility, setCatalogVisibility] = useState<AssignmentSnapshot['catalogVisibility']>('catalog')
  const [trainerMode, setTrainerMode] = useState<AssignmentSnapshot['trainerMode']>('all')
  const [rules, setRules] = useState<AssignmentRule[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [needsGrantCleanup, setNeedsGrantCleanup] = useState(false)
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  const [preview, setPreview] = useState<AssignmentPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const generation = useRef(0)
  const previewGeneration = useRef(0)
  const activeSnapshot = snapshot?.userId === userId ? snapshot : null
  const loading = userId !== null && activeSnapshot === null && error === ''
  const dirty = activeSnapshot !== null && (mode !== activeSnapshot.mode || catalogVisibility !== activeSnapshot.catalogVisibility || trainerMode !== activeSnapshot.trainerMode || JSON.stringify(rules) !== JSON.stringify(activeSnapshot.rules))
  useEffect(() => {
    generation.current += 1
    const abort = new AbortController()
    if (!userId) return
    fetch(`${endpoint}?user=${userId}`, { signal: abort.signal, credentials: 'same-origin' }).then(result<AssignmentSnapshot>).then((data) => {
      if (!abort.signal.aborted) { setSnapshot(data); setMode(data.mode); setCatalogVisibility(data.catalogVisibility); setTrainerMode(data.trainerMode); setRules(data.rules) }
    }).catch((error) => { if (!abort.signal.aborted) { setError(error instanceof Error ? error.message : 'Не удалось загрузить назначения'); setNeedsGrantCleanup(error instanceof AssignmentRequestError && error.code === 'orphaned-assignment') } })
    return () => abort.abort()
  }, [userId, reload])
  useEffect(() => {
    if (!dirty) return
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])
  function changeRules(next: AssignmentRule[]) { setRules(next); setPreview(null); previewGeneration.current += 1; setNotice('') }
  function changeVisibility(next: AssignmentSnapshot['catalogVisibility']) { setCatalogVisibility(next); setPreview(null); previewGeneration.current += 1; setNotice('') }
  function changeTrainerMode(next: AssignmentSnapshot['trainerMode']) { setTrainerMode(next); setPreview(null); previewGeneration.current += 1; setNotice('') }
  function changeMode(next: 'all' | 'assigned') { setMode(next); setPreview(null); previewGeneration.current += 1; setNotice('') }
  function refresh() { setSnapshot(null); setPreview(null); setError(''); setNeedsGrantCleanup(false); setNotice(''); setReload(reload + 1) }
  function selectStudent(id: number) { setUserId(id); setSnapshot(null); setPreview(null); setError(''); setNeedsGrantCleanup(false); setNotice('') }
  async function submit(save: boolean, page = 1, trainerPage = 1) {
    if (!snapshot) return
    const currentGeneration = generation.current
    const currentPreviewGeneration = previewGeneration.current
    setError(''); setNeedsGrantCleanup(false); setNotice('')
    if (save) setSaving(true); else setPreviewLoading(true)
    try {
      const response = await fetch(`${endpoint}?page=${page}&trainerPage=${trainerPage}`, { method: save ? 'PUT' : 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: snapshot.userId, revision: snapshot.revision, mode, catalogVisibility, trainerMode, rules }) })
      if (save) {
        const next = await result<AssignmentSnapshot>(response)
        if (currentGeneration === generation.current) { setSnapshot(next); setMode(next.mode); setCatalogVisibility(next.catalogVisibility); setTrainerMode(next.trainerMode); setRules(next.rules); setNotice('Назначения сохранены. Новые запросы ученика используют этот доступ.') }
      } else {
        const next = await result<AssignmentPreview>(response)
        if (currentGeneration === generation.current && currentPreviewGeneration === previewGeneration.current) setPreview(next)
      }
    } catch (error) { if (currentGeneration === generation.current) { setError(error instanceof Error ? error.message : 'Не удалось сохранить назначения'); setNeedsGrantCleanup(error instanceof AssignmentRequestError && error.code === 'orphaned-assignment') } }
    finally { if (save) setSaving(false); else setPreviewLoading(false) }
  }
  function add(type: LearningTargetCollection, target: AssignmentOption, effect: 'allow' | 'deny') {
    if (rules.some((rule) => rule.target.relationTo === type && rule.target.value === target.id)) { setError('Для этого материала уже есть назначение. Измените действие в списке ниже.'); return }
    if (rules.length >= maximumLearningRules) { setError(`Можно сохранить не более ${maximumLearningRules} назначений. Назначьте роадмап, курс или тему тренажёра целиком.`); return }
    setError(''); changeRules([...rules, { target: { relationTo: type, value: target.id }, title: target.title, effect, startsAt: null, expiresAt: null, note: '' }])
  }
  function update(index: number, fields: Partial<AssignmentRule>) { changeRules(rules.map((rule, position) => position === index ? { ...rule, ...fields } : rule)) }
  return <div className="learning-access">
    <header><h1>Доступ к обучению</h1><p>Назначьте ученику целое направление или отдельные материалы. Выберите, какие материалы ученик сможет видеть и проходить, и отдельно настройте тренажёр.</p></header>
    <div className="learning-access__layout"><aside aria-label="Выбор ученика"><h2>Ученик</h2><label>Имя или email<input type="search" value={students.search} disabled={saving || dirty} onChange={(event) => students.setSearch(event.target.value)} /></label>{dirty && <p className="learning-access__hint">Сохраните изменения или нажмите «Отменить изменения», чтобы выбрать другого ученика.</p>}{students.loading && <p role="status">Ищем учеников…</p>}{students.error && <p role="alert">{students.error}</p>}<ul className="learning-access__students">{students.options.docs.map((student) => <li key={student.id}><button type="button" aria-pressed={student.id === userId} disabled={saving || dirty} onClick={() => selectStudent(student.id)}>{student.title}</button></li>)}</ul><PageButtons page={students.page} hasNextPage={students.options.hasNextPage} loading={students.loading || dirty || saving} setPage={students.setPage} /></aside>
      <main>{loading && <p role="status">Загружаем назначения…</p>}{!userId && <p className="learning-access__empty">Выберите ученика, которому хотите открыть обучение.</p>}{error && <div role="alert" className="learning-access__error"><p>{error}</p>{needsGrantCleanup && <p><Link href={`/admin/collections/learning-access-grants?where[user][equals]=${userId}`}>Открыть список назначений</Link></p>}{dirty && <p>Повторная загрузка заменит несохранённые изменения сохранёнными назначениями.</p>}{userId && <button type="button" disabled={saving} onClick={refresh}>Обновить назначения</button>}</div>}{notice && <p role="status" className="learning-access__notice">{notice}</p>}
        {activeSnapshot && <><h2>{activeSnapshot.student.title}</h2><fieldset disabled={saving}><legend>Доступ к курсам и урокам</legend><label className="learning-access__radio"><input type="radio" name="access-mode" checked={mode === 'assigned'} onChange={() => changeMode('assigned')} /><span><strong>Только назначенные материалы</strong><small>Без назначения курс и урок закрыты. Откройте нужный роадмап, тему или курс ниже.</small></span></label><label className="learning-access__radio"><input type="radio" name="access-mode" checked={mode === 'all'} onChange={() => changeMode('all')} /><span><strong>Все опубликованные материалы</strong><small>Отдельные назначения «Закрыть» ограничивают доступ.</small></span></label></fieldset>
          <fieldset disabled={saving}><legend>Что ученик видит в каталоге</legend><label className="learning-access__radio"><input type="radio" name="catalog-visibility" checked={catalogVisibility === 'catalog'} onChange={() => changeVisibility('catalog')} /><span><strong>Показывать все программы</strong><small>Названия и программы закрытых курсов видны, но проходить их нельзя.</small></span></label><label className="learning-access__radio"><input type="radio" name="catalog-visibility" checked={catalogVisibility === 'assigned'} onChange={() => changeVisibility('assigned')} /><span><strong>Показывать только назначенное</strong><small>Неназначенные курсы, темы и уроки скрыты, в том числе из поиска и по прямой ссылке.</small></span></label></fieldset>
          <fieldset disabled={saving}><legend>Доступ к тренажёру</legend><label className="learning-access__radio"><input type="radio" name="trainer-mode" checked={trainerMode === 'assigned'} onChange={() => changeTrainerMode('assigned')} /><span><strong>Только назначенные задачи</strong><small>Откройте тему тренажёра или отдельную задачу в назначениях ниже.</small></span></label><label className="learning-access__radio"><input type="radio" name="trainer-mode" checked={trainerMode === 'all'} onChange={() => changeTrainerMode('all')} /><span><strong>Весь опубликованный тренажёр</strong><small>Доступны все задачи опубликованных тем, кроме отдельных запрещённых назначений.</small></span></label><label className="learning-access__radio"><input type="radio" name="trainer-mode" checked={trainerMode === 'disabled'} onChange={() => changeTrainerMode('disabled')} /><span><strong>Тренажёр выключен</strong><small>Ни одна задача не доступна. Сохранённые назначения не действуют до включения тренажёра.</small></span></label></fieldset>
          <details className="learning-access__explanation"><summary>Как работают наследование и исключения</summary><p>Роадмап открывает его курсы и уроки, включая новые опубликованные материалы. Тема открывает связанные с ней курсы. Курс открывает разделы и уроки, раздел — свои уроки.</p><p>Более точное назначение имеет приоритет: урок, раздел, курс, тема, роадмап. Поэтому можно закрыть целый курс и открыть один урок или открыть роадмап и закрыть отдельный курс. В тренажёре задача имеет приоритет над темой; выключенный тренажёр закрывает все задачи независимо от назначений. Черновики остаются закрыты. Когда срок правила заканчивается, снова действует родительское назначение или режим по умолчанию.</p></details>
          <TargetPicker onAdd={add} disabled={saving} />
          <section aria-label="Список назначений"><h2>Назначения <span className="learning-access__count">{rules.length}</span></h2>{rules.length === 0 && <p>Назначений пока нет. Доступ определяется настройками выше. Добавьте разрешения или исключения.</p>}<ol className="learning-access__rules">{rules.map((rule, index) => <li key={`${rule.target.relationTo}:${rule.target.value}`}><div className="learning-access__rule-heading"><div><small>{targetNames[rule.target.relationTo]}</small><h3>{rule.title ?? `Материал ${rule.target.value}`}</h3></div><button type="button" disabled={saving} onClick={() => changeRules(rules.filter((_, position) => position !== index))} aria-label={`Удалить назначение ${rule.title ?? rule.target.value}`}>Удалить</button></div><div className="learning-access__fields"><label>Действие<select value={rule.effect} disabled={saving} onChange={(event) => update(index, { effect: event.target.value as 'allow' | 'deny' })}><option value="allow">Открыть доступ</option><option value="deny">Закрыть доступ</option></select></label><label>Начало доступа<input type="datetime-local" value={localDate(rule.startsAt)} disabled={saving} onChange={(event) => update(index, { startsAt: dateValue(event.target.value) })} /></label><label>Окончание доступа<input type="datetime-local" value={localDate(rule.expiresAt)} disabled={saving} onChange={(event) => update(index, { expiresAt: dateValue(event.target.value) })} /></label></div><label>Комментарий для администратора<input value={rule.note} maxLength={1000} disabled={saving} onChange={(event) => update(index, { note: event.target.value })} /></label></li>)}</ol></section>
          <section className="learning-access__preview" aria-label="Предварительный просмотр доступа"><h2>Что сможет открыть ученик</h2><p>Проверьте курсы и задачи тренажёра с текущими изменениями до сохранения. Сроки назначений учитываются на текущий момент. Частичный доступ означает, что в курсе есть отдельные открытые или закрытые разделы и уроки.</p><button type="button" disabled={saving || previewLoading} onClick={() => void submit(false)}>{previewLoading ? 'Проверяем доступ…' : 'Посмотреть доступ по курсам'}</button>{preview && <><p>Доступны {preview.availableCount} из {preview.totalCount} опубликованных курсов.</p><ul>{preview.courses.map((course) => <li key={course.id}><span>{course.title}</span><strong data-access={course.access}>{course.visible === false ? 'Скрыт' : course.access === 'full' ? 'Открыт' : course.access === 'partial' ? 'Открыт частично' : 'Закрыт'}</strong></li>)}</ul>{preview.hiddenCount > 0 && <p>Скрыты {preview.hiddenCount} неназначенных курсов.</p>}<PageButtons page={preview.page} hasNextPage={preview.hasNextPage} loading={previewLoading} setPage={(page) => void submit(false, page, preview.trainer?.page ?? 1)} />{preview.trainer && <div className="learning-access__trainer-preview"><h3>Тренажёр</h3><p>Доступны {preview.trainer.availableCount} из {preview.trainer.totalCount} опубликованных задач.</p><ul>{preview.trainer.tasks.map((task) => <li key={task.id}><span>{task.title}</span><strong data-access={task.access}>{task.visible === false ? 'Скрыта' : task.access === 'open' ? 'Доступна' : 'Закрыта'}</strong></li>)}</ul><PageButtons page={preview.trainer.page} hasNextPage={preview.trainer.hasNextPage} loading={previewLoading} setPage={(page) => void submit(false, preview.page, page)} /></div>}</>}</section>
          <footer className="learning-access__save"><span>{dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}</span><button type="button" disabled={!dirty || saving} onClick={() => { changeMode(activeSnapshot.mode); changeVisibility(activeSnapshot.catalogVisibility); changeTrainerMode(activeSnapshot.trainerMode); changeRules(activeSnapshot.rules); setError('') }}>Отменить изменения</button><button type="button" className="learning-access__primary" disabled={!dirty || saving} onClick={() => void submit(true)}>{saving ? 'Сохраняем…' : 'Сохранить назначения'}</button></footer>
        </>}
      </main>
    </div>
  </div>
}
