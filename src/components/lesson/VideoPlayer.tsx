'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, Play, Clock, Loader2, RotateCw } from 'lucide-react'

import { useVideoMemory } from '@/hooks/use-video-memory'
import { MEDIA_SOURCE_HEADER } from '@/lib/media-source-status'
import { parsePublicResourceUrl } from '@/lib/yandex-disk-url'
import { TransportStreamPlayer } from './TransportStreamPlayer'
import { VideoMemoryBar } from './VideoMemoryBar'
import { VideoShareButton } from './VideoShareButton'

type Props = {
  memoryId?: string
  title: string
  videoUrl: string
  displayMode: 'embed' | 'link'
  description?: string | null
  durationMinutes?: number | null
}

/**
 * Определяет sandbox-политику в зависимости от источника видео.
 * YouTube не требует allow-same-origin.
 */
function getSandboxPolicy(url: string): string {
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return 'allow-scripts allow-popups'
  }
  return 'allow-scripts allow-same-origin allow-popups'
}

function getEmbedUrl(url: string): string {
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/,
  )
  if (ytMatch) {
    return `https://www.youtube.com/embed/${ytMatch[1]}`
  }

  return url
}

/** Ссылка на файл Яндекс.Диска, которую наш сервер превращает в прямой поток. */
function getStreamUrl(videoUrl: string): string {
  return `/api/yandex-disk/stream?url=${encodeURIComponent(videoUrl)}`
}

/** Новый адрес попытки не даёт браузеру переиспользовать сломанный media resource. */
function playbackUrl(url: string, attempt: number): string {
  return attempt === 0 ? url : `${url}${url.includes('?') ? '&' : '?'}playbackAttempt=${attempt}`
}

/** Прокси нужен только там, где плеер читает файл из JS. */
function getProxyUrl(videoUrl: string): string {
  if (isRecordingSource(videoUrl)) return videoUrl
  if (isLessonSource(videoUrl)) return videoUrl.replace('/stream?', '/proxy?')
  return `/api/yandex-disk/proxy?url=${encodeURIComponent(videoUrl)}`
}

function isLessonSource(videoUrl: string): boolean {
  return videoUrl.startsWith('/api/yandex-disk/stream?')
}

function isRecordingSource(videoUrl: string): boolean {
  return /^\/api\/interviews\/[1-9]\d*\/stream(?:\?[^#]*)?$/.test(videoUrl)
}

/** Файлы медиатеки воспроизводятся непосредственно, без iframe стороннего сервиса. */
function isMediaFile(videoUrl: string): boolean {
  try {
    const url = new URL(videoUrl, 'https://local.invalid')
    return ['https:', 'http:'].includes(url.protocol) && url.pathname.startsWith('/api/media/file/')
  } catch {
    return false
  }
}

/**
 * Записи в контейнере MPEG-TS браузер нативно не проигрывает — их разбирает
 * отдельный плеер. Расширение .ts у видео библиотеки означает именно поток,
 * исходники TypeScript в видео-блок не попадают.
 */
function isTransportStream(videoUrl: string): boolean {
  if (isLessonSource(videoUrl)) return new URL(videoUrl, 'https://local.invalid').searchParams.get('format') === 'ts'
  const path = parsePublicResourceUrl(videoUrl)?.path ?? videoUrl
  return /\.ts$/i.test(path)
}

/**
 * Как проигрывать видео.
 *
 * Записи Диска браузер читает через авторизованный серверный поток: ученик получает готовый
 * адрес потока, администратор — исходную ссылку, но байты идут одним путём, и отказ у обоих
 * разбирает LessonVideo. Файлы медиатеки играют нативно, сторонние сервисы — в iframe.
 */
export function VideoPlayer({ memoryId, title, videoUrl, displayMode, description, durationMinutes }: Props) {
  const [mediaFailed, setMediaFailed] = useState(false)
  const handleMediaFailure = useCallback(() => setMediaFailed(true), [])

  if (isLessonSource(videoUrl) || isRecordingSource(videoUrl)) {
    return <LessonVideo memoryId={memoryId} key={videoUrl} title={title} videoUrl={videoUrl} description={description} durationMinutes={durationMinutes} />
  }

  if (displayMode === 'link') {
    return (
      <VideoLinkCard
        title={title}
        videoUrl={videoUrl}
        description={description}
        durationMinutes={durationMinutes}
      />
    )
  }

  // Страницы Диска не встраиваются в iframe; источник остаётся за проверкой доступа LMS.
  if (parsePublicResourceUrl(videoUrl) !== null) {
    return <LessonVideo memoryId={memoryId} key={videoUrl} title={title} videoUrl={videoUrl} description={description} durationMinutes={durationMinutes} />
  }

  if (isMediaFile(videoUrl)) {
    if (mediaFailed) {
      return <VideoLinkCard title={title} videoUrl={videoUrl} description={description} durationMinutes={durationMinutes} />
    }

    return (
      <div className="space-y-3">
        <VideoHeading title={title} description={description} durationMinutes={durationMinutes} />
        <NativeVideo memoryId={memoryId} key={videoUrl} videoUrl={videoUrl} direct onFailure={handleMediaFailure} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <VideoHeading title={title} description={description} durationMinutes={durationMinutes} />
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border">
        <iframe
          src={getEmbedUrl(videoUrl)}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="autoplay; fullscreen; encrypted-media"
          allowFullScreen
          sandbox={getSandboxPolicy(videoUrl)}
        />
      </div>
    </div>
  )
}

/** Паузы перед автоматическими повторами: обрыв сети, занятый слот потока и таймаут хранилища проходят за секунды. */
const RETRY_DELAYS_MS = [2000, 5000]
/** Сбои, между которыми прошло больше этого, — разные происшествия: счёт повторов начинается заново. */
const RETRY_WINDOW_MS = 120_000
/** Сервер сам обрывает ожидание хранилища через 15 секунд; дольше ждать ответа на проверку незачем. */
const CHECK_TIMEOUT_MS = 20_000
/** Пакеты MPEG-TS идут по 188 байт и начинаются с 0x47; для уверенности смотрим два подряд. */
const TS_PACKET_BYTES = 188
const HEAD_BYTES = TS_PACKET_BYTES * 2
/** HTMLMediaElement.error.code: обрыв загрузки после успешного начала. */
const MEDIA_ERR_NETWORK = 2

type SourceCheck = 'transport-stream' | 'playable' | 'unavailable'
type FailureHint = 'network' | 'unsupported'
/** Что сервер знает о файле на Диске: без пометки причина отказа неизвестна. */
type DiskFault = 'unavailable' | 'missing' | null

function diskFault(response: Response): DiskFault {
  const status = response.headers.get(MEDIA_SOURCE_HEADER)
  if (status === 'missing') return 'missing'
  return status === 'unavailable' || status === 'degraded' ? 'unavailable' : null
}

/**
 * Ошибка плеера не говорит, что случилось: сервер не отдал файл или браузер не понял формат.
 * Короткий запрос начала файла это различает — от ответа зависит, повторять, менять плеер или объяснять.
 */
async function checkLessonSource(url: string, signal: AbortSignal): Promise<{ check: SourceCheck; disk: DiskFault }> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  const timer = setTimeout(abort, CHECK_TIMEOUT_MS)
  try {
    const response = await fetch(url, { headers: { Range: `bytes=0-${HEAD_BYTES - 1}` }, credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
    const disk = diskFault(response)
    const reader = response.ok ? response.body?.getReader() : undefined
    if (!reader) return { check: 'unavailable', disk }
    // Читаем только начало: если Range проигнорирован, остальной файл в память не попадает.
    const head = new Uint8Array(HEAD_BYTES)
    let length = 0
    while (length < HEAD_BYTES) {
      const chunk = await reader.read()
      if (chunk.done) break
      const part = chunk.value.subarray(0, HEAD_BYTES - length)
      head.set(part, length)
      length += part.byteLength
    }
    if (length === 0) return { check: 'unavailable', disk }
    const declaredLength = Number(response.headers.get('content-length'))
    if (declaredLength > 0 && length < Math.min(declaredLength, HEAD_BYTES)) return { check: 'unavailable', disk }
    return { check: length === HEAD_BYTES && head[0] === 0x47 && head[TS_PACKET_BYTES] === 0x47 ? 'transport-stream' : 'playable', disk }
  } catch {
    return { check: 'unavailable', disk: null }
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
    // Ответ больше не нужен: соединение не должно держать слот потока ученика.
    controller.abort()
  }
}

type LessonPlayback = 'native' | 'stream' | 'retrying' | 'unavailable' | 'disk-unavailable' | 'disk-missing' | 'playback-failed' | 'unsupported'

function LessonVideo({ memoryId, title, videoUrl, description, durationMinutes }: Omit<Props, 'displayMode'>) {
  const initial: 'native' | 'stream' = isTransportStream(videoUrl) ? 'stream' : 'native'
  const [mode, setMode] = useState<LessonPlayback>(initial)
  const [attempt, setAttempt] = useState(0)
  const player = useRef<'native' | 'stream'>(initial)
  const tries = useRef(0)
  const formatTries = useRef(0)
  const lastFailure = useRef(0)
  // Хоть одна проверка в серии повторов застала отказ Диска: сообщение называет его, а не интернет ученика.
  const diskFailed = useRef(false)
  const pending = useRef<{ controller: AbortController; timer?: ReturnType<typeof setTimeout> } | null>(null)
  // Перезапуск после сбоя продолжает просмотр, если ученик смотрел: иначе каждый сбой Диска оставлял видео на паузе.
  const [resumePlaying, setResumePlaying] = useState(false)
  // У ученика адрес потока уже готов, исходник скрыт; у администратора в блоке лежит ссылка на Диск.
  const recording = isRecordingSource(videoUrl)
  const protectedSource = isLessonSource(videoUrl) || recording
  const streamUrl = protectedSource ? videoUrl : getStreamUrl(videoUrl)
  const proxyUrl = getProxyUrl(videoUrl)
  const isMedia = protectedSource && new URL(videoUrl, 'https://local.invalid').searchParams.get('source') === 'media'

  const cancelPending = useCallback(() => {
    pending.current?.controller.abort()
    if (pending.current?.timer) clearTimeout(pending.current.timer)
    pending.current = null
  }, [])
  useEffect(() => cancelPending, [cancelPending])

  const start = useCallback((next: 'native' | 'stream') => {
    player.current = next
    setAttempt((value) => value + 1)
    setMode(next)
  }, [])

  const handleFailure = useCallback(async (failed: 'native' | 'stream', hint?: FailureHint, playing?: boolean) => {
    cancelPending()
    if (playing !== undefined) setResumePlaying(playing)
    if (hint === 'unsupported') { setMode('unsupported'); return }
    if (Date.now() - lastFailure.current > RETRY_WINDOW_MS) { tries.current = 0; formatTries.current = 0; diskFailed.current = false }
    lastFailure.current = Date.now()
    const controller = new AbortController()
    pending.current = { controller }
    // Пока идёт проверка, вместо сломанного плеера показываем состояние ожидания.
    setMode('retrying')
    const { check, disk } = await checkLessonSource(failed === 'stream' ? proxyUrl : streamUrl, controller.signal)
    if (controller.signal.aborted) return
    // Часть потоков MPEG-TS лежит под именем .mp4: нативный плеер их не понимает, потоковый — да.
    if (failed === 'native' && check === 'transport-stream' && !isMedia) { start('stream'); return }
    // Файла по этому пути на Диске нет: повтор ничего не изменит.
    if (disk === 'missing') { setMode('disk-missing'); return }
    if (disk) diskFailed.current = true
    // Доступное начало файла не доказывает доступность остальных Range или поддержку кодеков.
    // Повторяем и такой отказ, но не называем его несовместимостью браузера.
    const formatSuspected = check !== 'unavailable' && hint !== 'network' && !disk
    const counter = formatSuspected ? formatTries : tries
    const delay = (formatSuspected ? RETRY_DELAYS_MS.slice(0, 1) : RETRY_DELAYS_MS)[counter.current]
    if (delay === undefined) { setMode(formatSuspected ? 'playback-failed' : diskFailed.current ? 'disk-unavailable' : 'unavailable'); return }
    counter.current += 1
    pending.current = { controller, timer: setTimeout(() => { if (!controller.signal.aborted) start(failed) }, delay) }
  }, [cancelPending, isMedia, proxyUrl, start, streamUrl])

  const handleNativeFailure = useCallback((code?: number, playing?: boolean) => {
    void handleFailure('native', code === MEDIA_ERR_NETWORK ? 'network' : undefined, playing)
  }, [handleFailure])
  const handleStreamFailure = useCallback((reason?: FailureHint, playing?: boolean) => { void handleFailure('stream', reason, playing) }, [handleFailure])
  const retry = useCallback(() => {
    cancelPending()
    tries.current = 0
    formatTries.current = 0
    diskFailed.current = false
    start(player.current)
  }, [cancelPending, start])

  const actions = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <button
        type="button"
        onClick={retry}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <RotateCw aria-hidden="true" className="h-4 w-4" />
        Попробовать снова
      </button>
      {!protectedSource && (
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          Открыть на Яндекс Диске
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
        </a>
      )}
    </div>
  )

  return (
    <div className="space-y-3">
      {!recording && <VideoHeading title={title} description={description} durationMinutes={durationMinutes} />}
      {mode === 'retrying' ? (
        <div role="status" className="flex aspect-video w-full items-center justify-center gap-3 rounded-xl border border-border bg-card p-6 text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
          Видео не открылось, пробуем ещё раз…
        </div>
      ) : mode === 'unavailable' ? (
        <div role="alert" className="space-y-3 rounded-xl border border-border bg-card p-6">
          <p className="font-medium text-foreground">Видео сейчас не загружается</p>
          <p className="text-sm text-muted-foreground">
            {recording
              ? 'Хранилище записей не отдало этот файл. Попробуйте ещё раз через несколько минут. Если ошибка сохраняется, сообщите название записи в поддержку.'
              : 'Видео не загрузилось. Попробуйте ещё раз через несколько минут. Если не поможет, проверьте подключение к интернету. Текст, файлы и заметки урока доступны.'}
          </p>
          {actions}
        </div>
      ) : mode === 'disk-unavailable' ? (
        <div role="alert" className="space-y-3 rounded-xl border border-border bg-card p-6">
          <p className="font-medium text-foreground">{recording ? 'Запись временно недоступна' : 'Видео временно недоступно'} на стороне Яндекс Диска</p>
          <p className="text-sm text-muted-foreground">
            {recording ? 'Запись хранится' : 'Видео хранится'} на Яндекс Диске, а Диск сейчас не отдаёт этот файл. Это сбой у Яндекса, обычно он проходит сам. Попробуйте позже.{recording ? '' : ' Текст, файлы и заметки урока доступны.'}
          </p>
          {actions}
        </div>
      ) : mode === 'disk-missing' ? (
        <div role="alert" className="space-y-3 rounded-xl border border-border bg-card p-6">
          <p className="font-medium text-foreground">{recording ? 'Запись не найдена' : 'Видео не найдено'} на Яндекс Диске</p>
          <p className="text-sm text-muted-foreground">
            Файл удалили или переместили на Диске. Сообщите название {recording ? 'записи' : 'урока'} в поддержку.{recording ? '' : ' Текст, файлы и заметки урока доступны.'}
          </p>
          {actions}
        </div>
      ) : mode === 'unsupported' ? (
        <div role="alert" className="space-y-3 rounded-xl border border-border bg-card p-6">
          <p className="font-medium text-foreground">Запись не воспроизводится</p>
          <p className="text-sm text-muted-foreground">
            Этот браузер не может воспроизвести запись. Откройте {recording ? 'запись' : 'урок'} в актуальной версии Chrome, Edge или Яндекс Браузера на компьютере. Если запись раньше открывалась, попробуйте ещё раз.
          </p>
          {actions}
        </div>
      ) : mode === 'playback-failed' ? (
        <div role="alert" className="space-y-3 rounded-xl border border-border bg-card p-6">
          <p className="font-medium text-foreground">Не удалось воспроизвести запись</p>
          <p className="text-sm text-muted-foreground">
            Начало файла доступно, но воспроизведение не запустилось. Повторите загрузку. Если ошибка сохраняется, сообщите название {recording ? 'записи' : 'урока'} в поддержку - нужно проверить запись и её загрузку.
          </p>
          {actions}
        </div>
      ) : mode === 'stream' ? (
        <TransportStreamPlayer
          key={attempt}
          src={playbackUrl(proxyUrl, attempt)}
          memoryKey={memoryId ?? videoUrl}
          durationMinutes={durationMinutes}
          resumePlaying={resumePlaying}
          onFailure={handleStreamFailure}
        />
      ) : (
        <NativeVideo key={attempt} memoryId={memoryId} videoUrl={videoUrl} playbackAttempt={attempt} direct={protectedSource} label={recording ? `Собеседование: ${title}` : undefined} resumePlaying={resumePlaying} onFailure={handleNativeFailure} />
      )}
    </div>
  )
}

function NativeVideo({ memoryId, videoUrl, playbackAttempt = 0, direct = false, label, resumePlaying = false, onFailure }: { memoryId?: string; videoUrl: string; playbackAttempt?: number; direct?: boolean; label?: string; resumePlaying?: boolean; onFailure: (code?: number, playing?: boolean) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const memory = useVideoMemory(videoRef, memoryId ?? videoUrl)
  const source = playbackUrl(direct ? videoUrl : getStreamUrl(videoUrl), playbackAttempt)
  // Намерение ученика, а не состояние элемента: перезапущенный плеер ещё на паузе, пока грузится.
  const wantsPlay = useRef(resumePlaying)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    // Также восстанавливает src после пробного cleanup в React StrictMode.
    if (video.getAttribute('src') !== source) video.setAttribute('src', source)
    const failed = () => onFailure(video.error?.code, wantsPlay.current)
    const played = () => { wantsPlay.current = true }
    const stopped = () => { wantsPlay.current = false }
    video.addEventListener('error', failed)
    video.addEventListener('play', played)
    video.addEventListener('pause', stopped)
    video.addEventListener('ended', stopped)
    // Позицию возвращает useVideoMemory по loadedmetadata, до первого кадра, поэтому play() можно звать сразу.
    // Отказ автозапуска оставляет видео на паузе на нужной секунде: это и есть запасной вариант.
    if (wantsPlay.current && video.paused) void video.play().catch(() => undefined)
    return () => {
      video.removeEventListener('error', failed)
      video.removeEventListener('play', played)
      video.removeEventListener('pause', stopped)
      video.removeEventListener('ended', stopped)
      // Удаление DOM-узла само по себе не гарантирует отмену загрузки и освобождение слота.
      video.removeAttribute('src')
      video.load()
    }
  }, [source, onFailure])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    const conserveData = connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '')
    const canObserve = typeof IntersectionObserver !== 'undefined'
    let nearViewport = !canObserve
    let warmed = false
    let disposed = false
    let observer: IntersectionObserver | undefined
    const warm = () => {
      if (disposed || warmed || !nearViewport || document.visibilityState === 'hidden') return
      // A background tab can still intersect its viewport. Only prepare the
      // active tab, without interrupting playback when it later loses focus.
      warmed = true
      video.preload = conserveData || !canObserve ? 'metadata' : 'auto'
      observer?.disconnect()
      document.removeEventListener('visibilitychange', warm)
    }
    document.addEventListener('visibilitychange', warm)
    if (canObserve) {
      observer = new IntersectionObserver((entries) => {
        nearViewport = entries.at(-1)?.isIntersecting ?? false
        warm()
      }, { rootMargin: '200px' })
      observer.observe(video)
    } else warm()
    return () => {
      disposed = true
      observer?.disconnect()
      document.removeEventListener('visibilitychange', warm)
    }
  }, [])

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-black">
        <video
          ref={videoRef}
          src={source}
          className="aspect-video w-full"
          aria-label={label}
          controls
          preload="none"
          controlsList="nodownload"
          disableRemotePlayback
          playsInline
          onContextMenu={(event) => event.preventDefault()}
        />
      </div>
      <VideoMemoryBar {...memory} />
      <VideoShareButton videoRef={videoRef} videoId={memoryId ?? videoUrl} />
    </>
  )
}

function VideoHeading({
  title,
  description,
  durationMinutes,
}: Pick<Props, 'title' | 'description' | 'durationMinutes'>) {
  return (
    <>
      <div className="flex items-center gap-3">
        <h3 className="font-semibold text-foreground">{title}</h3>
        {durationMinutes && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {durationMinutes} мин
          </span>
        )}
      </div>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </>
  )
}

function VideoLinkCard({
  title,
  videoUrl,
  description,
  durationMinutes,
}: Pick<Props, 'title' | 'videoUrl' | 'description' | 'durationMinutes'>) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-info/10">
          <Play className="h-6 w-6 text-info" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-foreground">{title}</h3>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          {durationMinutes && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {durationMinutes} мин
            </p>
          )}
        </div>
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Смотреть
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  )
}
