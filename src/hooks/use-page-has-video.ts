import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}
const getSnapshot = () => document.querySelector('video') !== null
const getServerSnapshot = () => false

/**
 * Есть ли на странице видео урока. Плеер рисуется рядом, а не внутри
 * вызывающего компонента, поэтому смотрим в документ; проверка повторяется
 * при каждой перерисовке и подхватывает плеер, появившийся позже.
 */
export function usePageHasVideo(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
