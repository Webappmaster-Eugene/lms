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

type Doc = { id: string; title: string; slug: string; topic?: { slug: string } | number }

function mockApi({
  roadmaps = [],
  courses = [],
  lessons = [],
  tasks = [],
  fail = false,
}: { roadmaps?: Doc[]; courses?: Doc[]; lessons?: Doc[]; tasks?: Doc[]; fail?: boolean } = {}) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (fail) throw new Error('сеть недоступна')
    const url = String(input)
    if (url.includes('/api/roadmaps')) return Response.json({ docs: roadmaps })
    if (url.includes('/api/courses')) return Response.json({ docs: courses })
    if (url.includes('/api/trainer-tasks')) return Response.json({ docs: tasks })
    return Response.json({ docs: lessons })
  }) as unknown as typeof fetch
}

const input = () => screen.getByRole('combobox')

/** Набирает запрос и дожидается срабатывания задержки. */
async function type(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(input(), text)
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

    it('от двух символов ищем в роадмапах, курсах, уроках и задачах тренажёра', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await type(user, 'ре')

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4))
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

    it('пустой результат прямо так и называется', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await type(user, 'ничего')

      expect(await screen.findByRole('status')).toHaveTextContent('По запросу «ничего» ничего не нашлось')
      expect(screen.queryByRole('option')).not.toBeInTheDocument()
    })

    it('отказ сети виден и не ломает строку поиска', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockApi({ fail: true })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await type(user, 'react')

      expect(await screen.findByRole('status')).toHaveTextContent('Поиск сейчас недоступен')
      expect(error).toHaveBeenCalled()
      expect(input()).toBeInTheDocument()
    })

    it('ответ сервера с ошибкой — тоже отказ, а не «ничего не нашлось»', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      global.fetch = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await type(user, 'react')

      expect(await screen.findByRole('status')).toHaveTextContent('Поиск сейчас недоступен')
    })

    it('задача без темы в выдачу не попадает — ссылку на неё не собрать', async () => {
      mockApi({ tasks: [{ id: '9', title: 'Сумма', slug: 'sum', topic: 4 }] })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await type(user, 'сумма')

      expect(await screen.findByRole('status')).toBeInTheDocument()
    })

    it('медленный ответ на старый запрос не затирает свежий', async () => {
      const resolvers: Array<() => void> = []
      global.fetch = vi.fn(
        (input: RequestInfo | URL) =>
          new Promise<Response>((resolve) => {
            const url = String(input)
            const title = url.includes('react') ? 'Свежий' : 'Старый'
            const docs = url.includes('/api/courses') ? [{ id: title, title, slug: title }] : []
            resolvers.push(() => resolve(Response.json({ docs })))
          }),
      ) as unknown as typeof fetch
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await type(user, 're')
      await type(user, 'act')
      await waitFor(() => expect(resolvers).toHaveLength(8))
      await act(async () => {
        resolvers.slice(4).forEach((r) => r())
      })
      await act(async () => {
        resolvers.slice(0, 4).forEach((r) => r())
      })

      expect(screen.getByRole('option', { name: /Свежий/ })).toBeInTheDocument()
      expect(screen.queryByRole('option', { name: /Старый/ })).not.toBeInTheDocument()
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
      await user.click(await screen.findByRole('option'))

      expect(push).toHaveBeenCalledWith(expected)
    })

    it('задача тренажёра ведёт в свою тему', async () => {
      mockApi({ tasks: [{ id: '9', title: 'Сумма', slug: 'sum', topic: { slug: 'functions' } }] })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await type(user, 'сумма')
      await user.click(await screen.findByRole('option', { name: /Задача тренажёра/ }))

      expect(push).toHaveBeenCalledWith('/trainer/functions/sum')
    })

    it('после перехода строка очищается', async () => {
      mockApi({ courses })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await type(user, 'react')
      await user.click(await screen.findByRole('option'))

      expect(input()).toHaveValue('')
    })

    it('сообщает о переходе наружу — так закрывается мобильный поиск', async () => {
      mockApi({ courses })
      const onNavigate = vi.fn()
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar onNavigate={onNavigate} />)

      await type(user, 'react')
      await user.click(await screen.findByRole('option'))

      expect(onNavigate).toHaveBeenCalled()
    })
  })

  describe('клавиатура', () => {
    const found = {
      courses: [
        { id: '1', title: 'Первый', slug: 'first' },
        { id: '2', title: 'Второй', slug: 'second' },
      ],
    }

    it('Enter без выбора открывает первый результат', async () => {
      mockApi(found)
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await type(user, 'курс')
      await screen.findAllByRole('option')
      await user.keyboard('{Enter}')

      expect(push).toHaveBeenCalledWith('/courses/first')
    })

    it('стрелки двигают выбор по кругу, Enter открывает выбранный', async () => {
      mockApi(found)
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await type(user, 'курс')
      await screen.findAllByRole('option')
      await user.keyboard('{ArrowDown}{ArrowDown}')

      expect(screen.getByRole('option', { name: /Второй/ })).toHaveAttribute('aria-selected', 'true')
      expect(input().getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: /Второй/ }).id)

      await user.keyboard('{ArrowDown}{Enter}')
      expect(push).toHaveBeenCalledWith('/courses/first')
    })

    it('Escape закрывает выпадашку, не стирая запрос', async () => {
      mockApi(found)
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await type(user, 'курс')
      await screen.findAllByRole('option')
      await user.keyboard('{Escape}')

      expect(screen.queryByRole('option')).not.toBeInTheDocument()
      expect(input()).toHaveValue('курс')
      expect(input()).toHaveAttribute('aria-expanded', 'false')
    })
  })

  describe('горячие клавиши', () => {
    it('«/» ставит фокус в поиск', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar hotkey />)

      await user.keyboard('/')

      expect(input()).toHaveFocus()
      expect(input()).toHaveValue('')
    })

    it('Ctrl+K ставит фокус в поиск', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar hotkey />)

      await user.keyboard('{Control>}k{/Control}')

      expect(input()).toHaveFocus()
    })

    it('«/» в другом поле остаётся символом', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(
        <>
          <textarea aria-label="Заметка" />
          <SearchBar hotkey />
        </>,
      )

      await user.type(screen.getByRole('textbox', { name: 'Заметка' }), 'a/b')

      expect(screen.getByRole('textbox', { name: 'Заметка' })).toHaveValue('a/b')
      expect(input()).not.toHaveFocus()
    })

    it('без hotkey клавиши не перехватываются', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<SearchBar />)

      await user.keyboard('/')

      expect(input()).not.toHaveFocus()
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
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('открывается на весь экран', async () => {
    const user = userEvent.setup()
    render(<MobileSearchOverlay />)

    await user.click(screen.getByRole('button', { name: 'Поиск' }))

    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('закрывается крестиком', async () => {
    const user = userEvent.setup()
    render(<MobileSearchOverlay />)

    await user.click(screen.getByRole('button', { name: 'Поиск' }))
    await user.click(screen.getByRole('button', { name: 'Закрыть поиск' }))

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('закрывается по Escape', async () => {
    const user = userEvent.setup()
    render(<MobileSearchOverlay />)

    await user.click(screen.getByRole('button', { name: 'Поиск' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('поле получает фокус сразу — иначе на телефоне нужен лишний тап', async () => {
    const user = userEvent.setup()
    render(<MobileSearchOverlay />)

    await user.click(screen.getByRole('button', { name: 'Поиск' }))

    expect(screen.getByRole('combobox')).toHaveFocus()
  })
})
