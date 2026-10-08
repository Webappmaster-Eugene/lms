'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { readVideoPositions, type LearningState, type VideoPosition, type VideoPositions } from '@/lib/learning-state'

export const learningStorageKey = (userId: number, lessonId: number, videoId: string) => `lms:learning:${userId}:${lessonId}:${videoId}`

export function readLocalLearningPosition(key: string): VideoPosition | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw ? readVideoPositions({ position: JSON.parse(raw) }).position : undefined
  } catch (error) {
    console.warn('Не удалось прочитать место остановки на устройстве', error)
    return undefined
  }
}

export function saveLocalLearningPosition(key: string, position: VideoPosition) {
  try { localStorage.setItem(key, JSON.stringify(position)) }
  catch (error) { console.warn('Не удалось сохранить место остановки на устройстве', error) }
}

type LearningContext = {
  userId: number
  lessonId: number
  ready: boolean
  positions: VideoPositions
  save: (videoId: string, position: VideoPosition, keepalive?: boolean) => void
}

const Context = createContext<LearningContext | null>(null)
export const useLessonLearning = () => useContext(Context)

type Props = { lessonId: number; userId: number; children: ReactNode }

export function LessonLearningProvider({ lessonId, userId, children }: Props) {
  const [ready, setReady] = useState(false)
  const [positions, setPositions] = useState<VideoPositions>({})
  const [status, setStatus] = useState<'loading' | 'saved' | 'offline' | 'auth'>('loading')
  const mounted = useRef(false)
  const pending = useRef(new Map<string, VideoPosition>())
  const pendingOpenAt = useRef<number | null>(null)
  const observedOpenAt = useRef<number | null>(null)

  const persist = useCallback(async (body: Record<string, unknown>, keepalive = false) => {
    try {
      const result = await fetch('/api/learning-state', {
        method: 'POST', credentials: 'same-origin', keepalive,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, lessonId, expectedUserId: userId }),
      })
      if (!result.ok) {
        if (mounted.current) setStatus(result.status === 401 || result.status === 403 ? 'auth' : 'offline')
        return false
      }
      const state = await result.json() as LearningState
      if (state.userId !== userId) { if (mounted.current) setStatus('auth'); return false }
      if (mounted.current) setStatus('saved')
      return true
    } catch (error) {
      console.warn('Место остановки сохранено на устройстве; сервер недоступен', error)
      if (mounted.current) setStatus('offline')
      return false
    }
  }, [lessonId, userId])

  const save = useCallback((videoId: string, position: VideoPosition, keepalive = false) => {
    pending.current.set(videoId, position)
    void persist({ videoId, ...position }, keepalive).then((saved) => {
      if (saved && pending.current.get(videoId) === position) pending.current.delete(videoId)
    })
  }, [persist])

  useEffect(() => {
    mounted.current = true
    if (document.visibilityState !== 'hidden') observedOpenAt.current ??= Date.now()
    const controller = new AbortController()
    let alive = true
    let opened = false
    const open = () => {
      if (opened || document.visibilityState === 'hidden') return
      opened = true
      observedOpenAt.current ??= Date.now()
      const at = observedOpenAt.current
      pendingOpenAt.current = at
      void persist({ at }).then((saved) => { if (saved && pendingOpenAt.current === at) pendingOpenAt.current = null })
    }
    void fetch(`/api/learning-state?lessonId=${lessonId}&expectedUserId=${userId}`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        const state = await response.json() as LearningState
        if (state.userId !== userId) throw new Error('401')
        if (alive && mounted.current) { setPositions(readVideoPositions(state.positions)); setStatus('saved') }
      })
      .catch((error: unknown) => {
        if (!alive || controller.signal.aborted) return
        console.warn('Место остановки пока доступно только на устройстве', error)
        if (alive && mounted.current) setStatus(error instanceof Error && ['401', '403'].includes(error.message) ? 'auth' : 'offline')
      })
      .finally(() => { if (alive && !controller.signal.aborted && mounted.current) { setReady(true); open() } })
    const retry = () => {
      const at = pendingOpenAt.current
      if (at !== null) void persist({ at }).then((saved) => { if (saved && pendingOpenAt.current === at) pendingOpenAt.current = null })
      for (const [videoId, position] of pending.current) save(videoId, position)
    }
    document.addEventListener('visibilitychange', open)
    window.addEventListener('online', retry)
    return () => {
      alive = false
      mounted.current = false
      controller.abort()
      document.removeEventListener('visibilitychange', open)
      window.removeEventListener('online', retry)
    }
  }, [lessonId, userId, persist, save])

  const context = useMemo(() => ({ lessonId, userId, ready, positions, save }), [lessonId, userId, ready, positions, save])
  return (
    <Context.Provider value={context}>
      <p role="status" className="text-xs text-muted-foreground">
        {status === 'loading' ? 'Загружаем место остановки…' : status === 'auth' ? 'Для синхронизации места остановки войдите в аккаунт снова.' : status === 'offline' ? 'Место остановки сохранено на этом устройстве. Синхронизируем, когда соединение восстановится.' : 'Место остановки сохраняется в аккаунте — можно продолжить с другого устройства.'}
      </p>
      {children}
    </Context.Provider>
  )
}
