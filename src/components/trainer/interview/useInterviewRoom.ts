'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { InterviewRoom } from '@/lib/trainer/interview'
import type { TrainerLanguage } from '@/lib/trainer/types'

type Snapshot = { room: InterviewRoom; userId: number }
type Draft = { code: string; language: TrainerLanguage }

export function useInterviewRoom(token: string) {
  const [room, setRoom] = useState<InterviewRoom | null>(null)
  const [userId, setUserId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft>({ code: '', language: 'js' })
  const [conflict, setConflict] = useState<InterviewRoom | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const blockedRef = useRef(false)
  const roomRef = useRef<InterviewRoom | null>(null)
  const draftRef = useRef(draft)
  const dirtyRef = useRef(false)
  const conflictRef = useRef<InterviewRoom | null>(null)
  const writing = useRef(false)
  const mounted = useRef(false)
  const controllers = useRef(new Set<AbortController>())

  const request = useCallback(async (method: string, input?: object): Promise<{ status: number; data: Snapshot & { error?: string } }> => {
    const controller = new AbortController()
    controllers.current.add(controller)
    try {
      const response = await fetch(`/api/trainer/interview/${token}`, {
        method, signal: controller.signal, cache: 'no-store',
        ...(input ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } : {}),
      })
      return { status: response.status, data: await response.json() }
    } finally {
      controllers.current.delete(controller)
    }
  }, [token])

  const receive = useCallback((snapshot: Snapshot) => {
    if (!mounted.current) return
    const incoming = snapshot.room
    // Wait for our write response before applying a poll that may contain that write.
    if (writing.current) return
    const current = roomRef.current
    if (current && incoming.version < current.version) return
    setUserId(snapshot.userId)
    if (current && incoming.version !== current.version && (dirtyRef.current || writing.current)) {
      if (incoming.code !== draftRef.current.code || incoming.language !== draftRef.current.language) {
        conflictRef.current = incoming
        setConflict(incoming)
      }
    } else if (!dirtyRef.current && !writing.current) {
      const next = { code: incoming.code, language: incoming.language }
      draftRef.current = next
      setDraft(next)
    }
    roomRef.current = incoming
    setRoom(incoming)
  }, [])

  useEffect(() => {
    mounted.current = true
    let polling = false
    let lastHeartbeat = 0
    async function poll() {
      if (polling || document.hidden || blockedRef.current) return
      polling = true
      try {
        const join = !roomRef.current || Date.now() - lastHeartbeat >= 15_000
        const { status, data } = await request(join ? 'POST' : 'GET', join ? {} : undefined)
        if (status >= 400) {
          if ([401, 403, 404, 410].includes(status)) {
            blockedRef.current = true
            if (mounted.current) setBlocked(true)
          }
          throw new Error(data.error ?? 'Не удалось открыть комнату')
        }
        if (join) lastHeartbeat = Date.now()
        receive(data)
        if (mounted.current && !dirtyRef.current) setError('')
      } catch (cause) {
        if (mounted.current && !(cause instanceof Error && cause.name === 'AbortError')) {
          setError(cause instanceof Error ? cause.message : 'Нет связи с комнатой')
        }
      } finally {
        polling = false
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 2000)
    const visibility = () => { if (!document.hidden) void poll() }
    document.addEventListener('visibilitychange', visibility)
    const activeControllers = controllers.current
    return () => {
      mounted.current = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', visibility)
      for (const controller of activeControllers) controller.abort()
      activeControllers.clear()
    }
  }, [request, receive])

  const edit = useCallback((next: Draft) => {
    draftRef.current = next
    dirtyRef.current = true
    setDraft(next)
    setDirty(true)
    setError('')
  }, [])

  useEffect(() => {
    if (!dirty) return
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const save = useCallback(async (end = false) => {
    const current = roomRef.current
    if (!current || writing.current || blockedRef.current || current.endedAt || (conflictRef.current && !end)) return
    writing.current = true
    setSaving(true)
    const sent = draftRef.current
    try {
      const { status, data } = await request('PATCH', end
        ? { version: current.version, end: true }
        : { version: current.version, ...sent })
      if (!mounted.current) return
      if (status === 409 && data.room) {
        conflictRef.current = data.room
        setConflict(data.room)
        receive(data)
        return
      }
      if (status >= 400) {
        if ([401, 403, 404].includes(status)) {
          blockedRef.current = true
          setBlocked(true)
        }
        throw new Error(data.error ?? 'Не удалось сохранить код')
      }
      // Typing while a save is in flight must remain a new, unsaved draft.
      const unchanged = sent.code === draftRef.current.code && sent.language === draftRef.current.language
      dirtyRef.current = !unchanged
      setDirty(!unchanged)
      roomRef.current = data.room
      setRoom(data.room)
      if (unchanged) {
        draftRef.current = { code: data.room.code, language: data.room.language }
        setDraft(draftRef.current)
      }
      setError('')
    } catch (cause) {
      if (mounted.current && !(cause instanceof Error && cause.name === 'AbortError')) {
        setError(cause instanceof Error ? cause.message : 'Код не сохранён. Повторите попытку')
      }
    } finally {
      writing.current = false
      if (mounted.current) setSaving(false)
    }
  }, [receive, request])

  useEffect(() => {
    if (!dirty || saving || conflict || error || room?.endedAt) return
    const timer = setTimeout(() => void save(), 800)
    return () => clearTimeout(timer)
  }, [draft, dirty, saving, conflict, error, room?.endedAt, save])

  const resolve = useCallback((keepLocal: boolean) => {
    const incoming = conflictRef.current
    if (!incoming) return
    roomRef.current = incoming
    setRoom(incoming)
    conflictRef.current = null
    setConflict(null)
    dirtyRef.current = keepLocal
    setDirty(keepLocal)
    if (!keepLocal) {
      draftRef.current = { code: incoming.code, language: incoming.language }
      setDraft(draftRef.current)
    }
  }, [])

  return { room, userId, draft, conflict, error, saving, dirty, blocked, edit, save, resolve }
}
