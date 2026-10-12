'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, FileText, Trash2 } from 'lucide-react'

import { useNearViewport } from '@/hooks/use-near-viewport'
import { contentKey } from '@/lib/content-management/keys'
import { requestLoadSlot } from '@/lib/load-queue'
import { isInSlideFolder, mediaFileUrl, slideFileName, slideKind, slideSourceUrl, slideUrlProblem, SLIDES_LIMIT } from '@/lib/slides'
import type { Lesson, Media } from '@/payload-types'

type Block = Extract<NonNullable<Lesson['content']>[number], { blockType: 'slides' }>
type Item = NonNullable<Block['items']>[number]
type FolderFile = { url: string; fileName: string }
type Notice = { place: 'folder' | 'link' | 'upload'; tone: 'info' | 'error'; text: string }

const fieldClass = 'mt-1 min-h-[44px] w-full rounded border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50'
const buttonClass = 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded border px-3 py-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50'
const KIND_LABELS = { image: 'слайд', pdf: 'PDF, листается постранично', file: 'файл для скачивания' }
const UPLOAD_TYPES = 'image/png,image/jpeg,image/gif,image/webp,application/pdf'
const OFFICE_DECK = /\.(?:pptx?|ppsx?|odp|key)$/i
const SAVE_HINT = 'Сохраните урок, чтобы изменения увидели ученики.'

function Preview({ url, image }: { url: string; image: boolean }) {
  const [frame, near] = useNearViewport<HTMLSpanElement>('200px 0px')
  const [source, setSource] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const release = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (!near || !image) return
    // Миниатюры идут через ту же очередь, что и слайды урока: список из сорока картинок
    // иначе получил бы отказы прокси вместо изображений.
    const free = requestLoadSlot(() => setSource(slideSourceUrl(url)))
    release.current = free
    return () => { free(); release.current = null }
  }, [image, near, url])
  const done = (broken: boolean) => { release.current?.(); release.current = null; if (broken) setFailed(true) }
  return <span ref={frame} className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted text-muted-foreground">
    {/* eslint-disable-next-line @next/next/no-img-element -- файл отдаёт защищённый прокси урока */}
    {image && source && !failed ? <img src={source} alt="" className="h-full w-full object-cover" onLoad={() => done(false)} onError={() => done(true)} />
      : failed ? <span className="px-1 text-center text-[11px] leading-tight">не загрузился</span> : <FileText aria-hidden="true" size={18} />}
  </span>
}

function isFolderFiles(value: unknown): value is { files: FolderFile[] } {
  return Boolean(value) && typeof value === 'object' && value !== null && 'files' in value && Array.isArray(value.files)
    && value.files.every((file: unknown) => Boolean(file) && typeof file === 'object' && file !== null
      && 'url' in file && typeof file.url === 'string' && 'fileName' in file && typeof file.fileName === 'string')
}

function plural(count: number, one: string, few: string, many: string): string {
  const tail = count % 100
  if (tail >= 11 && tail <= 14) return many
  return count % 10 === 1 ? one : count % 10 >= 2 && count % 10 <= 4 ? few : many
}

function Message({ notice, place }: { notice: Notice | null; place: Notice['place'] }) {
  if (notice?.place !== place) return null
  return <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`rounded p-3 text-sm ${notice.tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground'}`}>{notice.text}</p>
}

/** Редактор презентации: список файлов можно собрать из папки Диска, по ссылкам или загрузкой с компьютера. */
export function SlidesEditor({ id, block, disabled, onChange }: {
  id: string
  block: Block
  disabled: boolean
  onChange: (patch: Partial<Block>) => void
}) {
  const items: Item[] = block.items ?? []
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState<'folder' | 'upload' | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [previews, setPreviews] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  // Чтение папки и загрузка файлов идут секунды. Список за это время могли поменять — в этом
  // или в соседнем блоке урока, — поэтому после ожидания берём свежие данные, а не снимок на момент клика.
  const latest = useRef({ items, onChange })
  useEffect(() => { latest.current = { items, onChange } })
  // Блок могли удалить из урока, пока шла загрузка: его изменение досталось бы материалу,
  // занявшему то же место в списке.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const locked = disabled || busy !== null
  const setItems = (next: Item[]) => onChange({ items: next })

  function move(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= items.length) return
    const next = [...items]
    const moved = next[index]
    next[index] = next[target]
    next[target] = moved
    setItems(next)
  }

  async function fillFromFolder() {
    const url = block.folderUrl?.trim()
    if (!url) { setNotice({ place: 'folder', tone: 'error', text: 'Вставьте ссылку на папку Яндекс Диска.' }); return }
    setBusy('folder')
    setNotice(null)
    try {
      const response = await fetch('/api/manage/slides-folder', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
      })
      // Ответ не в JSON — это страница ошибки прокси или входа, а не обрыв связи.
      const result: unknown = await response.json().catch(() => null)
      if (!mounted.current) return
      if (!response.ok || !isFolderFiles(result)) {
        const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
          ? result.error
          : `Сервер не смог прочитать папку (код ${response.status}). Список не изменён, повторите попытку.`
        setNotice({ place: 'folder', tone: 'error', text: message })
        return
      }
      const current = latest.current.items
      const known = new Map(current.map((item) => [item.url, item]))
      const listed = new Set(result.files.map((file) => file.url))
      // Папка задаёт состав и порядок только своих файлов. Ссылки на другие файлы Диска
      // и загруженное в медиатеку добавлены вручную — их обновление не трогает.
      const manual = current.filter((item) => !listed.has(item.url) && !isInSlideFolder(item.url, url))
      const removed = current.filter((item) => !listed.has(item.url) && isInSlideFolder(item.url, url)).length
      const added = result.files.filter((file) => !known.has(file.url)).length
      const next = [
        ...result.files.map((file): Item => ({ id: known.get(file.url)?.id ?? contentKey(), url: file.url, fileName: file.fileName, caption: known.get(file.url)?.caption ?? null })),
        ...manual,
      ]
      if (next.length > SLIDES_LIMIT) {
        setNotice({ place: 'folder', tone: 'error', text: `Вместе с добавленными вручную получится ${next.length} ${plural(next.length, 'файл', 'файла', 'файлов')}, а в одной презентации их не более ${SLIDES_LIMIT}. Список не изменён.` })
        return
      }
      latest.current.onChange({ items: next })
      setNotice({
        place: 'folder',
        tone: 'info',
        text: [
          `В папке ${result.files.length} ${plural(result.files.length, 'файл', 'файла', 'файлов')}: добавлено ${added}, убрано ${removed}.`,
          manual.length ? `Добавленные вручную (${manual.length}) остались в конце списка.` : '',
          SAVE_HINT,
        ].filter(Boolean).join(' '),
      })
    } catch {
      setNotice({ place: 'folder', tone: 'error', text: 'Нет соединения с сервером. Список не изменён, повторите попытку.' })
    } finally {
      setBusy(null)
    }
  }

  function addLink() {
    const url = link.trim()
    if (!url) return
    const problem = slideUrlProblem(url)
    if (problem) { setNotice({ place: 'link', tone: 'error', text: `Ссылка не подходит: ${problem}.` }); return }
    if (items.some((item) => item.url === url)) { setNotice({ place: 'link', tone: 'error', text: 'Этот файл уже есть в списке.' }); return }
    if (items.length >= SLIDES_LIMIT) { setNotice({ place: 'link', tone: 'error', text: `В одной презентации не более ${SLIDES_LIMIT} файлов.` }); return }
    setItems([...items, { id: contentKey(), url, fileName: slideFileName(url), caption: null }])
    setLink('')
    setNotice(null)
  }

  async function upload(files: File[]) {
    setBusy('upload')
    setNotice(null)
    const room = Math.max(0, SLIDES_LIMIT - latest.current.items.length)
    const accepted = files.slice(0, room)
    const added: Item[] = []
    const failed: string[] = []
    setProgress({ done: 0, total: accepted.length })
    for (const [index, file] of accepted.entries()) {
      const data = new FormData()
      data.append('file', file)
      data.append('_payload', JSON.stringify({ alt: '' }))
      try {
        const response = await fetch('/api/media', { method: 'POST', credentials: 'include', body: data })
        const result = response.ok ? await response.json() as { doc?: Media } : null
        const filename = result?.doc?.filename
        if (filename) added.push({ id: contentKey(), url: mediaFileUrl(filename), fileName: filename, caption: null })
        else failed.push(file.name)
      } catch {
        failed.push(file.name)
      }
      setProgress({ done: index + 1, total: accepted.length })
    }
    if (!mounted.current) return
    if (added.length) latest.current.onChange({ items: [...latest.current.items, ...added] })
    const skipped = files.length - accepted.length
    setNotice({
      place: 'upload',
      tone: failed.length || skipped ? 'error' : 'info',
      text: [
        `Загружено файлов: ${added.length}.`,
        failed.length ? `Не загрузилось: ${failed.length} (${failed.join(', ')}) — проверьте формат (картинка или PDF), размер и соединение.` : '',
        skipped ? `Не поместилось в лимит ${SLIDES_LIMIT}: ${skipped}.` : '',
        added.length ? SAVE_HINT : '',
      ].filter(Boolean).join(' '),
    })
    setProgress(null)
    setBusy(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  return <>
    <label className="block text-sm font-medium">Название презентации *<input value={block.title ?? ''} disabled={disabled} required maxLength={200} className={fieldClass} onChange={(event) => onChange({ title: event.target.value })} /></label>
    <label className="block text-sm font-medium">Описание<textarea className={fieldClass} rows={2} value={block.description ?? ''} disabled={disabled} onChange={(event) => onChange({ description: event.target.value })} /></label>
    <div className="space-y-2 rounded border border-dashed p-3">
      <label htmlFor={`${id}-folder`} className="block text-sm font-medium">Папка на Яндекс Диске</label>
      <div className="flex flex-wrap items-center gap-2">
        <input id={`${id}-folder`} value={block.folderUrl ?? ''} disabled={locked} placeholder="https://disk.yandex.ru/d/…" className={`${fieldClass} mt-0 min-w-0 flex-1 basis-64`} onChange={(event) => onChange({ folderUrl: event.target.value })} />
        <button type="button" className={buttonClass} disabled={locked} onClick={() => void fillFromFolder()}>{busy === 'folder' ? 'Читаем папку…' : items.length ? 'Обновить список из папки' : 'Заполнить из папки'}</button>
      </div>
      <Message notice={notice} place="folder" />
      <p className="text-sm text-muted-foreground">Файлы папки встанут по порядку имён: картинки листаются как слайды, PDF — постранично. Презентацию PowerPoint или Keynote сохраните как PDF, иначе ученик сможет её только скачать. Поменяли файлы на Диске — нажмите «Обновить список из папки» и сохраните урок: исчезнувшие из папки файлы уйдут из списка, а добавленные вручную останутся. Подпапки и видео не учитываются.</p>
    </div>
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Файлы презентации: {items.length}</p>
        {items.length > 0 && <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={previews} onChange={(event) => setPreviews(event.target.checked)} />Показывать миниатюры</label>}
      </div>
      {!items.length && <p className="rounded border border-dashed p-4 text-sm text-muted-foreground">Файлов пока нет. Заполните список из папки, добавьте ссылку или загрузите файлы.</p>}
      <ol className="space-y-2">
        {items.map((item, index) => {
          const fileName = item.fileName || slideFileName(item.url)
          const kind = slideKind(fileName)
          return <li key={item.id ?? index} className="flex flex-wrap items-center gap-2 rounded border bg-background p-2">
            <span className="w-8 shrink-0 text-center text-sm tabular-nums text-muted-foreground">{index + 1}</span>
            {previews && <Preview url={item.url} image={kind === 'image'} />}
            <div className="min-w-0 flex-1 basis-56">
              <a href={slideSourceUrl(item.url)} target="_blank" rel="noopener noreferrer" title={fileName ?? undefined} className="block truncate text-sm font-medium underline-offset-2 hover:underline">{fileName || 'Файл по ссылке Диска'}</a>
              <p className="text-xs text-muted-foreground">{fileName && OFFICE_DECK.test(fileName) ? 'скачивается файлом — чтобы листалась на сайте, сохраните её как PDF' : KIND_LABELS[kind]}</p>
            </div>
            <input aria-label={`Подпись файла ${index + 1}`} placeholder="Подпись (необязательно)" maxLength={300} value={item.caption ?? ''} disabled={locked} className={`${fieldClass} mt-0 min-w-0 flex-1 basis-56`} onChange={(event) => setItems(items.map((current, position) => position === index ? { ...current, caption: event.target.value } : current))} />
            <div className="flex gap-2">
              <button type="button" disabled={locked || index === 0} className={buttonClass} aria-label={`Поднять файл ${index + 1}`} onClick={() => move(index, -1)}><ArrowUp aria-hidden="true" size={16} /></button>
              <button type="button" disabled={locked || index === items.length - 1} className={buttonClass} aria-label={`Опустить файл ${index + 1}`} onClick={() => move(index, 1)}><ArrowDown aria-hidden="true" size={16} /></button>
              <button type="button" disabled={locked} className={`${buttonClass} text-destructive`} aria-label={`Убрать файл ${index + 1}`} onClick={() => setItems(items.filter((_, position) => position !== index))}><Trash2 aria-hidden="true" size={16} /></button>
            </div>
          </li>
        })}
      </ol>
    </div>
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 basis-64 text-sm font-medium">Добавить файл по ссылке<input value={link} disabled={locked} placeholder="Ссылка на файл на Яндекс Диске" className={fieldClass} onChange={(event) => setLink(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addLink() } }} /></label>
        <button type="button" className={buttonClass} disabled={locked || !link.trim()} onClick={addLink}>Добавить ссылку</button>
      </div>
      <Message notice={notice} place="link" />
    </div>
    <div className="space-y-2">
      <label htmlFor={`${id}-upload`} className="block text-sm font-medium">Загрузить картинки или PDF с компьютера</label>
      <input ref={fileInput} id={`${id}-upload`} type="file" multiple accept={UPLOAD_TYPES} disabled={locked} className="block w-full text-sm file:mr-3 file:rounded file:border file:bg-background file:px-3 file:py-2 file:text-foreground" onChange={(event) => { const files = [...event.target.files ?? []]; if (files.length) void upload(files) }} />
      <p className="text-sm text-muted-foreground">Загруженные файлы хранятся на платформе и открываются быстрее, чем с Диска.</p>
      {busy === 'upload' && <p role="status" className="text-sm">Загружаем файлы{progress ? `: ${progress.done} из ${progress.total}` : ''}…</p>}
      <Message notice={notice} place="upload" />
    </div>
  </>
}

export function freshSlides(): Block {
  return { id: contentKey(), blockType: 'slides', title: '', folderUrl: '', items: [] }
}
