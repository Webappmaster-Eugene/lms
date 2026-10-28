'use client'

import type { InterviewAnalysisDTO } from '@/lib/interviews/analysis-types'
import { interviewButton } from './api'

export type { InterviewAnalysisDTO } from '@/lib/interviews/analysis-types'

const verdicts: Record<string, string> = {
  strong_yes: 'Убедительное соответствие требованиям',
  yes: 'Соответствует требованиям',
  maybe: 'Частичное соответствие: есть вопросы',
  no: 'Есть существенные пробелы по требованиям',
  insufficient_data: 'Недостаточно данных для вывода',
}
const confidence: Record<string, string> = { low: 'низкая', medium: 'средняя', high: 'высокая' }
const grades: Record<string, string> = { noob: 'Начальный', intern: 'Стажёр', junior: 'Junior', junior_plus: 'Junior+', junior_plus_plus: 'Junior++', middle_minus: 'Middle−', middle: 'Middle', middle_plus: 'Middle+', middle_plus_plus: 'Middle++', senior: 'Senior', senior_plus: 'Senior+', staff: 'Staff', master: 'Master', lead: 'Lead' }
const formats: Record<string, string> = { technical: 'Технические вопросы', live_coding: 'Лайвкодинг', system_design: 'Проектирование систем', hr: 'HR / поведенческое', mixed: 'Смешанный' }
const criterionKinds: Record<string, string> = { must: 'Обязательное требование', nice: 'Дополнительное требование', soft: 'Коммуникация и поведение' }
const riskLevels: Record<string, string> = { low: 'Низкий', medium: 'Средний', high: 'Высокий' }
const resumeStatuses: Record<string, string> = { confirmed: 'Подтверждено ответами', contradicted: 'Есть противоречие', not_discussed: 'Не обсуждалось' }

function ReportList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return <section className="space-y-3"><h3 className="text-lg font-semibold">{title}</h3><ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">{items.map((item, index) => <li key={index} className="whitespace-pre-wrap break-words">{item}</li>)}</ul></section>
}

function time(seconds: number): string {
  const value = Math.max(0, Math.round(seconds))
  return [Math.floor(value / 3600), Math.floor(value % 3600 / 60), value % 60].map((part) => String(part).padStart(2, '0')).join(':')
}

export function InterviewReportView({ analysis, recordingId }: { analysis: InterviewAnalysisDTO; recordingId: number }) {
  const { context } = analysis
  const { report, score, criteria } = analysis.report
  const criterionById = new Map(criteria.map((criterion) => [criterion.id, criterion]))
  const limitations = [...new Set([...report.limitations, ...analysis.report.limitations])]
  const criterionName = (id: string) => criterionById.get(id)?.name ?? id
  const coverage = Math.round(Math.max(0, Math.min(1, score.coverage)) * 100)
  return <div className="min-w-0 space-y-7">
    <section aria-labelledby="interview-report-summary" className="space-y-4 border-y border-border py-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="interview-report-summary" className="text-lg font-semibold">Итог разбора</h3><a href={`/api/interviews/${recordingId}/report`} download className={`${interviewButton} border border-border`}>Скачать отчёт</a></div>
      <p className="text-sm text-muted-foreground">Цель: {grades[context.targetGrade] ?? context.targetGrade}. Формат: {formats[context.interviewFormat] ?? context.interviewFormat}.</p>
      <p className="text-lg font-medium">{verdicts[score.verdict] ?? score.verdict}</p>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{report.hrSummary}</p>
      <dl className="flex flex-wrap gap-x-10 gap-y-4">
        <div><dt className="text-sm text-muted-foreground">По оценённым критериям</dt><dd className="mt-1 font-semibold">{score.coverage > 0 ? `${Math.round(score.overall)} из 100` : 'Недостаточно данных'}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Доля требований, которые удалось оценить</dt><dd className="mt-1 font-semibold">{coverage}%</dd></div>
      </dl>
      <p className="text-sm leading-relaxed text-muted-foreground">Оценка основана на ответах в этой записи. Необсуждавшиеся темы не считаются ошибками. Отчёт помогает подготовиться к следующему собеседованию; решение о найме принимает человек.</p>
      {score.borderline && <p className="text-sm leading-relaxed text-muted-foreground">Результат близок к границе оценки. Сравните комментарии и ответы, прежде чем делать вывод.</p>}
      {!context.vacancyText && <p className="text-sm leading-relaxed text-muted-foreground">Конкретная вакансия не указана: оценка относится к выбранному направлению и грейду.</p>}
      {context.vacancyText && <details className="text-sm"><summary className="min-h-11 cursor-pointer py-2 font-medium focus-visible:outline-2 focus-visible:outline-ring">Требования, по которым выполнен разбор</summary><p className="mt-2 whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">{context.vacancyText}</p></details>}
    </section>
    {report.grade && <section className="space-y-2"><h3 className="text-lg font-semibold">Уровень по ответам в записи: {grades[report.grade.level] ?? report.grade.level}</h3><p className="text-sm text-muted-foreground">Уверенность оценки: {confidence[report.grade.confidence] ?? report.grade.confidence}</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{report.grade.rationale}</p></section>}
    {!report.grade && <p className="text-sm text-muted-foreground">Грейд по этой записи не определён.</p>}
    <ReportList title="Сильные стороны" items={report.strengths} />
    <ReportList title="Что проработать к следующему собеседованию" items={report.growthAreas} />
    {!!report.criteria.length && <section aria-labelledby="interview-report-criteria" className="space-y-3"><h3 id="interview-report-criteria" className="text-lg font-semibold">Разбор по требованиям</h3><div className="divide-y divide-border border-y border-border">{report.criteria.map((item) => {
      const criterion = criterionById.get(item.criterionId)
      return <article key={item.criterionId} className="space-y-3 py-5">
        <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h4 className="break-words font-semibold">{criterion?.name ?? item.criterionId}</h4>{criterion && <p className="mt-1 text-xs text-muted-foreground">{criterionKinds[criterion.kind]}</p>}</div><p className="shrink-0 text-sm font-medium">{item.score === null ? 'Не оценено' : `${item.score} из 5`}</p></div>
        {criterion?.description && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{criterion.description}</p>}
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.comment}</p>
        {!!item.evidence.length && <ul aria-label={`Цитаты: ${criterion?.name ?? item.criterionId}`} className="space-y-3">{item.evidence.map((evidence, index) => <li key={index} className="border-l-2 border-border pl-4"><blockquote className="whitespace-pre-wrap break-words text-sm leading-relaxed">{evidence.quote}</blockquote><p className="mt-1 text-xs text-muted-foreground">{evidence.timestamp && <span>{evidence.timestamp}. </span>}{evidence.verified ? 'Цитата подтверждена расшифровкой' : 'Цитата не подтверждена расшифровкой - проверьте фрагмент записи'}</p></li>)}</ul>}
      </article>
    })}</div></section>}
    <ReportList title="Обязательные требования с пробелами" items={score.failedMust.map(criterionName)} />
    <ReportList title="Обязательные требования, которые ещё нужно проверить" items={score.uncheckedMust.map(criterionName)} />
    <section className="space-y-3"><h3 className="text-lg font-semibold">Как вы объясняете свои решения</h3><dl className="flex flex-wrap gap-x-8 gap-y-3">{([{ key: 'clarity', title: 'Ясность' }, { key: 'confidence', title: 'Уверенность' }, { key: 'structure', title: 'Структура ответа' }] as const).map(({ key, title }) => <div key={key}><dt className="text-sm text-muted-foreground">{title}</dt><dd className="mt-1 text-sm font-medium">{report.communication[key] === null ? 'Не оценено' : `${report.communication[key]} из 5`}</dd></div>)}</dl><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{report.communication.comment}</p></section>
    {!!report.risks.length && <section className="space-y-3"><h3 className="text-lg font-semibold">Проблемы, которые стоит разобрать</h3><ul className="space-y-4">{report.risks.map((risk, index) => <li key={index}><h4 className="break-words text-sm font-semibold">{risk.title}</h4><p className="mt-1 text-xs text-muted-foreground">Приоритет: {riskLevels[risk.severity] ?? risk.severity}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{risk.detail}</p></li>)}</ul></section>}
    {!!report.resumeCheck.length && <section className="space-y-3"><h3 className="text-lg font-semibold">Заявленный опыт и ответы</h3><ul className="space-y-4">{report.resumeCheck.map((claim, index) => <li key={index}><p className="whitespace-pre-wrap break-words text-sm font-semibold">{claim.claim}</p><p className="mt-1 text-xs text-muted-foreground">{resumeStatuses[claim.status] ?? claim.status}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{claim.note}</p></li>)}</ul></section>}
    <ReportList title="Что уточнить или потренировать" items={report.openQuestions} />
    {!!report.extraneous?.length && <section className="space-y-3"><h3 className="text-lg font-semibold">Фрагменты вне собеседования</h3><ul className="space-y-2 text-sm leading-relaxed">{report.extraneous.map((segment, index) => <li key={index}><span className="font-medium">{time(segment.fromSec)}-{time(segment.toSec)}: </span>{segment.note}</li>)}</ul></section>}
    <ReportList title="Ограничения разбора" items={limitations} />
  </div>
}
