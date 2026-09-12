import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

/**
 * Сообщает, прошла ли гидратация. Нужен там, где разметка на сервере и на клиенте
 * заведомо расходится: тема оформления, порталы, доступ к window.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
