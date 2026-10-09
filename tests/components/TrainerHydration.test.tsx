import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { setNavigationURL } from '../helpers/url-navigation'
import userEvent from '@testing-library/user-event'
import type { ClientTaskSpec } from '@/lib/trainer/api'

const state = vi.hoisted(() => ({ hydrated: false }))
const run = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/use-hydrated', () => ({ useHydrated: () => state.hydrated }))
vi.mock('next/navigation', async () => (await import('../helpers/url-navigation')).urlNavigationMock())
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/components/trainer/useCodeRunner', () => ({ useCodeRunner: () => ({ run }) }))
vi.mock('@/components/trainer/CodeEditor', () => ({ CodeEditor: (props: { value: string; readOnly: boolean; onChange: (code: string) => void }) =>
  <textarea aria-label="Код решения" value={props.value} readOnly={props.readOnly} onChange={event => props.onChange(event.target.value)} />,
}))
import { TrainerWorkspace } from '@/components/trainer/TrainerWorkspace'

const task: ClientTaskSpec = { id: 'hydration-task', slug: 'hydration-task', topicSlug: 'core', title: 'Сумма', difficulty: 'easy', checkMode: 'unit', languages: ['js'], entryName: 'sum', setupCode: '', testCode: '', publicCases: [], hiddenCaseCount: 0, timeLimitMs: 1000, starters: { js: 'function sum() {}' }, pointsReward: 10 }
const progress = { isCompleted: false, attempts: 0, failedAttempts: 0, savedCode: null, savedLanguage: null }

describe('готовность черновика до ввода', () => {
  beforeEach(() => { setNavigationURL('/trainer/tasks/hydration-task'); state.hydrated = false; localStorage.clear(); run.mockReset(); run.mockResolvedValue({ status: 'passed', tests: [], passedCount: 1, totalCount: 1, consoleOutput: [], totalMs: 0 }) })
  it('не принимает ввод и запуск до восстановления, затем сохраняет новый код', async () => {
    const user = userEvent.setup()
    localStorage.setItem('lms.trainer.draft.hydration-task.js', 'сохранённый черновик')
    const view = render(<TrainerWorkspace task={task} progress={progress} />)
    expect(screen.getByRole('textbox', { name: 'Код решения' })).toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()
    state.hydrated = true
    view.rerender(<TrainerWorkspace task={task} progress={progress} />)
    const input = screen.getByRole('textbox', { name: 'Код решения' })
    expect(input).toHaveValue('сохранённый черновик')
    expect(input).not.toHaveAttribute('readonly')
    await user.clear(input)
    await user.type(input, 'новое решение')
    view.rerender(<TrainerWorkspace task={task} progress={progress} />)
    expect(input).toHaveValue('новое решение')
    await user.click(screen.getByRole('button', { name: 'Запустить' }))
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ userCode: 'новое решение' }))
  })
})
