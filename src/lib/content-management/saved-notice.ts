/**
 * После сохранения форма уходит на другую страницу (новый урок, программа курса), где её
 * состояния уже нет, поэтому подтверждение передаётся через адрес.
 */
export const SAVED_NOTICE_PARAM = 'saved'

const notices = {
  lessons: { draft: 'Черновик урока сохранён.', published: 'Урок опубликован.' },
  courses: { draft: 'Черновик курса сохранён. Теперь добавьте разделы и уроки в программу.', published: 'Курс опубликован.' },
} as const

type Collection = keyof typeof notices
type State = keyof (typeof notices)[Collection]

const stateOf = (published: boolean | null | undefined): State => published ? 'published' : 'draft'

export function savedNotice(collection: Collection, published: boolean | null | undefined): string {
  return notices[collection][stateOf(published)]
}

export function savedNoticeHref(path: string, published: boolean | null | undefined): string {
  return `${path}?${SAVED_NOTICE_PARAM}=${stateOf(published)}`
}

/** Из адреса берётся только известный код: произвольный текст в сообщение не попадает. */
export function savedNoticeFromQuery(collection: Collection, value: unknown): string {
  return value === 'draft' || value === 'published' ? notices[collection][value] : ''
}
