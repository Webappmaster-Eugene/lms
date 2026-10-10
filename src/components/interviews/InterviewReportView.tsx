'use client'

import type { InterviewCriterion, InterviewReport, InterviewScore } from '@/lib/interviews/analysis/types'
import { INTERVIEW_GRADES } from '@/lib/interviews/analysis/constants'

export type InterviewAnalysisDTO = { report: InterviewReport; score: InterviewScore; criteria: InterviewCriterion[]; transcript: string; model: string }

const verdicts = { strong_yes: 'Уверенное соответствие', yes: 'Соответствует', maybe: 'Нужна дополнительная проверка', no: 'Есть существенные пробелы', insufficient_data: 'Недостаточно данных' }
const confidence = { low: 'низкая', medium: 'средняя', high: 'высокая' }

export function timestampSeconds(timestamp: string | null): number | null {
  if (!timestamp || !/^\d{1,3}:\d{2}:\d{2}$/.test(timestamp)) return null
  const [hours, minutes, seconds] = timestamp.split(':').map(Number)
  if (minutes >= 60 || seconds >= 60) return null
  return hours * 3600 + minutes * 60 + seconds
}

function TextList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return <section className="space-y-3"><h3 className="text-lg font-semibold">{title}</h3><ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">{items.map((item, index) => <li key={index}>{item}</li>)}</ul></section>
}

export function InterviewReportView({ analysis, onSeek }: { analysis: InterviewAnalysisDTO; onSeek: (seconds: number) => void }) {
  const { report, score, criteria } = analysis
  return <div className="space-y-8">
    <div className="grid gap-4 border-y border-border py-5 sm:grid-cols-3">
      <div><p className="text-sm text-muted-foreground">Итог по критериям</p><p className="mt-1 text-3xl font-semibold">{score.overall}<span className="text-base font-normal text-muted-foreground"> / 100</span></p><p className="mt-2 text-sm">{verdicts[score.verdict]}</p></div>
      <div><p className="text-sm text-muted-foreground">Оценённая часть критериев</p><p className="mt-1 text-2xl font-semibold">{Math.round(score.coverage * 100)}%</p><p className="mt-2 text-sm text-muted-foreground">Необсуждавшиеся темы не считаются проваленными.</p></div>
      <div><p className="text-sm text-muted-foreground">Уровень по записи</p><p className="mt-1 text-2xl font-semibold">{report.grade ? INTERVIEW_GRADES.find((grade) => grade.value === report.grade?.level)?.label ?? report.grade.level : 'Не определён'}</p>{report.grade && <p className="mt-2 text-sm text-muted-foreground">Уверенность: {confidence[report.grade.confidence]}</p>}</div>
    </div>
    <section><h3 className="text-lg font-semibold">Общий разбор</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{report.hrSummary}</p>{report.grade?.rationale && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{report.grade.rationale}</p>}{score.borderline && <p className="mt-3 text-sm text-warning">Оценка близка к границе: небольшой пересмотр критериев может изменить итог.</p>}</section>
    <section className="space-y-4"><h3 className="text-lg font-semibold">Ответы и навыки</h3>{report.criteria.map((item) => {
      const criterion = criteria.find((entry) => entry.id === item.criterionId)
      return <article key={item.criterionId} className="border-b border-border pb-5"><div className="flex flex-wrap items-baseline justify-between gap-2"><h4 className="font-medium">{criterion?.name ?? item.criterionId}</h4><span className="text-sm text-muted-foreground">{item.score === null ? 'Не обсуждалось' : `${item.score} / 5`}</span></div>{criterion?.description && <p className="mt-1 text-xs text-muted-foreground">{criterion.description}</p>}<p className="mt-2 text-sm leading-relaxed">{item.comment}</p>{item.evidence.map((evidence, index) => {
        const seconds = evidence.verified ? timestampSeconds(evidence.timestamp) : null
        return <blockquote key={index} className="mt-3 border-l-2 border-border pl-3 text-sm leading-relaxed"><p>«{evidence.quote}»</p><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{seconds !== null ? <button type="button" onClick={() => onSeek(seconds)} className="min-h-11 rounded-md px-2 font-medium text-foreground underline focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Перейти к ${evidence.timestamp}`}>{evidence.timestamp}</button> : evidence.timestamp && <span>{evidence.timestamp}</span>}<span>{evidence.verified ? 'Цитата подтверждена расшифровкой' : 'Цитата не подтверждена — требует проверки'}</span></div></blockquote>
      })}</article>
    })}</section>
    <section><h3 className="text-lg font-semibold">Коммуникация</h3><dl className="mt-3 grid gap-3 sm:grid-cols-3">{([['Ясность', report.communication.clarity], ['Уверенность', report.communication.confidence], ['Структура', report.communication.structure]] as const).map(([label, value]) => <div key={label} className="rounded-lg bg-muted px-4 py-3"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold">{value === null ? 'Недостаточно данных' : `${value} / 5`}</dd></div>)}</dl><p className="mt-3 text-sm leading-relaxed">{report.communication.comment}</p></section>
    <TextList title="Сильные стороны" items={report.strengths} />
    {report.risks.length > 0 && <section className="space-y-3"><h3 className="text-lg font-semibold">Риски и замечания</h3>{report.risks.map((risk, index) => <article key={index} className="border-l-2 border-warning pl-4"><h4 className="font-medium">{risk.title}<span className="ml-2 text-xs font-normal text-muted-foreground">{risk.severity === 'high' ? 'Высокий риск' : risk.severity === 'medium' ? 'Средний риск' : 'Низкий риск'}</span></h4><p className="mt-1 text-sm leading-relaxed">{risk.detail}</p></article>)}</section>}
    <TextList title="Что проработать к следующему собесу" items={report.growthAreas} />
    <TextList title="Что ещё проверить" items={report.openQuestions} />
    {score.failedMust.length > 0 && <TextList title="Пробелы по обязательным критериям" items={score.failedMust.map((id) => criteria.find((entry) => entry.id === id)?.name ?? id)} />}
    {score.uncheckedMust.length > 0 && <TextList title="Обязательные темы без оценки" items={score.uncheckedMust.map((id) => criteria.find((entry) => entry.id === id)?.name ?? id)} />}
    {report.resumeCheck.length > 0 && <section className="space-y-3"><h3 className="text-lg font-semibold">Проверка заявленного опыта</h3>{report.resumeCheck.map((claim, index) => <div key={index}><h4 className="text-sm font-medium">{claim.claim}</h4><p className="mt-1 text-sm text-muted-foreground">{claim.status === 'confirmed' ? 'Подтверждено' : claim.status === 'contradicted' ? 'Есть противоречие' : 'Не обсуждалось'}: {claim.note}</p></div>)}</section>}
    <section className="space-y-3 rounded-xl border border-border p-4"><h3 className="font-semibold">Границы разбора</h3><p className="text-sm leading-relaxed text-muted-foreground">Анализ основан на звуке и расшифровке. Изображение, мимика и код на экране не оцениваются. Рекомендации по лайвкодингу относятся к тому, что прозвучало в разговоре. Итог модели стоит проверить самостоятельно.</p>{report.limitations.length > 0 && <ul className="list-disc space-y-2 pl-5 text-sm">{report.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul>}{report.extraneous?.length ? <p className="text-sm text-muted-foreground">В записи отмечены посторонние фрагменты: {report.extraneous.map((segment) => segment.note).join('; ')}.</p> : null}</section>
    <details className="rounded-xl border border-border p-4"><summary className="min-h-11 cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">Расшифровка собеседования</summary><p className="mt-4 max-h-96 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed">{analysis.transcript || 'Расшифровка недоступна.'}</p></details>
  </div>
}
