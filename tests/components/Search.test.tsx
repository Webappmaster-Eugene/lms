import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const { SearchBar } = await import('@/components/layout/SearchBar')
const { MobileSearchOverlay } = await import('@/components/layout/MobileSearchOverlay')

/**
 * Поиск по курсам, урокам и роадмапам.
 *
 * Запрос уходит с задержкой: без неё каждая набранная буква даёт три запроса
 * к API, и на длинном названии поиск успевает отправить их десятки.
 */

type Doc = { id: string; title: string; slug: string }

function mockApi({
  roadmaps = [],
  courses = [],
  lessons = [],
  fail = false,
}: { roadmaps?: Doc[]; courses?: Doc[]; lessons?: Doc[]; fail?: boolean } = {}) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (fail) throw new Error('сеть недоступна')
    const url = String(input)
    if (url.includes('/api/roadmaps')) return Response.json({ docs: roadmaps })
    if (url.includes('/api/courses')) return Response.json({ docs: courses })
    return Response.json({ docs: lessons })
  }) as unknown as typeof fetch
}

/** Набирает запрос и дожидается срабатывания задержки. */
async function type(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByRole('textbox'), text)
  await act(async () => {
    vi.advanceTimersByTime(300)
  })
}

describe('строка поиска', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockApi()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('когда запрос уходит', () => {
    it('на короткий запрос в сеть не ходим', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await type(user, 'р')

      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('от двух символов ищем во всех трёх коллекциях', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await type(user, 'ре')

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3))
    })

    it('ищем только по опубликованному — черновики ученику не нужны', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await type(user, 'ре')

      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      for (const [url] of vi.mocked(global.fetch).mock.calls) {
        expect(String(url)).toContain('where[isPublished][equals]=true')
      }
    })

    it('спецсимволы в запросе кодируются', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await type(user, 'c&d')

      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      expect(String(vi.mocked(global.fetch).mock.calls[0][0])).toContain('c%26d')
    })
  })

  describe('результаты', () => {
    const found = {
      roadmaps: [{ id: '1', title: 'Frontend React', slug: 'frontend-react' }],
      courses: [{ id: '2', title: 'Глубокий React', slug: 'deep-react' }],
      lessons: [{ id: '3', title: 'Хуки React', slug: 'hooks' }],
    }

    it('показываются все три вида с подписями', async () => {
      mockApi(found)
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await type(user, 'react')

      expect(await screen.findByText('Frontend React')).toBeInTheDocument()
      expect(screen.getByText('Роадмап')).toBeInTheDocument()
      expect(screen.getByText('Курс')).toBeInTheDocument()
      expect(screen.getByText('Урок')).toBeInTheDocument()
    })

    it('пустой результат выпадашку не открывает', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await type(user, 'ничего')

      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('отказ сети не ломает строку поиска', async () => {
      mockApi({ fail: true })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await type(user, 'react')

      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })
  })

  describe('переход по результату', () => {
    const courses = [{ id: '2', title: 'Глубокий React', slug: 'deep-react' }]

    it.each([
      ['roadmaps', '/roadmaps/deep-react'],
      ['courses', '/courses/deep-react'],
      ['lessons', '/lessons/deep-react'],
    ])('результат из %s ведёт на %s', async (collection, expected) => {
      mockApi({ [collection]: courses } as Record<string, Doc[]>)
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await type(user, 'react')
      await user.click(await screen.findByRole('button'))

      expect(push).toHaveBeenCalledWith(expected)
    })

    it('после перехода строка очищается', async () => {
      mockApi({ courses })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await type(user, 'react')
      await user.click(await screen.findByRole('button'))

      expect(screen.getByRole('textbox')).toHaveValue('')
    })

    it('сообщает о переходе наружу — так закрывается мобильный поиск', async () => {
      mockApi({ courses })
      const onNavigate = vi.fn()
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar onNavigate={onNavigate} />)

      await type(user, 'react')
      await user.click(await screen.findByRole('button'))

      expect(onNavigate).toHaveBeenCalled()
    })
  })
})

describe('мобильный поиск', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi()
  })

  it('по умолчанию свёрнут в иконку', () => {
    render(<MobileSearchOverlay />)

    expect(screen.getByRole('button', { name: 'Поиск' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('открывается на весь экран', async () => {
    const user = userEvent.setup()
    render(<MobileSearchOverlay />)

    await user.click(screen.getByRole('button', { name: 'Поиск' }))

    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('закрывается крестиком', async () => {
    const user = userEvent.setup()
    render(<MobileSearchOverlay />)

    await user.click(screen.getByRole('button', { name: 'Поиск' }))
    await user.click(screen.getByRole('button', { name: 'Закрыть поиск' }))

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('закрывается по Escape', async () => {
    const user = userEvent.setup()
    render(<MobileSearchOverlay />)

    await user.click(screen.getByRole('button', { name: 'Поиск' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('поле получает фокус сразу — иначе на телефоне нужен лишний тап', async () => {
    const user = userEvent.setup()
    render(<MobileSearchOverlay />)

    await user.click(screen.getByRole('button', { name: 'Поиск' }))

    expect(screen.getByRole('textbox')).toHaveFocus()
  })
})
