import Link from 'next/link'
import { CheckCircle2, Compass, Lock, Tent } from 'lucide-react'

import type { NodeExtra } from './types'

const GROUPS = [
  { kind: 'bootcamp', one: 'Буткемп', many: 'Буткемпы', Icon: Tent },
  { kind: 'guide', one: 'Гайд', many: 'Гайды', Icon: Compass },
] as const

/**
 * Буткемпы и гайды темы рядом с её курсами. Закрытые тоже видны: название с замком, ссылка ведёт
 * на экран «нет доступа». Общий для панели карты и списка по этапам.
 */
export function NodeExtraList({ extras }: { extras: NodeExtra[] }) {
  if (extras.length === 0) return null

  return (
    <div className="space-y-3">
      {GROUPS.map(({ kind, one, many, Icon }) => {
        const items = extras.filter((extra) => extra.kind === kind)
        if (items.length === 0) return null
        return (
          <section key={kind}>
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {items.length > 1 ? many : one}
            </h4>
            <ul className="space-y-2">
              {items.map((extra) => (
                <li key={extra.key} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex items-start gap-2">
                    {!extra.accessAllowed ? (
                      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    ) : extra.read ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                    ) : null}
                    <Link href={extra.href} className="flex-1 text-sm font-medium text-foreground underline-offset-2 hover:underline">
                      {extra.title}
                    </Link>
                  </div>
                  {!extra.accessAllowed ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">Доступ не назначен</p>
                  ) : extra.read ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">Прочитан</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      <p className="text-xs text-muted-foreground">В прогресс роадмапа не входят</p>
    </div>
  )
}
