/**
 * Уведомления «Ответ на ваш вопрос» отмечаются прочитанными, когда ученик
 * увидел ответ — в ветке урока или в «Моих вопросах». Иначе они висят на
 * дашборде и в колокольчике уже после того, как ответ прочитан.
 *
 * `linkPart` сужает выборку: `/lessons/<slug>#comment-` — ответы в этом уроке,
 * `/lessons/` — все ответы ученику (уведомления ментору ведут в /admin/questions).
 * Чужие уведомления не задеваются: право на правку — только своих.
 */
export async function markAnswersRead(linkPart: string): Promise<void> {
  const where = [
    'where[type][equals]=comment',
    'where[isRead][equals]=false',
    `where[link][like]=${encodeURIComponent(linkPart)}`,
  ].join('&')
  try {
    const res = await fetch(`/api/notifications?${where}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ isRead: true }),
    })
    if (!res.ok) throw new Error(`PATCH /api/notifications → ${res.status}`)
  } catch (error) {
    // Не критично: ответ ученик уже видит, уведомление просто останется непрочитанным.
    console.warn('Не удалось отметить ответы прочитанными', error)
  }
}
