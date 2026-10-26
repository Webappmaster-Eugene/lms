'use client'

import { useEffect, useState } from 'react'

import { SAVED_NOTICE_PARAM } from '@/lib/content-management/saved-notice'

/** Убирает одноразовый параметр из адреса, чтобы обновление страницы не повторяло подтверждение. */
export function useDropSavedNoticeParam() {
  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has(SAVED_NOTICE_PARAM)) return
    url.searchParams.delete(SAVED_NOTICE_PARAM)
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])
}

/** Подтверждение сохранения на странице, куда форма перешла после записи. */
export function SavedNotice({ text }: { text: string }) {
  // Последующий refresh страницы уже без параметра не должен стирать сообщение.
  const [notice] = useState(text)
  useDropSavedNoticeParam()
  return notice ? <p role="status" className="text-sm text-success">{notice}</p> : null
}
