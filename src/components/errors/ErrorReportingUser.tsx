'use client'

import { useEffect } from 'react'
import { setUser } from '@sentry/nextjs'

/** Привязывает отчёты браузера к id ученика — без имени и почты. */
export function ErrorReportingUser({ userId }: { userId: number }) {
  useEffect(() => {
    setUser({ id: userId })
    return () => setUser(null)
  }, [userId])

  return null
}
