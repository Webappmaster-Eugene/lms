'use client'

import type { CheckfrodAnalysisDTO } from '@/lib/interviews/checkfrod-types'
import { interviewButton } from './api'

export type InterviewAnalysisDTO = CheckfrodAnalysisDTO

function duration(seconds: number): string {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor(value % 3600 / 60)
  return [hours, minutes, value % 60].map((part) => String(part).padStart(2, '0')).join(':')
}

function minutes(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0
  return safe >= 1 ? `${Math.round(safe)} мин` : `${Math.round(safe * 60)} с`
}

const qualityNotes: Record<string, string> = {
  head_only: 'Глаза в записи мелкие: сервис оценивал только поворот головы. Для оценки взгляда лучше записывать окно созвона в 1080p, а не весь экран.',
  low: 'Радужка в записи сильно дрожит: выводы по взгляду слабее обычного.',
  no_face: 'Лица в кадре почти нет: такой записи недостаточно для анализа взгляда.',
  static: 'Лицо не двигалось почти всю запись: видео могло застыть или показывать заставку. Взгляд и губы не проверялись; отсутствие сигналов ничего не говорит.',
}

export function InterviewReportView({ analysis, recordingId }: { analysis: InterviewAnalysisDTO; recordingId: number }) {
  const { summary } = analysis
  const staticVideo = summary.gaze === 'static'
  return <div className="space-y-6">
    <div className="grid gap-5 border-y border-border py-5 sm:grid-cols-3">
      <div><p className="text-sm text-muted-foreground">Длительность записи</p><p className="mt-1 text-2xl font-semibold">{duration(summary.durationS)}</p></div>
      <div><p className="text-sm text-muted-foreground">Сигналы сервиса</p><p className="mt-1 text-2xl font-semibold">{summary.episodes}</p><p className="mt-2 text-sm text-muted-foreground">Справочные эпизоды не включены.</p></div>
      <div><p className="text-sm text-muted-foreground">Моменты для просмотра</p><p className="mt-1 text-2xl font-semibold">{summary.moments}</p></div>
    </div>
    <section aria-labelledby="checkfrod-coverage" className="space-y-3"><h3 id="checkfrod-coverage" className="text-lg font-semibold">Что удалось проанализировать</h3>
      <dl className="grid gap-3 sm:grid-cols-2">
        {staticVideo ? <div className="rounded-lg bg-muted px-4 py-3"><dt className="text-sm text-muted-foreground">Лицо в кадре</dt><dd className="mt-1 font-medium">{minutes(summary.irisMinutes + summary.headOnlyMinutes)}</dd></div> : <><div className="rounded-lg bg-muted px-4 py-3"><dt className="text-sm text-muted-foreground">По радужке и голове</dt><dd className="mt-1 font-medium">{minutes(summary.irisMinutes)}</dd></div><div className="rounded-lg bg-muted px-4 py-3"><dt className="text-sm text-muted-foreground">Только по повороту головы</dt><dd className="mt-1 font-medium">{minutes(summary.headOnlyMinutes)}</dd></div></>}
        <div className="rounded-lg bg-muted px-4 py-3"><dt className="text-sm text-muted-foreground">Лица в кадре нет</dt><dd className="mt-1 font-medium">{minutes(summary.noFaceMinutes)}</dd></div>
        {!staticVideo && summary.frozenMinutes > 0 && <div className="rounded-lg bg-muted px-4 py-3"><dt className="text-sm text-muted-foreground">Видео застывало, не проверялось</dt><dd className="mt-1 font-medium">{minutes(summary.frozenMinutes)}</dd></div>}
      </dl>
      {qualityNotes[summary.gaze] && <p className="text-sm leading-relaxed text-warning">{qualityNotes[summary.gaze]}</p>}
    </section>
    <section className="space-y-3 rounded-xl border border-border p-4"><h3 className="font-semibold">Сигналы требуют самостоятельной проверки</h3><p className="text-sm leading-relaxed text-muted-foreground">Сводка Checkfrod не устанавливает факт списывания и не оценивает правильность ответов, уровень разработчика или качество кода. Откройте полный отчёт с эпизодами, моментами и кадрами, затем посмотрите соответствующие фрагменты записи.</p><p className="text-sm leading-relaxed text-muted-foreground">Полный отчёт откроется в Checkfrod по временной подписанной ссылке. Она даёт доступ к кадрам записи — не передавайте её другим людям.</p><a href={`/api/interviews/${recordingId}/report`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className={`${interviewButton} bg-primary text-primary-foreground`}>Открыть полный отчёт Checkfrod</a></section>
  </div>
}
