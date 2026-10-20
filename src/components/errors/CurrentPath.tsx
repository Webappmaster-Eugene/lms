'use client'

import { usePathname } from 'next/navigation'

/** Адрес, который не нашёлся: not-found рендерится на сервере и пути не получает. */
export function CurrentPath({ fallback = '/' }: { fallback?: string }) {
  const pathname = usePathname()
  return <>{pathname ? decodeSafely(pathname) : fallback}</>
}

function decodeSafely(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
