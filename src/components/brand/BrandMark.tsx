import { BRAND_COLORS, BRAND_TILE_RADIUS, WORDMARK, brandCut } from '@/lib/brand-mark'

/** Плитка со знаком. Подпись даёт соседний текст, поэтому для чтения с экрана знак скрыт. */
export function BrandMark({ size, className }: { size: number; className?: string }) {
  const cut = brandCut(size)
  const radius = size <= 32 ? BRAND_TILE_RADIUS.small : BRAND_TILE_RADIUS.large
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <rect width="512" height="512" rx={radius} fill={BRAND_COLORS.deep} />
      <path d={cut.oars.join('')} fill={BRAND_COLORS.sail} />
      <path d={cut.bow} fill={BRAND_COLORS.sun} />
    </svg>
  )
}

/** Название в контурах, цвет наследует от текста. Высота задаётся снаружи. */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <svg viewBox={WORDMARK.viewBox} className={className} role="img" aria-label="MentorCareer" fill="currentColor" focusable="false">
      <path d={WORDMARK.d} />
    </svg>
  )
}
