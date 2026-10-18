import { createContext, use, useContext, useEffect, useMemo, useState } from 'react'
import { vi } from 'vitest'

/**
 * Навигация Next с ответом сервера, который приходит не сразу: router.replace запускает
 * переход, приостановленный до ответа, а searchParams меняются только после него.
 * Страница, которая фильтрует на сервере, должна давать отклик и в этом промежутке.
 */
const SearchParamsContext = createContext(new URLSearchParams())
const answers: Array<() => void> = []
const state = { committed: '', start: (url: string): void => { throw new Error(`Навигация на ${url} до монтирования PendingPage`) } }

export const pendingRouter = { replace: vi.fn((url: string) => state.start(url)), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }

export function pendingNavigationMock(pathname: string) {
  return { useRouter: () => pendingRouter, usePathname: () => pathname, useSearchParams: () => useContext(SearchParamsContext) }
}

/** Адрес, который пользователь уже видит. */
export function committedURL() { return state.committed }

export function navigateTo(url: string) { state.start(url) }

/** Сервер отвечает на все запрошенные переходы. */
export function answerAll() { for (const answer of answers.splice(0)) answer() }

export function resetPendingNavigation() {
  answers.splice(0)
  pendingRouter.replace.mockClear()
}

export function PendingPage({ initial, children }: { initial: string; children: (params: URLSearchParams) => React.ReactNode }) {
  const [navigation, setNavigation] = useState<{ url: string; answer: Promise<void> | null }>({ url: initial, answer: null })
  useEffect(() => {
    state.start = (url) => setNavigation({ url, answer: new Promise<void>((resolve) => answers.push(resolve)) })
  }, [])
  if (navigation.answer) use(navigation.answer)
  useEffect(() => { state.committed = navigation.url }, [navigation.url])
  const params = useMemo(() => new URL(navigation.url, 'https://learn.example').searchParams, [navigation.url])
  return <SearchParamsContext.Provider value={params}>{children(params)}</SearchParamsContext.Provider>
}
