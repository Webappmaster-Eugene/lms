import { activitySummary, describeActivity, type ActivityCell } from '@/lib/activity'
import { cn, pluralize } from '@/lib/utils'

const LEVEL_CLASSES: Record<ActivityCell['level'], string> = {
  0: 'bg-muted',
  1: 'bg-primary/25',
  2: 'bg-primary/50',
  3: 'bg-primary/75',
  4: 'bg-primary',
}

const DAY_LABELS = ['Пн', '', 'Ср', '', 'Пт', '', '']

const monthFormat = new Intl.DateTimeFormat('ru-RU', { month: 'short', timeZone: 'UTC' })
const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' })

/** Подпись месяца над неделей, в которой он начинается. */
function monthLabels(grid: ActivityCell[][]): (string | null)[] {
  let previous = ''
  return grid.map((week) => {
    const month = week[0].date.slice(0, 7)
    if (month === previous) return null
    previous = month
    return monthFormat.format(new Date(`${week[0].date}T00:00:00Z`)).replace('.', '')
  })
}

/** Календарь занятий: видно ритм учёбы и перерывы, а не только число «дней подряд». */
export function ActivityCalendar({ grid }: { grid: ActivityCell[][] }) {
  const summary = activitySummary(grid)
  const months = monthLabels(grid)
  const caption =
    summary.activeDays === 0
      ? 'За последние месяцы занятий пока не было'
      : `${pluralize(summary.activeDays, 'активный день', 'активных дня', 'активных дней')}: ${describeActivity(summary)}`

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{caption}</p>
      {/* data-dynamic: сетка сдвигается каждую неделю — визуальные тесты её маскируют. */}
      <div className="overflow-x-auto pb-1" data-dynamic>
        {/* Отступ справа — под подпись месяца в последней неделе, она шире клетки. */}
        <div className="inline-flex gap-2 pr-3" role="img" aria-label={`Календарь занятий. ${caption}`}>
          <div className="grid grid-rows-[auto_repeat(7,12px)] gap-[3px] pt-px text-[10px] leading-3 text-muted-foreground">
            <span className="h-3" />
            {DAY_LABELS.map((label, i) => (
              <span key={i}>{label}</span>
            ))}
          </div>
          {grid.map((week, w) => (
            <div key={week[0].date} className="grid grid-rows-[auto_repeat(7,12px)] gap-[3px]">
              <span className="h-3 w-3 overflow-visible whitespace-nowrap text-[10px] leading-3 text-muted-foreground">
                {months[w]}
              </span>
              {week.map((cell) => (
                <span
                  key={cell.date}
                  data-level={cell.level}
                  title={cell.future ? undefined : `${dayFormat.format(new Date(`${cell.date}T00:00:00Z`))}: ${describeActivity(cell)}`}
                  className={cn('h-3 w-3 rounded-sm', cell.future ? 'bg-transparent' : LEVEL_CLASSES[cell.level])}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-hidden="true">
        Меньше
        {([0, 1, 2, 3, 4] as const).map((level) => (
          <span key={level} className={cn('h-3 w-3 rounded-sm', LEVEL_CLASSES[level])} />
        ))}
        Больше
      </div>
    </div>
  )
}
