'use client'

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Download, FileDown, Loader2, RotateCw } from 'lucide-react'

import { SlideDeck } from '@/components/lesson/SlideDeck'
import { useNearViewport } from '@/hooks/use-near-viewport'
import { requestLoadSlot } from '@/lib/load-queue'
import { openPdf, type PdfDocument } from '@/lib/pdf-document'
import { slideKind, slideSourceUrl, type SlideItem } from '@/lib/slides'

type Props = { title: string; description?: string | null; items: SlideItem[] }
type Group =
  | { kind: 'images'; key: string; part: number; slides: SlideItem[] }
  | { kind: 'pdf' | 'file'; key: string; item: SlideItem }

const RETRY_DELAY_MS = 1500
const MIN_ASPECT = 4 / 3
const MAX_ASPECT = 21 / 9
const actionClass = 'inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring'

/** Картинки подряд листаются одной презентацией; PDF и прочие файлы показываются отдельно, в порядке списка. */
function groupItems(items: SlideItem[]): Group[] {
  const groups: Group[] = []
  let decks = 0
  for (const [index, item] of items.entries()) {
    const kind = slideKind(item.fileName)
    const key = item.id ?? `${index}`
    const last = groups.at(-1)
    if (kind !== 'image') groups.push({ kind, key, item })
    else if (last?.kind === 'images') last.slides.push(item)
    else groups.push({ kind: 'images', key, part: decks += 1, slides: [item] })
  }
  return groups
}

/** Подпись, а без неё — имя файла без расширения: «гайд на софты», а не «гайд на софты.pdf». */
function displayName(item: SlideItem, fallback: string): string {
  return item.caption?.trim() || item.fileName?.replace(/\.[a-z\d]{1,12}$/i, '').trim() || fallback
}

function retryUrl(url: string, attempt: number): string {
  return attempt ? `${url}${url.includes('?') ? '&' : '?'}retry=${attempt}` : url
}

function Failure({ text, onRetry }: { text: string; onRetry: () => void }) {
  function retry(event: MouseEvent<HTMLButtonElement>) {
    // Кнопка исчезнет вместе с сообщением. Фокус остаётся в презентации: с пустой страницы
    // следующая стрелка увела бы на соседний урок.
    event.currentTarget.closest<HTMLElement>('[data-slide-deck]')?.focus()
    onRetry()
  }
  return (
    <div role="alert" className="flex max-w-sm flex-col items-center gap-3 p-6 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      <button type="button" className={actionClass} onClick={retry}>
        <RotateCw aria-hidden="true" className="h-4 w-4" />Попробовать снова
      </button>
    </div>
  )
}

function Waiting({ text, detail }: { text: string; detail?: string | null }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
      <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" />
      <p role="status">{text}</p>
      {/* Проценты меняются десятки раз за загрузку: внутри role="status" их зачитывали бы все подряд. */}
      {detail && <span aria-hidden="true" className="tabular-nums">{detail}</span>}
    </div>
  )
}

function ImageSlide({ item, label, current, near, onSize }: {
  item: SlideItem
  label: string
  current: boolean
  near: boolean
  onSize?: (width: number, height: number) => void
}) {
  const [attempt, setAttempt] = useState(0)
  // Попытка, для которой подошла очередь: <img> появляется только после этого и только в браузере.
  // Картинка из серверной разметки успевала загрузиться до того, как React повесит onLoad,
  // и слайд навсегда оставался под надписью «Загружаем слайд…».
  const [shown, setShown] = useState<number | null>(null)
  const [result, setResult] = useState<{ attempt: number; status: 'ready' | 'failed' } | null>(null)
  const slot = useRef<(() => void) | null>(null)
  const status = result?.attempt === attempt ? result.status : 'loading'

  const free = useCallback(() => {
    slot.current?.()
    slot.current = null
  }, [])
  useEffect(() => free, [free])

  useEffect(() => {
    if (!near || status !== 'loading' || slot.current) return
    let cancel: (() => void) | null = null
    let started = false
    const ask = () => {
      cancel = requestLoadSlot(() => { started = true; setShown(attempt) }, current)
      slot.current = cancel
    }
    // Одиночный сбой хранилища обычно проходит сам — вторая попытка идёт с паузой и без участия ученика.
    const pause = attempt === 1 ? window.setTimeout(ask, RETRY_DELAY_MS) : null
    if (pause === null) ask()
    return () => {
      if (pause !== null) window.clearTimeout(pause)
      // Начатая загрузка доходит до конца и остаётся в памяти: возврат к просмотренному слайду
      // не должен ждать хранилище заново. Заявку, до которой очередь не дошла, снимаем.
      if (started || !cancel) return
      cancel()
      if (slot.current === cancel) slot.current = null
    }
  }, [attempt, current, near, status])

  function failed() {
    free()
    if (attempt === 0) {
      setShown(null)
      setAttempt(1)
    } else {
      setResult({ attempt, status: 'failed' })
    }
  }

  if (status === 'failed') return <Failure text="Слайд не загрузился." onRetry={() => setAttempt(attempt + 1)} />
  if (!near && shown !== attempt) return null
  return (
    <>
      {status === 'loading' && <Waiting text="Загружаем слайд…" />}
      {shown === attempt && (
        // eslint-disable-next-line @next/next/no-img-element -- файл отдаёт защищённый прокси урока, оптимизатор Next его не достанет
        <img
          key={attempt}
          src={retryUrl(slideSourceUrl(item.url), attempt)}
          alt={label}
          draggable={false}
          decoding="async"
          onLoad={(event) => {
            free()
            setResult({ attempt, status: 'ready' })
            onSize?.(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
          }}
          onError={failed}
          // Слайд занимает всю сцену: на весь экран небольшой скриншот иначе остался бы островком посередине.
          className={`h-full w-full object-contain ${status === 'ready' ? '' : 'opacity-0'}`}
        />
      )}
    </>
  )
}

function ImageDeck({ label, slides }: { label: string; slides: SlideItem[] }) {
  // Презентация в конце длинного урока не качает слайды, пока до неё не долистали.
  const [frame, visible] = useNearViewport<HTMLDivElement>()
  // Сцена подстраивается под первый слайд: у скриншотов одной презентации пропорции близкие,
  // а единая рамка 16:9 оставляла бы у широких слайдов пустые поля. Границы не дают ей прыгнуть в крайности.
  const [aspect, setAspect] = useState(16 / 9)
  return (
    <div ref={frame}>
      <SlideDeck label={label} count={slides.length} aspect={aspect} caption={(index) => slides[index]?.caption?.trim() || null}>
        {({ index, current, near }) => (
          <ImageSlide
            item={slides[index]}
            label={slides[index].caption?.trim() || `${label}, слайд ${index + 1}`}
            current={current}
            near={visible && near}
            onSize={index === 0 ? (width, height) => { if (width > 0 && height > 0) setAspect(Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, width / height))) } : undefined}
          />
        )}
      </SlideDeck>
    </div>
  )
}

/** Монтируется только рядом с текущей страницей: холсты десятков страниц в памяти вешают телефон. */
function PdfPage({ pdf, page, label }: { pdf: PdfDocument; page: number; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<{ attempt: number; status: 'loading' | 'ready' | 'failed' }>({ attempt: 0, status: 'loading' })
  const { attempt } = state
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    let cancelled = false
    let stop: (() => void) | undefined
    // Запас по плотности, чтобы страница оставалась чёткой и на весь экран.
    const width = Math.min(2400, Math.max(1200, Math.ceil(window.innerWidth * (window.devicePixelRatio || 1))))
    pdf.render(page, element, width)
      .then((rendering) => {
        stop = rendering.cancel
        if (cancelled) rendering.cancel()
        return rendering.done
      })
      .then(() => { if (!cancelled) setState({ attempt, status: 'ready' }) })
      .catch(() => { if (!cancelled) setState({ attempt, status: 'failed' }) })
    return () => { cancelled = true; stop?.() }
  }, [attempt, pdf, page])
  if (state.status === 'failed') {
    return <Failure text="Страница не отрисовалась." onRetry={() => setState({ attempt: attempt + 1, status: 'loading' })} />
  }
  return (
    <>
      {state.status === 'loading' && <Waiting text="Готовим страницу…" />}
      <canvas ref={canvas} role="img" aria-label={label} className={`max-h-full max-w-full ${state.status === 'ready' ? '' : 'opacity-0'}`} />
    </>
  )
}

function DownloadLink({ item, text }: { item: SlideItem; text: string }) {
  return (
    <a href={slideSourceUrl(item.url)} download={item.fileName ?? true} className={actionClass}>
      <Download aria-hidden="true" className="h-4 w-4" />{text}
    </a>
  )
}

type PdfState =
  | { key: string; status: 'loading'; share: number | null }
  | { key: string; status: 'failed' }
  | { key: string; status: 'ready'; pdf: PdfDocument; aspect: number }

function PdfDeck({ title, item }: { title: string; item: SlideItem }) {
  const [frame, visible] = useNearViewport<HTMLDivElement>()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<PdfState | null>(null)
  const source = slideSourceUrl(item.url)
  // Ответ относится и к попытке, и к файлу: после замены файла в блоке старый документ показывать нельзя.
  const key = `${attempt}:${source}`
  useEffect(() => {
    if (!visible) return
    const controller = new AbortController()
    let opened: PdfDocument | undefined
    const release = requestLoadSlot(() => {
      openPdf(retryUrl(source, attempt), controller.signal, (share) => setState({ key, status: 'loading', share }))
        .then(async (pdf) => {
          // Блок уже закрыт или запрошена новая попытка: открытый документ никому не достанется.
          if (controller.signal.aborted) { void pdf.destroy(); return }
          opened = pdf
          const size = await pdf.pageSize(1)
          if (!controller.signal.aborted) setState({ key, status: 'ready', pdf, aspect: size.width / size.height })
        })
        .catch(() => { if (!controller.signal.aborted) setState({ key, status: 'failed' }) })
        // К этому моменту release уже присвоен: openPdf асинхронный и раньше следующей микрозадачи не завершится.
        .finally(() => release())
    })
    return () => { controller.abort(); release(); void opened?.destroy() }
  }, [attempt, key, source, visible])

  const name = displayName(item, title)
  // Состояние прошлой попытки или прошлого файла к текущему не относится: до ответа показываем загрузку.
  const view: PdfState = state?.key === key ? state : { key, status: 'loading', share: null }
  return (
    <div ref={frame} data-slide-deck="" tabIndex={-1} className="outline-none">
      {view.status === 'ready'
        ? (
            <SlideDeck key={key} label={name} count={view.pdf.pages} aspect={view.aspect} pages caption={() => name} actions={<DownloadLink item={item} text="Скачать PDF" />}>
              {({ index, near }) => near ? <PdfPage pdf={view.pdf} page={index + 1} label={`${name}, страница ${index + 1}`} /> : null}
            </SlideDeck>
          )
        : (
            <div className="relative flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-6">
              {view.status === 'loading'
                ? <Waiting text={`Открываем «${name}»…`} detail={view.share === null ? null : `${Math.round(view.share * 100)}%`} />
                : <>
                    <Failure text={`Не удалось открыть «${name}». Файл можно скачать и посмотреть на устройстве.`} onRetry={() => setAttempt((value) => value + 1)} />
                    <DownloadLink item={item} text="Скачать PDF" />
                  </>}
            </div>
          )}
    </div>
  )
}

function FileCard({ item }: { item: SlideItem }) {
  return (
    <a
      href={slideSourceUrl(item.url)}
      download={item.fileName ?? true}
      className="group flex items-center gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info/10">
        <FileDown aria-hidden="true" className="h-5 w-5 text-info" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground transition-colors group-hover:text-primary">{displayName(item, 'Файл')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{item.fileName ? `${item.fileName} · скачать` : 'Скачать файл'}</p>
      </div>
    </a>
  )
}

export function SlidesBlock({ title, description, items }: Props) {
  const groups = groupItems(items)
  const decks = groups.filter((group) => group.kind === 'images').length
  return (
    <section aria-label={title} className="space-y-3">
      <div>
        <h3 className="font-semibold text-foreground">{title}</h3>
        {description && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{description}</p>}
      </div>
      {groups.length === 0 && <p className="text-sm text-muted-foreground">В этой презентации пока нет файлов.</p>}
      {groups.map((group) => group.kind === 'images'
        // Несколько листалок в одном блоке различаются по названию: иначе экранный диктор назовёт их одинаково.
        ? <ImageDeck key={group.key} label={decks > 1 ? `${title}, часть ${group.part}` : title} slides={group.slides} />
        : group.kind === 'pdf'
          ? <PdfDeck key={group.key} title={title} item={group.item} />
          : <FileCard key={group.key} item={group.item} />)}
    </section>
  )
}
