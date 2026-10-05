'use client'

import { useEffect, useRef, useState } from 'react'

import type { Media } from '@/payload-types'

type MediaPage = { docs: Media[]; totalPages: number; totalDocs: number }
const buttonClass = 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded border px-3 py-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50'

export function MediaPicker({ value, onChange, label, id, imageOnly = false, disabled = false }: {
  value: number | null | undefined
  onChange: (value: number | null) => void
  label: string
  id: string
  imageOnly?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<{ key: string; data: MediaPage; error: string } | null>(null)
  const [selected, setSelected] = useState<Media | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [alt, setAlt] = useState('')
  const [reload, setReload] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!value) return
    const controller = new AbortController()
    fetch(`/api/media/${value}?depth=0`, { credentials: 'include', signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<Media> })
      .then((file) => { setSelected(file); setError('') })
      .catch(() => { if (!controller.signal.aborted) setError('Не удалось получить выбранный файл. Его связь сохранена; повторите загрузку списка.') })
    return () => controller.abort()
  }, [value])
  const requestKey = JSON.stringify([page, query, imageOnly, reload])
  const loading = open && result?.key !== requestKey
  const catalog = result?.data ?? { docs: [], totalPages: 1, totalDocs: 0 }
  const catalogError = result?.key === requestKey ? result.error : ''
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const params = new URLSearchParams({ depth: '0', limit: '12', page: String(page), sort: '-createdAt' })
    if (query) params.set('where[filename][contains]', query)
    if (imageOnly) params.set('where[mimeType][contains]', 'image/')
    fetch(`/api/media?${params}`, { credentials: 'include', signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<MediaPage> })
      .then((data) => setResult({ key: requestKey, data, error: '' }))
      .catch(() => { if (!controller.signal.aborted) setResult({ key: requestKey, data: { docs: [], totalPages: 1, totalDocs: 0 }, error: 'Не удалось загрузить файлы. Проверьте соединение и повторите.' }) })
    return () => controller.abort()
  }, [open, page, query, imageOnly, requestKey])

  async function upload(file: File) {
    setUploadError('')
    if (imageOnly && !file.type.startsWith('image/')) { setUploadError('Выберите изображение.'); return }
    setUploading(true)
    const data = new FormData()
    data.append('file', file)
    data.append('_payload', JSON.stringify({ alt: alt.trim() }))
    try {
      const response = await fetch('/api/media', { method: 'POST', credentials: 'include', body: data })
      if (!response.ok) throw new Error()
      const result = await response.json() as { doc: Media }
      if (!result.doc?.id || (imageOnly && !result.doc.mimeType?.startsWith('image/'))) throw new Error()
      setSelected(result.doc)
      onChange(result.doc.id)
      setOpen(false)
      setAlt('')
    } catch {
      setUploadError('Не удалось загрузить файл. Проверьте формат и размер файла, затем повторите.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return <div className="space-y-2">
    <p id={`${id}-label`} className="text-sm font-medium">{label}</p>
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-0 break-all text-sm text-muted-foreground">{value ? (selected?.id === value ? selected.filename : '') || `Выбран файл №${value}` : 'Файл не выбран'}</span>
      <button id={id} type="button" disabled={disabled || uploading} aria-expanded={open} aria-controls={`${id}-browser`} className={buttonClass} onClick={() => setOpen(!open)}>{value ? 'Заменить файл' : 'Выбрать или загрузить'}</button>
      {Boolean(value) && <button type="button" disabled={disabled || uploading} className={buttonClass} onClick={() => onChange(null)}>Убрать файл</button>}
    </div>
    {error && !open && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {open && <div id={`${id}-browser`} aria-labelledby={`${id}-label`} className="space-y-4 rounded border bg-card p-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-sm">Поиск по имени файла<input className="mt-1 w-full rounded border bg-background px-3 py-2" value={search} disabled={disabled || uploading} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); setPage(1); setQuery(search.trim()); setReload((current) => current + 1) } }} /></label>
        <button type="button" disabled={disabled || uploading} className={buttonClass} onClick={() => { setPage(1); setQuery(search.trim()); setReload((current) => current + 1) }}>Найти</button>
      </div>
      {catalogError && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{catalogError}</p><button type="button" className={buttonClass} disabled={disabled} onClick={() => setReload((current) => current + 1)}>Повторить загрузку</button></div>}
      {loading ? <p role="status" className="text-sm text-muted-foreground">Загружаем файлы…</p> : !catalogError && <>
        <div className="grid gap-2 sm:grid-cols-2">
          {catalog.docs.map((file) => <button key={file.id} type="button" disabled={disabled || uploading} className={`${buttonClass} min-w-0 text-left`} onClick={() => { setSelected(file); onChange(file.id); setOpen(false) }}><span className="block break-all font-medium">{file.filename || `Файл №${file.id}`}</span><span className="text-xs text-muted-foreground">{file.alt || file.mimeType || 'Материал курса'}</span></button>)}
        </div>
        {!catalog.docs.length && <p className="text-sm text-muted-foreground">Файлы не найдены. Измените поиск или загрузите материал.</p>}
        <div className="flex flex-wrap items-center gap-3 text-sm"><button type="button" disabled={disabled || uploading || page <= 1} className={buttonClass} onClick={() => setPage(page - 1)}>Предыдущие файлы</button><span aria-live="polite">Страница {page} из {Math.max(1, catalog.totalPages)}</span><button type="button" disabled={disabled || uploading || page >= catalog.totalPages} className={buttonClass} onClick={() => setPage(page + 1)}>Следующие файлы</button></div>
      </>}
      <div className="space-y-2 border-t pt-3">
        <label className="block text-sm">Описание файла для доступности<input className="mt-1 w-full rounded border bg-background px-3 py-2" value={alt} disabled={disabled || uploading} onChange={(event) => setAlt(event.target.value)} /></label>
        <label htmlFor={`${id}-upload`} className="block text-sm font-medium">Загрузить новый {imageOnly ? 'рисунок' : 'файл'}</label>
        <input ref={fileRef} id={`${id}-upload`} type="file" accept={imageOnly ? 'image/*' : 'image/*,application/pdf,video/*,application/zip'} disabled={disabled || uploading} className="block w-full text-sm file:mr-3 file:rounded file:border file:bg-background file:px-3 file:py-2 file:text-foreground" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file) }} />
        {uploading && <p role="status" className="text-sm">Загружаем файл…</p>}
        {uploadError && <p role="alert" className="text-sm text-destructive">{uploadError}</p>}
      </div>
    </div>}
  </div>
}
