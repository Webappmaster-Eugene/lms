'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const EVERY_MS = 3000
const MAX_TRIES = 40

/** Пока Робокасса не прислала уведомление, страница возврата перезапрашивает состояние сама. */
export function PaymentStatusRefresh() {
  const router = useRouter()
  useEffect(() => {
    let tries = 0
    const timer = window.setInterval(() => {
      tries += 1
      if (tries > MAX_TRIES) window.clearInterval(timer)
      else router.refresh()
    }, EVERY_MS)
    return () => window.clearInterval(timer)
  }, [router])
  return null
}
