import type { CSSProperties } from 'react'

/** Доля пройденного в процентах без округления, от 0 до 100; пустой курс - 0. Подпись делает formatPercent. */
export function completionPercent(done: number, total: number): number {
  return total > 0 ? Math.min(100, Math.max(0, (done / total) * 100)) : 0
}

/**
 * Подпись процента. Округление прячет крайние случаи: 3 урока из 631 давали «0%», будто ученик не начинал,
 * а 630 из 631 - «100%», будто закончил. Поэтому начатое меньше 1% и почти законченное подписаны отдельно.
 */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '-'
  if (value > 0 && value < 1) return 'меньше 1%'
  if (value > 99 && value < 100) return '99%'
  return `${Math.round(value)}%`
}

/** Заполненная часть полоски: начатое видно сразу, даже когда доля меньше пикселя. */
export function progressBarStyle(value: number | null): CSSProperties {
  return { width: `${value ?? 0}%`, minWidth: value !== null && value > 0 ? 4 : undefined }
}
