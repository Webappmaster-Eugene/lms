import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HELP_LINK, LockedSection } from '@/components/access/LockedSection'

describe('экран закрытого раздела', () => {
  it('называет раздел, объясняет его и ведёт за доступом в «Помощь»', () => {
    render(<LockedSection title="Тренажёр вам пока не открыт" description="Здесь появятся темы с задачами." />)
    const section = screen.getByRole('region', { name: 'Тренажёр вам пока не открыт' })
    expect(section).toHaveTextContent('Здесь появятся темы с задачами.')
    expect(section).toHaveTextContent('Доступ выдаёт ментор')
    expect(screen.getByRole('link', { name: '«Помощь»' })).toHaveAttribute('href', '/help#support')
  })

  it('принимает свой путь к доступу и кнопку действия', () => {
    render(
      <LockedSection
        title="Буткемп вам пока не открыт"
        description="Описание."
        help={<>Уже записались? Напишите в разделе {HELP_LINK}.</>}
        action={<a href="https://info.mentorcareer.ru/bootcamp/nodejs/">Узнать о буткемпе и записаться</a>}
      />,
    )
    expect(screen.queryByText(/Доступ выдаёт ментор/)).not.toBeInTheDocument()
    expect(screen.getByText(/Уже записались/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Узнать о буткемпе и записаться' })).toHaveAttribute('href', 'https://info.mentorcareer.ru/bootcamp/nodejs/')
  })
})
