import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSearchParams } from 'next/navigation'
import { COMPANY_OPTIONS, TAG_OPTIONS } from '@/lib/trainer/constants'
import { TaskFilters } from '@/components/trainer/TaskFilters'
import { navigationRouter, navigationURL, setNavigationURL } from '../helpers/url-navigation'

vi.mock('next/navigation', async () => (await import('../helpers/url-navigation')).urlNavigationMock())
vi.mock('@/components/ui/ShareButton', () => ({ ShareButton: () => null }))

function RoutedFilters() {
  const params = useSearchParams()
  const value = (key: string) => params.get(key) ?? ''
  return <TaskFilters values={{ q: value('q'), language: value('language'), difficulty: value('difficulty'), topic: value('topic'), tag: value('tag'), company: value('company'), status: value('status'), format: value('format') }} topics={[]} total={12} />
}

const query = () => new URL(navigationURL(), 'https://learn.example').searchParams

describe('поиск и редкие фильтры каталога', () => {
  beforeEach(() => {
    setNavigationURL('/trainer/tasks?difficulty=easy')
    vi.clearAllMocks()
  })
  afterEach(() => vi.useRealTimers())

  it('поиск уходит в адрес после паузы в наборе, а не на каждый символ, и без пробелов по краям', async () => {
    vi.useFakeTimers()
    render(<RoutedFilters />)
    const box = screen.getByRole('searchbox', { name: 'Поиск задач' })

    for (const text of ['  d', '  deb', '  debou', '  debounce ']) {
      fireEvent.change(box, { target: { value: text } })
      await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    }
    expect(navigationRouter().replace).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })

    expect(navigationRouter().replace).toHaveBeenCalledOnce()
    expect(query().get('q')).toBe('debounce')
    expect(query().get('difficulty')).toBe('easy')
    expect(screen.getByRole('searchbox', { name: 'Поиск задач' })).toHaveValue('  debounce ')
  })

  it('очищенный поиск убирает параметр из адреса', async () => {
    vi.useFakeTimers()
    setNavigationURL('/trainer/tasks?q=map&difficulty=easy')
    render(<RoutedFilters />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск задач' }), { target: { value: '' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(350) })

    expect(query().has('q')).toBe(false)
    expect(query().get('difficulty')).toBe('easy')
  })

  it('тег и компания отражаются в адресе и в выбранном значении', async () => {
    const user = userEvent.setup()
    const [tag] = TAG_OPTIONS
    const [company] = COMPANY_OPTIONS
    render(<RoutedFilters />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Тег' }), tag.value)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Компания' }), company.value)

    expect(query().get('tag')).toBe(tag.value)
    expect(query().get('company')).toBe(company.value)
    expect(screen.getByRole('combobox', { name: 'Тег' })).toHaveValue(tag.value)
    expect(screen.getByRole('combobox', { name: 'Компания' })).toHaveValue(company.value)
    expect(navigationRouter().replace).toHaveBeenLastCalledWith(expect.any(String), { scroll: false })
  })

  it('счётчик найденных задач объявляется вежливо, не перебивая скринридер', () => {
    render(<RoutedFilters />)

    expect(screen.getByText('Найдено задач: 12')).toHaveAttribute('aria-live', 'polite')
  })
})
