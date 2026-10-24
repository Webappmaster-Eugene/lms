'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { VideoPlayer } from '@/components/lesson/VideoPlayer'
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
  const [targetGrade, setTargetGrade] = useState('middle')
  const [interviewFormat, setInterviewFormat] = useState('technical')
  const [vacancyText, setVacancyText] = useState('')
  const [candidateName, setCandidateName] = useState('')
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
    if (!consent) { setError('Подтвердите согласие на обработку записи для анализа собеседования.'); return }
    setSubmitting(true)
    setError('')
    try {
      await interviewResponse(await fetch(`/api/interviews/${recording.id}/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: true, targetGrade, interviewFormat, vacancyText: vacancyText.trim(), ...(candidateName.trim() ? { candidateName: candidateName.trim() } : {}) }) }))
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
    {recording.status === 'ready' ? <VideoPlayer title={recording.title} videoUrl={`/api/interviews/${recording.id}/stream`} displayMode="embed" /> : <div className="rounded-xl border border-border bg-muted p-6"><p className="font-medium">{recording.status === 'uploading' ? 'Загрузка записи не завершена' : 'Не удалось загрузить запись'}</p><p className="mt-2 text-sm text-muted-foreground">Удалите незавершённую запись и загрузите видео ещё раз.</p></div>}
    {error && !analysisOpen && !deleteOpen && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    {recording.isOwner && recording.category === 'personal' && <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={pending || deleting} onClick={() => setDeleteOpen(true)} className={`${interviewButton} border border-border text-destructive`}><Trash2 className="h-4 w-4" aria-hidden="true" />Удалить запись</button></div>}
    {canAnalyze && <section aria-labelledby="interview-analysis-title" className="space-y-5 border-t border-border pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="interview-analysis-title" className="text-xl font-semibold">Личный разбор собеседования</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Получите разбор качества ответов, сильных сторон и пробелов относительно выбранного грейда и вакансии. Отчёт сохраняется здесь и доступен только вам.</p></div>{!pending && recording.analysisStatus !== 'completed' && <button disabled={!data.analysisAvailable} onClick={() => { setConsent(false); setError(''); setAnalysisOpen(true) }} className={`${interviewButton} bg-primary text-primary-foreground`}><Sparkles className="h-4 w-4" aria-hidden="true" />{recording.analysisStatus === 'failed' ? 'Повторить анализ' : 'Анализировать мой собес'}</button>}</div>
      {!data.analysisAvailable && <p className="text-sm text-muted-foreground">Анализ пока недоступен: администратор должен подключить сервис разбора собеседований. Запись можно смотреть без анализа.</p>}
      {pending && <div role="status" className="flex gap-3 rounded-xl bg-muted p-4"><Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /><div><p className="font-medium">{recording.analysisStatus === 'queued' ? 'Разбор в очереди' : 'Готовим разбор'}</p><p className="mt-1 text-sm text-muted-foreground">{recording.analysisProgress || 'Это может занять несколько минут. Можно уйти со страницы и вернуться позже.'}</p></div></div>}
      {recording.analysisStatus === 'failed' && <p role="alert" className="text-sm text-destructive">{recording.analysisError || 'Не удалось подготовить разбор. Попробуйте ещё раз.'}</p>}
      {data.analysis && <InterviewReportView analysis={data.analysis} recordingId={recording.id} />}
    </section>}
    {analysisOpen && recording.analysisStatus !== 'completed' && <InterviewDialog title="Разбор моего собеседования" onClose={() => { if (!submitting) setAnalysisOpen(false) }}>
      <form onSubmit={(event) => { void analyze(event) }} className="space-y-5">
        <p className="text-sm leading-relaxed text-muted-foreground">Сервис анализа собеседований Советника разберёт ответы и оценит, насколько они соответствуют выбранному уровню и требованиям вакансии. Готовый отчёт сохранится в LMS.</p>
        <p className="text-sm text-muted-foreground">Направление: <span className="font-medium text-foreground">{recording.direction.title}</span></p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm font-medium"><span>Целевой грейд</span><select value={targetGrade} onChange={(event) => setTargetGrade(event.target.value)} disabled={submitting} className={interviewInput}><option value="intern">Стажёр</option><option value="junior">Junior</option><option value="middle">Middle</option><option value="senior">Senior</option><option value="lead">Lead</option></select></label>
          <label className="block space-y-1.5 text-sm font-medium"><span>Формат собеседования</span><select value={interviewFormat} onChange={(event) => setInterviewFormat(event.target.value)} disabled={submitting} className={interviewInput}><option value="technical">Технические вопросы</option><option value="live_coding">Лайвкодинг</option><option value="system_design">Проектирование систем</option><option value="hr">HR / поведенческое</option><option value="mixed">Смешанный</option></select></label>
        </div>
        <label className="block space-y-1.5 text-sm font-medium"><span>Вакансия или требования (необязательно)</span><textarea value={vacancyText} onChange={(event) => setVacancyText(event.target.value)} disabled={submitting} className={`${interviewInput} min-h-28 resize-y`} rows={5} maxLength={15000} placeholder="Вставьте описание вакансии и требования к кандидату" /><span className="block text-xs font-normal leading-relaxed text-muted-foreground">Без вакансии разбор оценивает ответы по направлению и грейду. С требованиями он также покажет соответствие конкретной роли.</span></label>
        <label className="block space-y-1.5 text-sm font-medium"><span>Как вас называют в записи (необязательно)</span><input value={candidateName} onChange={(event) => setCandidateName(event.target.value)} disabled={submitting} className={interviewInput} maxLength={120} autoComplete="given-name" placeholder="Например, Александр" /><span className="block text-xs font-normal text-muted-foreground">Поможет отличить ваши ответы от реплик интервьюера.</span></label>
        <label className="flex items-start gap-3 text-sm leading-relaxed"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={submitting} required className="mt-1 h-5 w-5 shrink-0 accent-current" /><span>Согласен передать запись и указанные требования сервису анализа собеседований. Подтверждаю, что участники предупреждены об обработке и у меня есть право передать запись.</span></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><button disabled={submitting} type="button" onClick={() => setAnalysisOpen(false)} className={`${interviewButton} border border-border`}>Отмена</button><button disabled={submitting || !consent} className={`${interviewButton} bg-primary text-primary-foreground`}>{submitting ? 'Запускаем…' : 'Получить разбор'}</button></div>
      </form>
    </InterviewDialog>}
    {deleteOpen && <InterviewDialog title="Удалить мой собес?" onClose={() => { if (!deleting) setDeleteOpen(false) }}><p className="text-sm text-muted-foreground">Запись и её разбор будут удалены. Это действие нельзя отменить.</p>{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button disabled={deleting} onClick={() => setDeleteOpen(false)} className={`${interviewButton} border border-border`}>Отмена</button><button disabled={deleting} onClick={() => { void remove() }} className={`${interviewButton} bg-destructive text-destructive-foreground`}>{deleting ? 'Удаляем…' : 'Удалить запись и разбор'}</button></div></InterviewDialog>}
  </div>
}
