'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'

const subscribe = () => () => {}
const canObserve = () => typeof IntersectionObserver !== 'undefined'

/**
 * Становится true, когда элемент подошёл к экрану, и больше не сбрасывается:
 * файл в конце длинной страницы незачем качать при её открытии.
 * Браузер без IntersectionObserver считает элемент видимым сразу.
 */
export function useNearViewport<T extends Element>(rootMargin = '400px 0px'): [RefObject<T | null>, boolean] {
  const target = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  // На сервере наблюдателя нет никогда. Считаем там, что он есть: иначе сервер рисовал бы
  // элемент видимым, браузер — невидимым, и гидрация падала бы на расхождении разметки.
  const observes = useSyncExternalStore(subscribe, canObserve, () => true)
  useEffect(() => {
    const element = target.current
    if (seen || !element || !observes) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setSeen(true)
    }, { rootMargin })
    observer.observe(element)
    return () => observer.disconnect()
  }, [observes, seen, rootMargin])
  return [target, seen || !observes]
}
