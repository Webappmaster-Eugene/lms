'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2, Sparkles, Trash2 } from 'lucide-react'
import { RECORDING_CATEGORIES, type InterviewRecordingDTO } from '@/lib/interviews/types'
import { InterviewReportView, type InterviewAnalysisDTO } from './InterviewReportView'
import { InterviewDialog } from './InterviewDialog'
import { interviewButton, interviewInput, interviewResponse } from './api'

export type InterviewDetailsDTO = { recording: InterviewRecordingDTO; analysis: InterviewAnalysisDTO | null; analysisAvailable: boolean }

export function InterviewDetail({ initial }: { initial: InterviewDetailsDTO }) {
  const [data, setData] = useState(initial)
  const [error, setError] = useState('')
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [consent, setConsent] = useState(false)
  const [roiMode, setRoiMode] = useState<'auto' | 'none' | 'custom'>('auto')
  const [roiCoordinates, setRoiCoordinates] = useState('')
  const router = useRouter()
  const recording = data.recording
  const pending = recording.analysisStatus === 'queued' || recording.analysisStatus === 'processing'
  const canAnalyze = recording.isOwner && recording.category === 'personal' && recording.status === 'ready'

  useEffect(() => {
    if (!pending || !recording.isOwner) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let request: AbortController | undefined
    async function poll() {
      if (stopped || document.hidden) return
      request?.abort()
      const controller = new AbortController()
      request = controller
      try {
        const next = await interviewResponse<InterviewDetailsDTO>(await fetch(`/api/interviews/${recording.id}`, { signal: controller.signal }))
        if (!stopped && !controller.signal.aborted) { setData(next); setError('') }
      } catch (failure) { if (!stopped && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Не удалось обновить разбор.') }
      if (!stopped && !controller.signal.aborted) timer = setTimeout(() => { void poll() }, 5000)
    }
    timer = setTimeout(() => { void poll() }, 5000)
    const visibility = () => {
      clearTimeout(timer)
      if (document.hidden) request?.abort()
      else void poll()
    }
    document.addEventListener('visibilitychange', visibility)
    return () => { stopped = true; clearTimeout(timer); request?.abort(); document.removeEventListener('visibilitychange', visibility) }
  }, [pending, recording.id, recording.isOwner])

  async function analyze(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!consent) { setError('Подтвердите согласие на передачу видео в Checkfrod.'); return }
    const roiSpec = roiMode === 'custom' ? roiCoordinates.trim() : roiMode
    if (roiMode === 'custom' && !/^\d+,\d+,\d+,\d+$/.test(roiSpec)) { setError('Укажите область лица в формате x,y,ширина,высота в пикселях.'); return }
    if (roiMode === 'custom') {
      const [x, y, width, height] = roiSpec.split(',').map(Number)
      if ([x, y, width, height].some((value) => !Number.isSafeInteger(value) || value > 32768) || width < 16 || height < 16) { setError('Ширина и высота области должны быть от 16 до 32768 пикселей, координаты — от 0 до 32768.'); return }
    }
    setSubmitting(true)
    setError('')
    try {
      await interviewResponse(await fetch(`/api/interviews/${recording.id}/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: true, roiSpec }) }))
      setData((current) => ({ ...current, recording: { ...current.recording, analysisStatus: 'queued', analysisProgress: '', analysisError: '' } }))
      setAnalysisOpen(false)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось запустить разбор.') }
    finally { setSubmitting(false) }
  }

  async function remove() {
    setDeleting(true)
    setError('')
    try {
      await interviewResponse(await fetch(`/api/interviews/${recording.id}`, { method: 'DELETE' }))
      router.push(`/interviews?direction=${encodeURIComponent(recording.direction.slug)}&category=personal`)
      router.refresh()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось удалить запись.'); setDeleting(false) }
  }

  return <div className="mx-auto w-full max-w-5xl space-y-6 pb-8">
    <Link href={`/interviews?direction=${encodeURIComponent(recording.direction.slug)}&category=${recording.category}`} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><ArrowLeft className="h-4 w-4" aria-hidden="true" />К записям собеседований</Link>
    <header><p className="mb-2 text-sm text-muted-foreground">{recording.direction.title} · {RECORDING_CATEGORIES[recording.category]}</p><h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{recording.title}</h1>{recording.description && <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{recording.description}</p>}</header>
    {recording.status === 'ready' ? <div className="overflow-hidden rounded-xl bg-black"><video src={`/api/interviews/${recording.id}/stream`} controls playsInline preload="metadata" className="aspect-video w-full" aria-label={`Собеседование: ${recording.title}`} onError={() => setError('Не удалось воспроизвести видео. Проверьте подключение и обновите страницу.')} /></div> : <div className="rounded-xl border border-border bg-muted p-6"><p className="font-medium">{recording.status === 'uploading' ? 'Загрузка записи не завершена' : 'Не удалось загрузить запись'}</p><p className="mt-2 text-sm text-muted-foreground">Удалите незавершённую запись и загрузите видео ещё раз.</p></div>}
    {error && !analysisOpen && !deleteOpen && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    {recording.isOwner && recording.category === 'personal' && <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={pending || deleting} onClick={() => setDeleteOpen(true)} className={`${interviewButton} border border-border text-destructive`}><Trash2 className="h-4 w-4" aria-hidden="true" />Удалить запись</button></div>}
    {canAnalyze && <section aria-labelledby="interview-analysis-title" className="space-y-5 border-t border-border pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="interview-analysis-title" className="text-xl font-semibold">Личный разбор собеседования</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Checkfrod проверяет видеозапись и отмечает сигналы и моменты для самостоятельного просмотра. Отчёт доступен только вам.</p></div>{!pending && recording.analysisStatus !== 'completed' && <button disabled={!data.analysisAvailable} onClick={() => { setConsent(false); setError(''); setAnalysisOpen(true) }} className={`${interviewButton} bg-primary text-primary-foreground`}><Sparkles className="h-4 w-4" aria-hidden="true" />{recording.analysisStatus === 'failed' ? 'Повторить анализ' : 'Анализировать мой собес'}</button>}</div>
      {!data.analysisAvailable && <p className="text-sm text-muted-foreground">Анализ пока недоступен: администратор должен подключить Checkfrod. Запись можно смотреть без анализа.</p>}
      {pending && <div role="status" className="flex gap-3 rounded-xl bg-muted p-4"><Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /><div><p className="font-medium">{recording.analysisStatus === 'queued' ? 'Разбор в очереди' : 'Готовим разбор'}</p><p className="mt-1 text-sm text-muted-foreground">{recording.analysisProgress || 'Это может занять несколько минут. Можно уйти со страницы и вернуться позже.'}</p></div></div>}
      {recording.analysisStatus === 'failed' && <p role="alert" className="text-sm text-destructive">{recording.analysisError || 'Не удалось подготовить разбор. Попробуйте ещё раз.'}</p>}
      {data.analysis && <InterviewReportView analysis={data.analysis} recordingId={recording.id} />}
    </section>}
    {analysisOpen && recording.analysisStatus !== 'completed' && <InterviewDialog title="Анализ моего собеса в Checkfrod" onClose={() => { if (!submitting) setAnalysisOpen(false) }}>
      <form onSubmit={(event) => { void analyze(event) }} className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">Видеозапись будет передана внешнему сервису Checkfrod для анализа. Сервис отмечает сигналы, моменты и кадры для просмотра; они не доказывают списывание и не являются оценкой ответов или знаний.</p>
        <label className="block space-y-1.5 text-sm font-medium">Область лица кандидата<select value={roiMode} onChange={(event) => setRoiMode(event.target.value as 'auto' | 'none' | 'custom')} disabled={submitting} className={interviewInput}><option value="auto">Определить автоматически</option><option value="none">Использовать весь кадр</option><option value="custom">Указать координаты вручную</option></select></label>
        {roiMode === 'custom' && <label className="block space-y-1.5 text-sm font-medium">Координаты области в пикселях<input value={roiCoordinates} onChange={(event) => setRoiCoordinates(event.target.value)} disabled={submitting} className={interviewInput} placeholder="x,y,ширина,высота" maxLength={40} required /><span className="block text-xs font-normal text-muted-foreground">Например, 100,50,640,480. Укажите область окна с вашим лицом в исходном видео.</span></label>}
        <label className="flex items-start gap-3 text-sm leading-relaxed"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={submitting} required className="mt-1 h-5 w-5 shrink-0 accent-current" /><span>Согласен передать видео в Checkfrod. Подтверждаю, что участники записи предупреждены об обработке и у меня есть право передать запись.</span></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><button disabled={submitting} type="button" onClick={() => setAnalysisOpen(false)} className={`${interviewButton} border border-border`}>Отмена</button><button disabled={submitting || !consent} className={`${interviewButton} bg-primary text-primary-foreground`}>{submitting ? 'Запускаем…' : 'Передать видео в Checkfrod'}</button></div>
      </form>
    </InterviewDialog>}
    {deleteOpen && <InterviewDialog title="Удалить мой собес?" onClose={() => { if (!deleting) setDeleteOpen(false) }}><p className="text-sm text-muted-foreground">Запись и её разбор будут удалены. Это действие нельзя отменить.</p>{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button disabled={deleting} onClick={() => setDeleteOpen(false)} className={`${interviewButton} border border-border`}>Отмена</button><button disabled={deleting} onClick={() => { void remove() }} className={`${interviewButton} bg-destructive text-destructive-foreground`}>{deleting ? 'Удаляем…' : 'Удалить запись и разбор'}</button></div></InterviewDialog>}
  </div>
}
