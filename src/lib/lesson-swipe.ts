export type SwipeDirection = 'next' | 'prev'
export type SwipeLesson = { slug: string; title: string }
export type SwipeTarget =
  | { kind: 'video'; index: number }
  | { kind: 'lesson'; slug: string; title: string; edge: 'first' | 'last' }

/** Короче палец сдвигается и при обычном касании. */
const MIN_DISTANCE_PX = 60
/** На широком кадре случайный сдвиг тоже длиннее: ход считаем от ширины видео. */
const MIN_WIDTH_SHARE = 0.25
/** Быстрый рывок засчитывается и короче: так листают ленты. */
const FLICK_DISTANCE_PX = 40
const FLICK_SPEED_PX_PER_MS = 0.5
/** Наклон круче примерно 30° - это прокрутка страницы, а не листание. */
const MAX_SLOPE = 0.6

/** Засчитывается ли движение пальца как листание и в какую сторону. Влево - вперёд, как в ленте. */
export function swipeDirection({ dx, dy, ms, width }: { dx: number; dy: number; ms: number; width: number }): SwipeDirection | null {
  const distance = Math.abs(dx)
  if (distance === 0 || Math.abs(dy) > distance * MAX_SLOPE) return null
  const long = distance >= Math.max(MIN_DISTANCE_PX, width * MIN_WIDTH_SHARE)
  const flick = distance >= FLICK_DISTANCE_PX && ms > 0 && distance / ms >= FLICK_SPEED_PX_PER_MS
  if (!long && !flick) return null
  return dx < 0 ? 'next' : 'prev'
}

/**
 * Сначала видео этого урока по порядку, потом соседний урок.
 * Назад с первого видео ведёт к последнему видео предыдущего урока: листание обратимо.
 */
export function swipeTarget(
  direction: SwipeDirection,
  videoIndex: number,
  videoCount: number,
  previous: SwipeLesson | null,
  next: SwipeLesson | null,
): SwipeTarget | null {
  const index = videoIndex + (direction === 'next' ? 1 : -1)
  if (videoIndex >= 0 && index >= 0 && index < videoCount) return { kind: 'video', index }
  const lesson = direction === 'next' ? next : previous
  if (!lesson) return null
  return { kind: 'lesson', slug: lesson.slug, title: lesson.title, edge: direction === 'next' ? 'first' : 'last' }
}
