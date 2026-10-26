import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

import type { LearningHistoryEntry } from '@/lib/learning-history'

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

const { CertificateActions } = await import('@/components/certificate/CertificateActions')
const { LearningHistoryList, RecentLearningCourses } = await import('@/components/learning/LearningHistory')
const { FaqAccordion } = await import('@/components/help/FaqAccordion')

/** Сертификат, история обучения и справка: граничные данные и доступность. */

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'clipboard')
})

/** В jsdom нет буфера обмена: подставляем его так, как он виден странице. */
function clipboard(writeText: (text: string) => Promise<void>) {
  const write = vi.fn(writeText)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: write } })
  return write
}

describe('копирование ссылки на сертификат', () => {
  it('подтверждение «Ссылка скопирована» через две секунды возвращается к исходной кнопке', async () => {
    vi.useFakeTimers()
    const write = clipboard(async () => undefined)
    render(<CertificateActions />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку' })) })
    expect(write).toHaveBeenCalledWith(window.location.href)
    expect(screen.getByRole('button', { name: 'Ссылка скопирована' })).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole('button', { name: 'Скопировать ссылку' })).toBeInTheDocument()
  })

  it('удачная повторная попытка убирает сообщение о прошлом сбое', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let attempt = 0
    const write = clipboard(async () => { attempt += 1; if (attempt === 1) throw new Error('denied') })
    render(<CertificateActions />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку' })) })
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось скопировать')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку' })) })

    expect(write).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('история обучения: граничные данные', () => {
  const entry = (overrides: Partial<LearningHistoryEntry> = {}): LearningHistoryEntry => ({
    lessonId: 1, title: 'Замыкания', courseId: 10, course: 'JavaScript', courseSlug: 'js', href: '/lessons/closures',
    lastViewedAt: '2026-10-10T12:00:00Z', isCompleted: false, ...overrides,
  })

  it('время просмотра показывается по Москве, а нераспознанная дата — словом «Недавно»', () => {
    render(<LearningHistoryList entries={[entry(), entry({ lessonId: 2, lastViewedAt: 'вчера' })]} />)

    const times = screen.getAllByRole('listitem').map((item) => item.querySelector('time')?.textContent)
    expect(times).toEqual(['10 октября в 15:00 МСК', 'Недавно'])
  })

  it('видео без сохранённой секунды предлагает продолжить с начала', () => {
    render(<LearningHistoryList entries={[entry({ videoTitle: 'Практика', seconds: undefined, ended: false })]} />)

    expect(screen.getByText('Практика · Остановились на 0:00')).toBeInTheDocument()
  })

  it('блок «Ваше обучение» на странице истории не ссылается сам на себя', () => {
    render(<RecentLearningCourses entries={[entry()]} showHistoryLink={false} />)

    expect(screen.getByRole('heading', { name: 'Ваше обучение' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'История обучения' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Все просмотры этого курса' })).toHaveAttribute('href', '/learning-history?course=10')
  })
})

describe('вопросы и ответы в справке', () => {
  const items = [{ id: 1, question: 'Как получить доступ?', answerText: 'По приглашению от ментора.\nПисьмо придёт на почту.' }]

  it('ответ раскрывается с клавиатуры и сохраняет переносы строк', () => {
    render(<FaqAccordion items={items} />)
    const toggle = screen.getByRole('button', { name: 'Как получить доступ?' })

    toggle.focus()
    fireEvent.click(toggle)

    const answer = screen.getByText(/По приглашению от ментора/)
    expect(answer.textContent).toBe('По приглашению от ментора.\nПисьмо придёт на почту.')
    expect(answer).toHaveClass('whitespace-pre-wrap')
  })

  it('пустой список объясняет, что вопросов пока нет', () => {
    render(<FaqAccordion items={[]} />)

    expect(screen.getByText('Пока нет часто задаваемых вопросов')).toBeInTheDocument()
  })

  // Дефект: кнопка вопроса (FaqAccordion.tsx:32) не сообщает состояние через aria-expanded и не связана
  // с ответом aria-controls. Экранный диктор не говорит, раскрыт ли ответ, — шаблон WAI-ARIA Accordion нарушен.
  it.fails('кнопка вопроса сообщает, раскрыт ли ответ — дефект: нет aria-expanded', () => {
    render(<FaqAccordion items={items} />)
    const toggle = screen.getByRole('button', { name: 'Как получить доступ?' })

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })
})
