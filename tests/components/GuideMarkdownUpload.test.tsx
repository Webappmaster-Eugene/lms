import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** Значения полей формы Payload, которые выставил компонент: ровно то, что сохранит автор. */
const form = vi.hoisted(() => ({ values: {} as Record<string, unknown> }))
vi.mock('@payloadcms/ui', () => ({
  useField: ({ path }: { path: string }) => ({ value: form.values[path], setValue: (value: unknown) => { form.values[path] = value } }),
  Button: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => <button type="button" onClick={onClick}>{children}</button>,
}))

const { GuideMarkdownUpload } = await import('@/components/guides/GuideMarkdownUpload')

const categories = [{ id: 3, slug: 'career', title: 'Карьера' }, { id: 4, slug: 'tools', title: ' Инструменты ' }]
let requests: { url: string; credentials?: RequestCredentials }[] = []

function mockCategories(respond: () => Response = () => Response.json({ docs: categories })) {
  requests = []
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(url), credentials: init?.credentials })
    return respond()
  }))
}

function setup() {
  const { container } = render(<GuideMarkdownUpload />)
  const input = container.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement
  return { input }
}

const markdownFile = (text: string, name = 'guide.md') => new File([text], name, { type: 'text/markdown' })

async function upload(text: string, name?: string) {
  const { input } = setup()
  await userEvent.upload(input, markdownFile(text, name))
  return screen.findByRole('status')
}

beforeEach(() => {
  form.values = {}
  mockCategories()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('загрузка .md-файла гайда в CMS', () => {
  it('кнопка открывает выбор Markdown-файла', async () => {
    const { input } = setup()
    const opened = vi.fn()
    input.addEventListener('click', opened)
    await userEvent.click(screen.getByRole('button', { name: 'Загрузить .md' }))
    expect(opened).toHaveBeenCalledOnce()
    expect(input).toHaveAttribute('accept', '.md,.markdown,text/markdown,text/plain')
  })

  it('шапка файла раскладывается по полям формы, текст — в поле Markdown', async () => {
    const status = await upload([
      '---',
      'title: VPN для работы',
      'summary: "Как настроить: шаг за шагом"',
      'slug: vpn',
      'order: 3',
      'published: true',
      'category: career',
      'reviewed: 2026-10-01',
      'review_by: 2026-12-01',
      '---',
      '',
      '## Установка',
      '',
      'Скачайте клиент.',
    ].join('\n'), 'vpn.md')

    expect(status).toHaveTextContent('«vpn.md»: заполнены текст, название, описание, slug, порядок, публикация, категория, дата проверки. Проверьте и сохраните гайд.')
    expect(form.values).toEqual({
      markdown: '## Установка\n\nСкачайте клиент.',
      title: 'VPN для работы',
      summary: 'Как настроить: шаг за шагом',
      slug: 'vpn',
      order: 3,
      isPublished: true,
      category: 3,
      reviewedAt: '2026-10-01T12:00:00.000Z',
      reviewBy: '2026-12-01T12:00:00.000Z',
    })
    expect(requests).toEqual([{ url: '/api/guide-categories?limit=1000&depth=0', credentials: 'same-origin' }])
  })

  it('файл без шапки: заголовок # становится названием, остальные поля не трогаются', async () => {
    form.values = { slug: 'old-slug', isPublished: false }
    const status = await upload('# Как вести резюме\n\nТекст гайда.')
    expect(status).toHaveTextContent('заполнены текст, название.')
    expect(form.values).toEqual({ markdown: 'Текст гайда.', title: 'Как вести резюме', slug: 'old-slug', isPublished: false })
    expect(requests).toHaveLength(0)
  })

  it('категорию находит и по названию без учёта регистра и пробелов', async () => {
    await upload('---\ncategory: инструменты\n---\nТекст')
    expect(form.values.category).toBe(4)
  })

  it('новая дата проверки сбрасывает старый срок пересмотра — его пересчитает сервер', async () => {
    form.values = { reviewBy: '2026-01-01T12:00:00.000Z' }
    await upload('---\nreviewed: 2026-10-22\n---\nТекст')
    expect(form.values.reviewedAt).toBe('2026-10-22T12:00:00.000Z')
    expect(form.values.reviewBy).toBeNull()
  })

  it('только срок пересмотра без даты проверки меняет один срок', async () => {
    const status = await upload('---\nreview_by: 2027-01-15\n---\nТекст')
    expect(form.values).toEqual({ markdown: 'Текст', reviewBy: '2027-01-15T12:00:00.000Z' })
    expect(status).toHaveTextContent('заполнены текст, срок пересмотра.')
  })

  it('неизвестная категория — ошибка с подсказкой, поле категории не меняется', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const status = await upload('---\ncategory: Финансы \n---\nТекст', 'money.md')
    expect(status).toHaveTextContent('Не удалось прочитать «money.md»: категории «Финансы» нет — создайте её и выберите вручную')
    expect(form.values.category).toBeUndefined()
  })

  // Остальные ошибки разбора (дата, пустой текст, размер) форму не трогают, и сообщение «Не удалось
  // прочитать» обещает то же. Здесь же текст и название уже заменены до запроса категорий, а даты
  // проверки, которые идут после него, молча теряются. Снять .fails, когда категория будет
  // разрешаться до записи полей.
  it.fails('ненайденная категория не оставляет форму заполненной наполовину — дефект: текст и название уже заменены, даты проверки потеряны', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    form.values = { markdown: 'Старый текст', title: 'Старое название' }
    await upload('---\ntitle: Новое название\ncategory: Финансы\nreviewed: 2026-10-22\n---\nНовый текст')
    expect(form.values).toEqual({ markdown: 'Старый текст', title: 'Старое название' })
  })

  it('сбой загрузки справочника категорий показывается автору', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCategories(() => new Response(null, { status: 500 }))
    const status = await upload('---\ncategory: career\n---\nТекст')
    expect(status).toHaveTextContent('Не удалось прочитать «guide.md»: не удалось загрузить список категорий')
  })

  it('пустой ответ справочника означает, что категории нет', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCategories(() => Response.json({}))
    const status = await upload('---\ncategory: career\n---\nТекст')
    expect(status).toHaveTextContent('категории «career» нет')
  })

  it('неверная дата в шапке останавливает загрузку: ни одно поле не меняется', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const status = await upload('---\ntitle: Гайд\nreviewed: 22.10.2026\n---\nТекст')
    expect(status).toHaveTextContent('Не удалось прочитать «guide.md»: в шапке reviewed: «22.10.2026» — нужна дата вида 2026-10-22')
    expect(form.values).toEqual({})
    expect(log).toHaveBeenCalledWith('Не удалось прочитать .md-файл гайда', expect.any(Error))
  })

  it('файл без текста гайда отклоняется', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const status = await upload('---\ntitle: Пустой\n---\n\n   \n')
    expect(status).toHaveTextContent('в файле нет текста гайда')
    expect(form.values).toEqual({})
  })

  it('файл больше мегабайта не читается', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { input } = setup()
    const file = markdownFile('Текст', 'архив.md')
    Object.defineProperty(file, 'size', { value: 1_000_001 })
    await userEvent.upload(input, file)
    expect(await screen.findByRole('status')).toHaveTextContent('Не удалось прочитать «архив.md»: файл больше 1 МБ')
    expect(form.values).toEqual({})
  })

  it('нечитаемый файл и сбой без объекта ошибки описываются понятно', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { input } = setup()
    const file = markdownFile('Текст', 'битый.md')
    Object.defineProperty(file, 'text', { value: () => Promise.reject('NotReadableError') })
    await userEvent.upload(input, file)
    expect(await screen.findByRole('status')).toHaveTextContent('Не удалось прочитать «битый.md»: неизвестная ошибка')
  })

  it('закрытый без выбора диалог ничего не меняет', () => {
    const { input } = setup()
    fireEvent.change(input, { target: { files: [] } })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(form.values).toEqual({})
  })

  it('тот же файл можно выбрать повторно после правки на диске', async () => {
    const { input } = setup()
    await userEvent.upload(input, markdownFile('Первая версия'))
    await waitFor(() => expect(form.values.markdown).toBe('Первая версия'))
    expect(input.value).toBe('')
  })
})
