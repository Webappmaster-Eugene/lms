'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { MAX_RECORDING_BYTES, type InterviewDirectionDTO, type InterviewRecordingDTO } from '@/lib/interviews/types'
import { InterviewDialog } from './InterviewDialog'
import { interviewButton, interviewInput, interviewResponse } from './api'

export function InterviewUpload({ directions, directionId, onClose, onUploaded }: { directions: InterviewDirectionDTO[]; directionId?: number; onClose: () => void; onUploaded: (recording: InterviewRecordingDTO) => void }) {
  const [direction, setDirection] = useState(String(directionId ?? directions[0]?.id ?? ''))
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [stage, setStage] = useState<'idle' | 'sending' | 'checking'>('idle')
  const [progress, setProgress] = useState(0)
  const controller = useRef<AbortController | null>(null)
  const xhr = useRef<XMLHttpRequest | null>(null)
  const createdId = useRef<number | null>(null)
  const cleanup = useRef<Promise<boolean> | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; controller.current?.abort(); xhr.current?.abort() }
  }, [])

  async function removeIncomplete() {
    if (cleanup.current) return cleanup.current
    const id = createdId.current
    if (id === null) return true
    const operation = fetch(`/api/interviews/${id}`, { method: 'DELETE' }).then(interviewResponse).then(() => {
      if (createdId.current === id) createdId.current = null
      return true
    }).catch(() => {
      if (mounted.current) setError('Не удалось удалить незавершённую загрузку. Проверьте подключение и нажмите «Отмена» ещё раз или удалите её в «Моих собесах».')
      return false
    }).finally(() => { cleanup.current = null })
    cleanup.current = operation
    return operation
  }

  async function cancel() {
    controller.current?.abort()
    xhr.current?.abort()
    if (await removeIncomplete()) onClose()
    else if (mounted.current) setStage('idle')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!file || !title.trim() || !direction) return
    if (file.size === 0 || file.size > MAX_RECORDING_BYTES) { setError('Выберите непустое видео размером до 2 ГБ.'); return }
    if (createdId.current !== null && !await removeIncomplete()) return
    setError('')
    setProgress(0)
    setStage('sending')
    const extension = file.name.toLowerCase().split('.').pop() ?? ''
    const mimeType = file.type || ({ mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska' } as Record<string, string>)[extension] || 'application/octet-stream'
    const abort = new AbortController()
    controller.current = abort
    try {
      const result = await interviewResponse<{ id: number; uploadHref: string }>(await fetch('/api/interviews/upload', {
        method: 'POST', signal: abort.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directionId: Number(direction), title: title.trim(), description: description.trim(), fileName: file.name, mimeType, size: file.size }),
      }))
      createdId.current = result.id
      if (abort.signal.aborted) { await removeIncomplete(); return }
      // Upload URLs are scoped same-origin handlers; never send a file to a server-supplied third party.
      if (result.uploadHref !== `/api/interviews/${result.id}/upload`) throw new Error('Не удалось подготовить безопасную загрузку.')
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest()
        xhr.current = request
        request.open('PUT', result.uploadHref)
        request.setRequestHeader('Content-Type', mimeType)
        request.upload.onprogress = (event) => { if (mounted.current && event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)) }
        request.onload = () => {
          if (request.status >= 200 && request.status < 300) resolve()
          else {
            let message = 'Не удалось загрузить видео. Проверьте подключение и попробуйте ещё раз.'
            try { const body: unknown = JSON.parse(request.responseText); if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') message = body.error.slice(0, 400) } catch { /* Non-JSON proxy failures use the bounded fallback. */ }
            reject(new Error(message))
          }
        }
        request.onerror = () => reject(new Error('Загрузка прервалась. Проверьте подключение к интернету.'))
        request.onabort = () => reject(new DOMException('Загрузка отменена', 'AbortError'))
        request.send(file)
      })
      if (!mounted.current || abort.signal.aborted) return
      setStage('checking')
      const recording = await interviewResponse<InterviewRecordingDTO>(await fetch(`/api/interviews/${result.id}/finish`, { method: 'POST', signal: abort.signal }))
      createdId.current = null
      if (mounted.current) onUploaded(recording)
    } catch (failure) {
      if (!abort.signal.aborted && mounted.current) setError(failure instanceof Error ? failure.message : 'Не удалось загрузить видео.')
      await removeIncomplete()
    } finally {
      if (mounted.current) setStage('idle')
    }
  }

  return <InterviewDialog title="Добавить мой собес" onClose={() => { void cancel() }}>
    <form onSubmit={(event) => { void submit(event) }} className="space-y-4">
      <p className="text-sm text-muted-foreground">Запись сохранится на Яндекс Диске и будет доступна только вам. Анализ запускается отдельно, по вашему желанию.</p>
      <label className="block space-y-1.5 text-sm font-medium">Направление<select className={interviewInput} value={direction} onChange={(event) => setDirection(event.target.value)} disabled={stage !== 'idle'} required>{directions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label className="block space-y-1.5 text-sm font-medium">Название<input className={interviewInput} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} required disabled={stage !== 'idle'} placeholder="Например, React — первый технический этап" /></label>
      <label className="block space-y-1.5 text-sm font-medium">Описание, необязательно<textarea className={interviewInput} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={3} disabled={stage !== 'idle'} /></label>
      <label className="block space-y-1.5 text-sm font-medium">Видеозапись<input className={`${interviewInput} file:mr-3 file:border-0 file:bg-muted file:p-1`} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv" required disabled={stage !== 'idle'} onChange={(event) => { const selected = event.target.files?.[0] ?? null; setFile(selected); if (!title && selected) setTitle(selected.name.replace(/\.[^.]+$/, '')) }} /><span className="block font-normal text-muted-foreground">MP4, WebM, MOV или MKV, до 2 ГБ. Для просмотра на телефоне лучше MP4.</span></label>
      {stage !== 'idle' && <div role="status" className="space-y-2 text-sm"><span>{stage === 'checking' ? 'Проверяем запись на Яндекс Диске…' : `Отправляем видео: ${progress}%`}</span><progress className="h-2 w-full accent-current" value={progress} max={100} aria-label="Отправка видео" /></div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => { void cancel() }} className={`${interviewButton} border border-border`}>{stage === 'idle' ? 'Отмена' : 'Отменить загрузку'}</button><button type="submit" disabled={stage !== 'idle' || !file || !direction || !title.trim()} className={`${interviewButton} bg-primary text-primary-foreground`}>{stage === 'idle' ? <Upload className="h-4 w-4" aria-hidden="true" /> : <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}Загрузить запись</button></div>
    </form>
  </InterviewDialog>
}
