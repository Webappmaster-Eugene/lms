import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { OutputPanel } from '@/components/trainer/OutputPanel'
import { HintsAccordion } from '@/components/trainer/HintsAccordion'

/**
 * Вывод тренажёра и подсказки.
 *
 * Панель вывода — единственное, по чему ученик понимает результат прогона,
 * поэтому у каждого исхода должно быть своё сообщение: пустая панель читается
 * как «ничего не произошло».
 */

const idle = { output: '', error: null, timedOut: false, passed: null, isRunning: false }

describe('панель вывода', () => {
  describe('состояния прогона', () => {
    it('до первого запуска подсказывает, что делать', () => {
      render(<OutputPanel {...idle} />)

      expect(screen.getByText(/Нажмите/)).toBeInTheDocument()
    })

    it('во время прогона показывает, что идёт выполнение', () => {
      render(<OutputPanel {...idle} isRunning />)

      expect(screen.getByText('Выполняется...')).toBeInTheDocument()
    })

    it('во время прогона старый результат не показывается', () => {
      render(<OutputPanel {...idle} isRunning output="старый вывод" passed />)

      expect(screen.queryByText('старый вывод')).not.toBeInTheDocument()
    })
  })

  describe('исход', () => {
    it('успех назван прямо', () => {
      render(<OutputPanel {...idle} passed output="15" />)

      expect(screen.getByText(/решена верно/)).toBeInTheDocument()
    })

    it('неуспех объясняет причину', () => {
      render(<OutputPanel {...idle} passed={false} output="14" />)

      expect(screen.getByText(/не совпадает с ожидаемым/)).toBeInTheDocument()
    })

    it('вывод программы показывается', () => {
      render(<OutputPanel {...idle} passed output="15" />)

      expect(screen.getByText('15')).toBeInTheDocument()
    })
  })

  describe('ошибки', () => {
    it('превышение времени названо отдельно от обычной ошибки', () => {
      render(<OutputPanel {...idle} timedOut passed={false} />)

      expect(screen.getByText(/Превышено время/)).toBeInTheDocument()
    })

    it('при таймауте текст ошибки не дублируется', () => {
      render(<OutputPanel {...idle} timedOut error="Script execution timed out" passed={false} />)

      expect(screen.queryByText('Script execution timed out')).not.toBeInTheDocument()
    })

    it('ошибка выполнения показывается как есть — по ней ученик чинит код', () => {
      render(<OutputPanel {...idle} error="ReferenceError: solve is not defined" passed={false} />)

      expect(screen.getByText('ReferenceError: solve is not defined')).toBeInTheDocument()
    })

    it('переносы строк в ошибке сохраняются', () => {
      const { container } = render(<OutputPanel {...idle} error="строка 1\nстрока 2" passed={false} />)

      expect(container.querySelector('pre')?.className).toContain('whitespace-pre-wrap')
    })
  })
})

describe('подсказки к задаче', () => {
  const hints = [
    { id: 'h1', hint: 'Вспомните про замыкание' },
    { id: 'h2', hint: 'Счётчик хранится снаружи функции' },
    { id: 'h3', hint: 'Возвращайте функцию' },
  ]

  it('без подсказок блок не занимает место', () => {
    const { container } = render(<HintsAccordion hints={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('счётчик показывает, сколько открыто из скольки', () => {
    render(<HintsAccordion hints={hints} />)

    expect(screen.getByText('Подсказки (0/3)')).toBeInTheDocument()
  })

  it('сначала тексты скрыты — иначе решение спойлерится сразу', () => {
    render(<HintsAccordion hints={hints} />)

    expect(screen.queryByText('Вспомните про замыкание')).not.toBeInTheDocument()
  })

  it('открыть можно только следующую по очереди', () => {
    render(<HintsAccordion hints={hints} />)

    expect(screen.getByRole('button', { name: /Показать подсказку 1/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Показать подсказку 2/ })).not.toBeInTheDocument()
  })

  it('дальние подсказки объясняют, почему недоступны', () => {
    render(<HintsAccordion hints={hints} />)

    expect(screen.getByText(/Подсказка 2 \(сначала откройте предыдущую\)/)).toBeInTheDocument()
  })

  it('открытая подсказка показывает текст', async () => {
    const user = userEvent.setup()
    render(<HintsAccordion hints={hints} />)

    await user.click(screen.getByRole('button', { name: /Показать подсказку 1/ }))

    expect(screen.getByText('Вспомните про замыкание')).toBeInTheDocument()
  })

  it('открытие сдвигает очередь и счётчик', async () => {
    const user = userEvent.setup()
    render(<HintsAccordion hints={hints} />)

    await user.click(screen.getByRole('button', { name: /Показать подсказку 1/ }))

    expect(screen.getByText('Подсказки (1/3)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Показать подсказку 2/ })).toBeInTheDocument()
  })

  it('открытые подсказки остаются на экране', async () => {
    const user = userEvent.setup()
    render(<HintsAccordion hints={hints} />)

    await user.click(screen.getByRole('button', { name: /Показать подсказку 1/ }))
    await user.click(screen.getByRole('button', { name: /Показать подсказку 2/ }))

    expect(screen.getByText('Вспомните про замыкание')).toBeInTheDocument()
    expect(screen.getByText('Счётчик хранится снаружи функции')).toBeInTheDocument()
  })

  it('после последней подсказки кнопок не остаётся', async () => {
    const user = userEvent.setup()
    render(<HintsAccordion hints={[hints[0]]} />)

    await user.click(screen.getByRole('button', { name: /Показать подсказку 1/ }))

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Подсказки (1/1)')).toBeInTheDocument()
  })

  it('подсказки без id не ломают список', () => {
    render(<HintsAccordion hints={[{ hint: 'Первая' }, { hint: 'Вторая' }]} />)

    expect(screen.getByText('Подсказки (0/2)')).toBeInTheDocument()
  })
})
