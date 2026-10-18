import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { answerAll, committedURL, navigateTo, PendingPage, pendingRouter as router, resetPendingNavigation } from '../helpers/pending-navigation'

vi.mock('next/navigation', async () => (await import('../helpers/pending-navigation')).pendingNavigationMock('/trainer/tasks'))
vi.mock('@/components/ui/ShareButton', () => ({ ShareButton: () => null }))

const { TaskFilters } = await import('@/components/trainer/TaskFilters')

/** Список задач фильтрует сервер, и на телефоне его ответ приходит через секунду и дольше. */
function Page({ initial = '/trainer/tasks' }: { initial?: string }) {
  return (
    <PendingPage initial={initial}>
      {(params) => {
        const value = (key: string) => params.get(key) ?? ''
        return <TaskFilters values={{ q: value('q'), language: value('language'), difficulty: value('difficulty'), tag: value('tag'), company: value('company'), topic: value('topic'), status: value('status'), format: value('format') }} topics={[]} total={params.size} />
      }}
    </PendingPage>
  )
}

async function serverAnswers() {
  await act(async () => { answerAll() })
}

beforeEach(() => resetPendingNavigation())

describe('фильтры тренажёра до ответа сервера', () => {
  it('выбор виден сразу, а вместо счётчика — «Обновляем список…»', async () => {
    render(<Page />)
    await act(async () => { fireEvent.change(screen.getByRole('combobox', { name: 'Сложность' }), { target: { value: 'easy' } }) })

    expect(screen.getByRole('combobox', { name: 'Сложность' })).toHaveValue('easy')
    expect(screen.getByText('Обновляем список…')).toBeInTheDocument()
    expect(committedURL()).toBe('/trainer/tasks')

    await serverAnswers()
    expect(committedURL()).toBe('/trainer/tasks?difficulty=easy')
    expect(screen.getByRole('combobox', { name: 'Сложность' })).toHaveValue('easy')
    expect(screen.getByText('Найдено задач: 1')).toBeInTheDocument()
  })

  it('второй быстрый выбор не стирает первый, ещё не подтверждённый сервером', async () => {
    render(<Page />)
    await act(async () => { fireEvent.change(screen.getByRole('combobox', { name: 'Сложность' }), { target: { value: 'easy' } }) })
    await act(async () => { fireEvent.change(screen.getByRole('combobox', { name: 'Язык' }), { target: { value: 'ts' } }) })

    expect(router.replace).toHaveBeenLastCalledWith('/trainer/tasks?difficulty=easy&language=ts', { scroll: false })
    await serverAnswers()
    expect(screen.getByRole('combobox', { name: 'Сложность' })).toHaveValue('easy')
    expect(screen.getByRole('combobox', { name: 'Язык' })).toHaveValue('ts')
  })

  it('«Сбросить» и переход по ссылке меняют текст поиска', async () => {
    render(<Page initial="/trainer/tasks?q=map&difficulty=easy" />)
    const box = screen.getByRole('searchbox', { name: 'Поиск задач' })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Сбросить' })) })
    expect(screen.getByRole('combobox', { name: 'Сложность' })).toHaveValue('')
    await serverAnswers()
    expect(committedURL()).toBe('/trainer/tasks')
    expect(box).toHaveValue('')
    await act(async () => { navigateTo('/trainer/tasks?q=react') })
    await serverAnswers()
    expect(box).toHaveValue('react')
  })
})
