import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSearchParams } from 'next/navigation'
import { TaskFilters } from '@/components/trainer/TaskFilters'
import { navigationURL, setNavigationURL } from '../helpers/url-navigation'

vi.mock('next/navigation', async () => (await import('../helpers/url-navigation')).urlNavigationMock())
vi.mock('@/components/ui/ShareButton', () => ({ ShareButton: () => <button>Поделиться</button> }))

function RoutedFilters() {
  const params = useSearchParams()
  return <TaskFilters values={{ q: params.get('q') ?? '', language: params.get('language') ?? '', difficulty: params.get('difficulty') ?? '', topic: params.get('topic') ?? '', tag: params.get('tag') ?? '', company: params.get('company') ?? '', status: params.get('status') ?? '', format: params.get('format') ?? '' }} topics={[]} total={8} />
}

describe('выбор формата собеседования', () => {
  beforeEach(() => { setNavigationURL('/trainer/tasks?q=map&language=go&view=compact') })

  it('выбор формата отражается в адресе и сохраняет язык, поиск и остальные параметры ссылки', async () => {
    const user = userEvent.setup()
    render(<RoutedFilters />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Формат собеседования' }), 'debugging')
    const url = new URL(navigationURL(), 'https://learn.example')
    expect(url.searchParams.get('format')).toBe('debugging')
    expect(url.searchParams.get('language')).toBe('go')
    expect(url.searchParams.get('q')).toBe('map')
    expect(url.searchParams.get('view')).toBe('compact')
    expect(screen.getByRole('combobox', { name: 'Формат собеседования' })).toHaveValue('debugging')
  })

  it('клавиатурный сброс удаляет формат вместе с остальными фильтрами, сохраняя параметр вида', async () => {
    const user = userEvent.setup()
    act(() => { setNavigationURL('/trainer/tasks?q=map&language=go&format=algorithms&view=compact') })
    render(<RoutedFilters />)
    const reset = screen.getByRole('button', { name: 'Сбросить' })
    for (let index = 0; index < 15 && document.activeElement !== reset; index++) await user.tab()
    expect(reset).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(navigationURL()).toBe('/trainer/tasks?view=compact')
    expect(screen.getByRole('combobox', { name: 'Формат собеседования' })).toHaveValue('')
    expect(screen.getByRole('searchbox', { name: 'Поиск задач' })).toHaveValue('')
  })

  it('переход по новой ссылке синхронизирует выбранный формат и поисковую строку', () => {
    render(<RoutedFilters />)
    act(() => { setNavigationURL('/trainer/tasks?format=frontend&q=react') })
    expect(screen.getByRole('combobox', { name: 'Формат собеседования' })).toHaveValue('frontend')
    expect(screen.getByRole('searchbox', { name: 'Поиск задач' })).toHaveValue('react')
  })
})
