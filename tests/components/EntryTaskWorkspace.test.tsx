import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/components/trainer/CodeEditor', () => ({ CodeEditor: ({ value, onChange, ariaLabel }: { value: string; onChange: (code: string) => void; ariaLabel: string }) => <textarea aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)} /> }))
const { EntryTaskWorkspace } = await import('@/components/bootcamp/EntryTaskWorkspace')

const token = 'A'.repeat(32)
const tasks = [{ slug: 'price', title: 'Стоимость аренды', starterCode: 'function rentalPrice() {}', testCount: 7, description: <p>Посчитайте стоимость.</p> }]
const accepted = (submissionsLeft: number) => Response.json({ passed: 7, total: 7, submissionsLeft, tasks: [{ slug: 'price', title: 'Стоимость аренды', attempted: true, passed: 7, total: 7 }] })

function renderWorkspace(props: { submissionsLeft: number, lastSubmission?: { at: string, passed: number, total: number } | null }) {
  return render(<EntryTaskWorkspace token={token} tasks={tasks} saved={{ price: 'function rentalPrice() { return 1 }' }} lastSubmission={props.lastSubmission ?? null} maxSubmissions={3} submissionsLeft={props.submissionsLeft} reviewDays={5} />)
}

beforeEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('отправка входного задания', () => {
  it('называет предел и после отправки говорит, сколько отправок осталось', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => accepted(2)))
    renderWorkspace({ submissionsLeft: 3 })
    expect(screen.getByText(/Всего у вас 3 отправки, мы посмотрим последнюю/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Отправить решение' }))
    expect(await screen.findByText(/Решение отправлено. Пройдено 7 из 7 тестов/)).toBeInTheDocument()
    expect(screen.getByText(/осталось отправок: 2/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Отправить решение' })).toBeInTheDocument()
  })

  it('после последней отправки кнопки нет', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => accepted(0)))
    renderWorkspace({ submissionsLeft: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Отправить решение' }))
    expect(await screen.findByText(/Это была последняя отправка/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отправить решение' })).not.toBeInTheDocument()
  })

  it('когда отправки кончились, вместо кнопки объясняет, что дальше', () => {
    renderWorkspace({ submissionsLeft: 0, lastSubmission: { at: '2026-10-30T15:50:00Z', passed: 19, total: 19 } })
    expect(screen.queryByRole('button', { name: 'Отправить решение' })).not.toBeInTheDocument()
    expect(screen.getByText(/Вы отправили решение 3 раза, больше отправок нет/)).toBeInTheDocument()
    expect(screen.getByText(/пройдено 19 из 19 тестов\.$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Проверить' })).toBeInTheDocument()
  })

  it('отказ сервера по пределу (отправили в другой вкладке) убирает кнопку без сообщения об ошибке', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Решение уже отправлено 3 раза, больше отправок нет.' }, { status: 409 })))
    renderWorkspace({ submissionsLeft: 2 })
    await userEvent.click(screen.getByRole('button', { name: 'Отправить решение' }))
    expect(await screen.findByText(/Вы отправили решение 3 раза, больше отправок нет/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отправить решение' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('прочие ошибки показывает, и кнопка остаётся', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Слишком много запросов подряд. Подождите минуту и попробуйте снова.' }, { status: 429 })))
    renderWorkspace({ submissionsLeft: 2 })
    await userEvent.click(screen.getByRole('button', { name: 'Отправить решение' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Слишком много запросов подряд')
    expect(screen.getByRole('button', { name: 'Отправить решение' })).toBeInTheDocument()
  })
})
