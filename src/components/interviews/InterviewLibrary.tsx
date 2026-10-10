'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Film, Loader2, Search, Upload } from 'lucide-react'
import { RECORDING_CATEGORIES, type InterviewListDTO, type RecordingCategory } from '@/lib/interviews/types'
import { InterviewUpload } from './InterviewUpload'
import { interviewButton, interviewInput, interviewResponse } from './api'

type Filters = { direction: string; category: RecordingCategory; search: string; page: number }

export function InterviewLibrary({ initial, initialFilters }: { initial: InterviewListDTO; initialFilters: Filters }) {
  const [data, setData] = useState(initial)
  const [filters, setFilters] = useState(initialFilters)
  const [draftSearch, setDraftSearch] = useState(initialFilters.search)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState('')
  const first = useRef(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const controller = new AbortController()
    setLoading(true)
    setError('')
    const query = new URLSearchParams({ direction: filters.direction, category: filters.category, search: filters.search, page: String(filters.page) })
    void fetch(`/api/interviews?${query}`, { signal: controller.signal })
      .then(interviewResponse<InterviewListDTO>)
      .then((next) => { if (!controller.signal.aborted) { setData(next); window.history.replaceState(null, '', `/interviews?${query}`) } })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Не удалось загрузить записи.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [filters, revision])

  async function importRecordings() {
    setImporting(true)
    setError('')
    try {
      const result = await interviewResponse<{ created: number; updated: number }>(await fetch('/api/interviews/import', { method: 'POST' }))
      setNotice(`Библиотека обновлена. Добавлено записей: ${result.created}, обновлено: ${result.updated}.`)
      setRevision((value) => value + 1)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось обновить библиотеку.') }
    finally { setImporting(false) }
  }

  return <div className="mx-auto w-full max-w-6xl space-y-6 pb-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl"><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Собеседования</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">Смотрите реальные собесы, разбирайте ответы и возвращайтесь к своим записям перед следующим интервью.</p></div>
      <button type="button" disabled={!data.uploadAvailable || !data.directions.length} onClick={() => setUploadOpen(true)} className={`${interviewButton} bg-primary text-primary-foreground`}><Upload aria-hidden="true" className="h-4 w-4" />Добавить мой собес</button>
    </header>
    {!data.uploadAvailable && <p className="text-sm text-muted-foreground">Загрузка личных записей пока недоступна. Администратор должен подключить хранилище Яндекс Диска.</p>}
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Направление собеседований">{data.directions.map((direction) => <button key={direction.id} type="button" aria-pressed={filters.direction === direction.slug} className={`${interviewButton} ${filters.direction === direction.slug ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted'}`} onClick={() => setFilters({ ...filters, direction: direction.slug, page: 1 })}>{direction.title}</button>)}</div>
      <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Чьи собеседования">{(Object.keys(RECORDING_CATEGORIES) as RecordingCategory[]).map((category) => <button key={category} type="button" aria-pressed={filters.category === category} className={`${interviewButton} px-3 ${filters.category === category ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-muted'}`} onClick={() => setFilters({ ...filters, category, page: 1 })}>{RECORDING_CATEGORIES[category]}</button>)}</div>
        <form className="flex w-full gap-2 sm:max-w-xs" role="search" onSubmit={(event) => { event.preventDefault(); setFilters({ ...filters, search: draftSearch.trim(), page: 1 }) }}><label className="sr-only" htmlFor="interview-search">Поиск записей</label><input id="interview-search" type="search" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} className={interviewInput} placeholder="Найти запись" maxLength={100} /><button className={`${interviewButton} border border-border px-3`} aria-label="Найти собеседование"><Search className="h-4 w-4" aria-hidden="true" /></button></form>
      </div>
    </div>
    {filters.category === 'personal' && <p className="text-sm text-muted-foreground">Здесь только ваши записи. Другие ученики их не видят. Для готовой записи можно запустить личный разбор ответов и коммуникации.</p>}
    {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 p-4 text-sm text-destructive"><p>{error}</p><button className={`${interviewButton} border border-border text-foreground`} onClick={() => setRevision((value) => value + 1)}>Повторить</button></div>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {loading ? <div role="status" className="flex items-center gap-3 py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />Загружаем записи…</div> : !error && <section aria-label="Записи собеседований">
      <div className="mb-3 text-sm text-muted-foreground">Записей: {data.totalDocs}</div>
      {data.recordings.length === 0 ? <div className="rounded-xl border border-dashed border-border px-5 py-12"><Film aria-hidden="true" className="mb-4 h-8 w-8 text-muted-foreground" /><h2 className="text-lg font-semibold">Пока нет записей</h2><p className="mt-2 max-w-lg text-sm text-muted-foreground">{filters.search ? 'Измените поисковый запрос или выберите другое направление.' : filters.category === 'personal' ? 'Загрузите своё собеседование, чтобы пересмотреть ответы и получить разбор.' : 'Записи появятся здесь после добавления в библиотеку.'}</p></div> : <div className="divide-y divide-border border-y border-border">{data.recordings.map((recording) => <Link key={recording.id} href={`/interviews/${recording.id}`} className="group flex min-h-24 items-center gap-4 py-4 focus-visible:outline-2 focus-visible:outline-ring sm:gap-5">
        <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground sm:h-20 sm:w-32"><Film className="h-6 w-6" aria-hidden="true" /></div>
        <div className="min-w-0 flex-1"><h2 className="break-words font-semibold group-hover:underline">{recording.title}</h2>{recording.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{recording.description}</p>}<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{recording.direction.title}</span><span>{new Date(recording.createdAt).toLocaleDateString('ru-RU')}</span>{recording.status !== 'ready' && <span>{recording.status === 'uploading' ? 'Загрузка не завершена' : 'Ошибка загрузки'}</span>}{recording.isOwner && recording.analysisStatus !== 'idle' && <span>{recording.analysisStatus === 'completed' ? 'Разбор готов' : recording.analysisStatus === 'failed' ? 'Ошибка разбора' : 'Готовим разбор'}</span>}</div></div>
      </Link>)}</div>}
      {data.totalPages > 1 && <nav aria-label="Страницы записей" className="mt-5 flex items-center justify-between gap-3"><button disabled={filters.page <= 1} className={`${interviewButton} border border-border`} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Назад</button><span className="text-sm text-muted-foreground">{data.page} из {data.totalPages}</span><button disabled={filters.page >= data.totalPages} className={`${interviewButton} border border-border`} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Далее</button></nav>}
    </section>}
    {data.isAdmin && <div className="border-t border-border pt-4"><button disabled={importing} className={`${interviewButton} border border-border`} onClick={() => { void importRecordings() }}>{importing ? 'Обновляем библиотеку…' : 'Обновить записи с Яндекс Диска'}</button></div>}
    {uploadOpen && <InterviewUpload directions={data.directions} directionId={data.directions.find((direction) => direction.slug === filters.direction)?.id} onClose={() => setUploadOpen(false)} onUploaded={(recording) => { setUploadOpen(false); setFilters({ direction: recording.direction.slug, category: 'personal', search: '', page: 1 }); setDraftSearch(''); setNotice('Запись загружена и доступна в «Моих собесах».') }} />}
  </div>
}
