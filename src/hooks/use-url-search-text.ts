'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Текст поиска, который с задержкой переносится в адрес страницы. Адрес догоняет ввод
 * позже — у серверного списка только после ответа, — поэтому собственное значение,
 * вернувшееся из адреса, поле не перезаписывает: иначе на медленной сети пропадали
 * символы, набранные за время запроса, и пробел между словами. Чужое изменение адреса
 * (назад, «Сбросить», переход по ссылке) поле принимает.
 */
export function useUrlSearchText(
  fromUrl: string,
  write: (value: string) => void,
  delay = 300,
): [string, (value: string) => void] {
  const [text, setText] = useState(fromUrl)
  const [seen, setSeen] = useState(fromUrl)
  const [written, setWritten] = useState(fromUrl)
  if (fromUrl !== seen) {
    setSeen(fromUrl)
    if (fromUrl !== written) {
      setText(fromUrl)
      setWritten(fromUrl)
    }
  }

  // Запись берёт свежие параметры адреса: фильтр, выбранный во время набора, не теряется.
  const writeRef = useRef(write)
  useEffect(() => { writeRef.current = write })

  useEffect(() => {
    const next = text.trim()
    if (next === written) return
    const timer = setTimeout(() => {
      setWritten(next)
      writeRef.current(next)
    }, delay)
    return () => clearTimeout(timer)
  }, [text, written, delay])

  return [text, setText]
}
