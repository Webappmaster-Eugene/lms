'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
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
  const video = useRef<HTMLVideoElement>(null)
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
    setSubmitting(true)
    setError('')
    const fields = new FormData(event.currentTarget)
    try {
      await interviewResponse(await fetch(`/api/interviews/${recording.id}/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidateName: fields.get('candidateName'), candidateSpeaker: fields.get('candidateSpeaker'), vacancyText: fields.get('vacancyText') }) }))
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
    {recording.status === 'ready' ? <div className="overflow-hidden rounded-xl bg-black"><video ref={video} src={`/api/interviews/${recording.id}/stream`} controls playsInline preload="metadata" className="aspect-video w-full" aria-label={`Собеседование: ${recording.title}`} onError={() => setError('Не удалось воспроизвести видео. Проверьте подключение и обновите страницу.')} /></div> : <div className="rounded-xl border border-border bg-muted p-6"><p className="font-medium">{recording.status === 'uploading' ? 'Загрузка записи не завершена' : 'Не удалось загрузить запись'}</p><p className="mt-2 text-sm text-muted-foreground">Удалите незавершённую запись и загрузите видео ещё раз.</p></div>}
    {error && !analysisOpen && !deleteOpen && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    {recording.isOwner && recording.category === 'personal' && <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={pending || deleting} onClick={() => setDeleteOpen(true)} className={`${interviewButton} border border-border text-destructive`}><Trash2 className="h-4 w-4" aria-hidden="true" />Удалить запись</button></div>}
    {canAnalyze && <section aria-labelledby="interview-analysis-title" className="space-y-5 border-t border-border pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="interview-analysis-title" className="text-xl font-semibold">Личный разбор собеседования</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Ответы, коммуникация и план подготовки к следующему интервью. Разбор доступен только вам.</p></div>{!pending && recording.analysisStatus !== 'completed' && <button disabled={!data.analysisAvailable} onClick={() => setAnalysisOpen(true)} className={`${interviewButton} bg-primary text-primary-foreground`}><Sparkles className="h-4 w-4" aria-hidden="true" />{recording.analysisStatus === 'failed' ? 'Повторить анализ' : 'Анализировать мой собес'}</button>}</div>
      {!data.analysisAvailable && <p className="text-sm text-muted-foreground">Анализ пока недоступен: администратор должен подключить сервис распознавания и оценки. Запись можно смотреть без анализа.</p>}
      {pending && <div role="status" className="flex gap-3 rounded-xl bg-muted p-4"><Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /><div><p className="font-medium">{recording.analysisStatus === 'queued' ? 'Разбор в очереди' : 'Готовим разбор'}</p><p className="mt-1 text-sm text-muted-foreground">{recording.analysisProgress || 'Это может занять несколько минут. Можно уйти со страницы и вернуться позже.'}</p></div></div>}
      {recording.analysisStatus === 'failed' && <p role="alert" className="text-sm text-destructive">{recording.analysisError || 'Не удалось подготовить разбор. Попробуйте ещё раз.'}</p>}
      {data.analysis && <InterviewReportView analysis={data.analysis} onSeek={(seconds) => { const player = video.current; if (player && Number.isFinite(player.duration) && seconds <= player.duration) { player.currentTime = seconds; player.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' }); player.focus() } }} />}
    </section>}
    {analysisOpen && recording.analysisStatus !== 'completed' && <InterviewDialog title="Анализ моего собеса" onClose={() => { if (!submitting) setAnalysisOpen(false) }}><form onSubmit={(event) => { void analyze(event) }} className="space-y-4"><p className="text-sm leading-relaxed text-muted-foreground">По вашему запросу звук записи будет передан сервису распознавания речи и языковой модели для оценки. Изображение и код на экране не анализируются. Убедитесь, что можете передать эту запись на обработку.</p><label className="block space-y-1.5 text-sm font-medium">Ваше имя, необязательно<input name="candidateName" maxLength={100} className={interviewInput} placeholder="Поможет определить кандидата" /></label><label className="block space-y-1.5 text-sm font-medium">Метка вашего спикера, если известна<input name="candidateSpeaker" maxLength={80} className={interviewInput} placeholder="Например, SPEAKER_00" /></label><label className="block space-y-1.5 text-sm font-medium">Текст вакансии, необязательно<textarea name="vacancyText" maxLength={16000} rows={5} className={interviewInput} placeholder="Требования к роли для более точной оценки" /></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><button disabled={submitting} type="button" onClick={() => setAnalysisOpen(false)} className={`${interviewButton} border border-border`}>Отмена</button><button disabled={submitting} className={`${interviewButton} bg-primary text-primary-foreground`}>{submitting ? 'Запускаем…' : 'Передать запись и начать анализ'}</button></div></form></InterviewDialog>}
    {deleteOpen && <InterviewDialog title="Удалить мой собес?" onClose={() => { if (!deleting) setDeleteOpen(false) }}><p className="text-sm text-muted-foreground">Запись и её разбор будут удалены. Это действие нельзя отменить.</p>{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button disabled={deleting} onClick={() => setDeleteOpen(false)} className={`${interviewButton} border border-border`}>Отмена</button><button disabled={deleting} onClick={() => { void remove() }} className={`${interviewButton} bg-destructive text-destructive-foreground`}>{deleting ? 'Удаляем…' : 'Удалить запись и разбор'}</button></div></InterviewDialog>}
  </div>
}
