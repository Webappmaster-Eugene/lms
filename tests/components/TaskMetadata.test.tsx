import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskMetadata } from '@/components/trainer/TaskMetadata'
import { TrainerCatalogLink } from '@/components/trainer/TrainerCatalogLink'

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

const checkedAt = '2026-10-10'

describe('метаданные задачи и подтверждения компаний', () => {
  it('задача без новых необязательных сведений не получает выдуманный формат и время', () => {
    const { container } = render(<TaskMetadata task={{}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('карточка остаётся одной ссылкой и показывает формат, тренировочное время, теги и честную метку компании', () => {
    render(<TrainerCatalogLink allowed href="/trainer/go/task" className=""><TaskMetadata compact task={{ interviewFormat: 'livecoding', recommendedMinutes: 25, tags: ['concurrency'], companies: ['google'], sourceUrl: 'https://example.org/task', leetcodeNumber: 53 }} /></TrainerCatalogLink>)
    expect(screen.getByText('Лайвкодинг')).toBeInTheDocument()
    expect(screen.getByText('Тренировка: 25 мин')).toBeInTheDocument()
    expect(screen.getByText('Конкурентность')).toBeInTheDocument()
    expect(screen.getByText('Google: Источник не подтверждён')).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/trainer/go/task')
    expect(screen.queryByText('Источник задачи')).not.toBeInTheDocument()
  })

  it('различает официальный пример, рассказ кандидата и подготовку по рекомендациям', () => {
    render(<TaskMetadata task={{ companies: ['google', 'meta', 'amazon'], companyEvidence: [
      { company: 'google', kind: 'official', url: 'https://example.org/official', note: 'Опубликованный пример компании.', checkedAt },
      { company: 'meta', kind: 'candidate-report', url: 'https://example.org/report', note: 'Рассказ одного кандидата.', checkedAt },
      { company: 'amazon', kind: 'preparation', url: 'https://example.org/preparation', note: 'Адаптировано для подготовки.', checkedAt },
    ] }} />)
    for (const label of ['Google: Официальный пример', 'Meta: Рассказ кандидата', 'Amazon: Подготовка по рекомендациям компании']) expect(screen.getByText(label)).toBeInTheDocument()
    for (const company of ['Google', 'Meta', 'Amazon']) {
      const link = screen.getByRole('link', { name: `Источник метки «${company}»` })
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'nofollow noopener noreferrer')
    }
    expect(screen.getByText(/Рассказ одного кандидата/)).toBeInTheDocument()
  })

  it('не превращает историческую метку компании в доказательство и не открывает небезопасную ссылку', () => {
    render(<TaskMetadata task={{ companies: ['yandex'], sourceUrl: 'javascript:alert(1)', companyEvidence: [{ company: 'yandex', kind: 'official', url: 'javascript:alert(2)', note: 'Непроверенное утверждение', checkedAt }] }} />)
    expect(screen.getByText('Яндекс: Источник не подтверждён')).toBeInTheDocument()
    expect(screen.getByText(/Это не означает, что задачу задавали/)).toBeInTheDocument()
    expect(screen.getByText('Ссылка на источник задачи недоступна.')).toBeInTheDocument()
    expect(screen.queryByText('Непроверенное утверждение')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('ссылка на LeetCode и источники доступны с клавиатуры без подмены тренировочного времени длительностью интервью', async () => {
    const user = userEvent.setup()
    render(<TaskMetadata task={{ recommendedMinutes: 30, sourceUrl: 'https://leetcode.com/problems/two-sum/', leetcodeNumber: 1, companyEvidence: [{ company: 'google', kind: 'official', url: 'https://example.org/source', note: 'Официальный учебный пример.', checkedAt }] }} />)
    expect(screen.getByText(/Время — ориентир для самостоятельной тренировки/)).toBeInTheDocument()
    const source = screen.getByRole('link', { name: 'Источник задачи' })
    const leetcode = screen.getByRole('link', { name: 'LeetCode #1' })
    expect(leetcode).toHaveAttribute('href', 'https://leetcode.com/problems/two-sum/')
    await user.tab()
    expect(source).toHaveFocus()
    await user.tab()
    expect(leetcode).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('link', { name: 'Источник метки «Google»' })).toHaveFocus()
  })

  it('номер LeetCode без адреса задачи открывает поиск по номеру', () => {
    render(<TaskMetadata task={{ leetcodeNumber: 53 }} />)
    expect(screen.getByRole('link', { name: 'LeetCode #53' })).toHaveAttribute('href', 'https://leetcode.com/problemset/?search=53')
  })

  it('не выводит неизвестные служебные значения и неверное время', () => {
    const { container } = render(<TaskMetadata task={{ interviewFormat: '__unknown_format', recommendedMinutes: Number.NaN, tags: ['__unknown_tag'], companies: ['__unknown_company'], leetcodeNumber: -1 }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
