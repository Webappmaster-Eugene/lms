import {
  COMPANY_LABELS, TAG_LABELS, type TrainerCompany, type TrainerTag,
} from '@/lib/trainer/constants'
import {
  companyEvidence, EVIDENCE_LABELS, INTERVIEW_FORMAT_OPTIONS, safeSourceUrl,
} from '@/lib/trainer/metadata'
import { cn } from '@/lib/utils'

export type TaskMetadataValues = {
  interviewFormat?: string | null
  recommendedMinutes?: number | null
  tags?: readonly string[] | null
  companies?: readonly string[] | null
  companyEvidence?: unknown
  sourceUrl?: unknown
  leetcodeNumber?: number | null
}

const externalLinkClass = 'inline-flex min-h-11 max-w-full items-center break-words text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
const isCompany = (value: string): value is TrainerCompany => Object.hasOwn(COMPANY_LABELS, value)
const isTag = (value: string): value is TrainerTag => Object.hasOwn(TAG_LABELS, value)

export function TaskMetadata({ task, compact = false, className }: { task: TaskMetadataValues; compact?: boolean; className?: string }) {
  const format = INTERVIEW_FORMAT_OPTIONS.find((option) => option.value === task.interviewFormat)?.label
  const minutes = typeof task.recommendedMinutes === 'number' && Number.isFinite(task.recommendedMinutes)
    && task.recommendedMinutes >= 5 && task.recommendedMinutes <= 180 ? task.recommendedMinutes : null
  const tags = [...new Set(task.tags ?? [])].filter(isTag)
  const evidence = companyEvidence(task.companyEvidence)
  const byCompany = new Map(evidence.map((row) => [row.company, row]))
  const companies = [...new Set([...(task.companies ?? []).filter(isCompany), ...evidence.map((row) => row.company)])]
  const source = safeSourceUrl(task.sourceUrl)
  const invalidSource = task.sourceUrl != null && task.sourceUrl !== '' && !source
  const leetcodeNumber = typeof task.leetcodeNumber === 'number' && Number.isSafeInteger(task.leetcodeNumber) && task.leetcodeNumber > 0 ? task.leetcodeNumber : null
  const leetcodeUrl = leetcodeNumber ? source && new URL(source).hostname === 'leetcode.com'
    ? source : `https://leetcode.com/problemset/?search=${leetcodeNumber}` : null

  if (!format && minutes === null && !tags.length && !companies.length && (compact || (!source && !invalidSource && !leetcodeUrl))) return null

  return (
    <div className={cn('min-w-0 break-words space-y-2 text-xs', className)}>
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        {format && <span className="max-w-full rounded bg-muted px-2 py-1 text-muted-foreground">{format}</span>}
        {minutes !== null && <span className="max-w-full rounded bg-muted px-2 py-1 text-muted-foreground" title="Ориентир платформы для самостоятельной тренировки">Тренировка: {minutes.toLocaleString('ru-RU')} мин</span>}
        {tags.map((tag) => <span key={tag} className="max-w-full rounded bg-primary/10 px-2 py-1 text-primary">{TAG_LABELS[tag]}</span>)}
        {companies.map((company) => {
          const row = byCompany.get(company)
          const label = EVIDENCE_LABELS[row?.kind ?? 'unverified']
          return <span key={company} className="max-w-full break-words rounded bg-info/10 px-2 py-1 text-info" title={row?.note ?? 'У метки компании нет подтверждённого источника.'}>{COMPANY_LABELS[company]}: {label}</span>
        })}
      </div>
      {!compact && (
        <>
          {minutes !== null && <p className="text-muted-foreground">Время — ориентир для самостоятельной тренировки, а не длительность интервью компании.</p>}
          {(source || invalidSource || leetcodeUrl) && <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {source && <a href={source} target="_blank" rel="nofollow noopener noreferrer" className={externalLinkClass}>Источник задачи</a>}
            {invalidSource && <span className="text-muted-foreground">Ссылка на источник задачи недоступна.</span>}
            {leetcodeUrl && <a href={leetcodeUrl} target="_blank" rel="nofollow noopener noreferrer" className={externalLinkClass}>LeetCode #{leetcodeNumber}</a>}
          </div>}
          {companies.length > 0 && <ul className="space-y-2 border-t border-border pt-2 text-muted-foreground" aria-label="Источники меток компаний">
            {companies.map((company) => {
              const row = byCompany.get(company)
              const url = safeSourceUrl(row?.url)
              return <li key={company} className="min-w-0 space-y-1">
                <p><span className="font-medium text-foreground">{COMPANY_LABELS[company]}</span> — {row?.note ?? 'Источник метки компании не подтверждён. Это не означает, что задачу задавали на её собеседовании.'}</p>
                {row && <p>Проверено <time dateTime={row.checkedAt}>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(row.checkedAt))}</time></p>}
                {url && <a href={url} target="_blank" rel="nofollow noopener noreferrer" className={externalLinkClass}>Источник метки «{COMPANY_LABELS[company]}»</a>}
              </li>
            })}
          </ul>}
        </>
      )}
    </div>
  )
}
