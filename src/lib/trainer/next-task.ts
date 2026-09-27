/**
 * Куда вести ученика после решения: ближайшая нерешённая задача темы после
 * текущей, а если дальше всё решено — первая нерешённая с начала темы.
 * Соседняя по порядку задача может быть уже решена, и кнопка «дальше» тогда
 * гоняла бы по пройденному.
 */
export function nextUnsolvedTask<T extends { id: string | number }>(
  ordered: T[],
  currentId: string | number,
  solved: Set<string>,
): T | null {
  const current = ordered.findIndex((t) => String(t.id) === String(currentId))
  const isOpen = (t: T) => String(t.id) !== String(currentId) && !solved.has(String(t.id))
  return ordered.slice(current + 1).find(isOpen) ?? ordered.slice(0, Math.max(current, 0)).find(isOpen) ?? null
}
