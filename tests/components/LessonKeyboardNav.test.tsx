import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const { LessonKeyboardNav } = await import('@/components/lesson/LessonKeyboardNav')

/** Листание уроков стрелками не должно мешать набору текста. */

describe('стрелки между уроками', () => {
  beforeEach(() => push.mockClear())

  it('→ и ← ведут к соседним урокам', () => {
    render(<LessonKeyboardNav prevHref="/lessons/a" nextHref="/lessons/c" />)

    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' })

    expect(push.mock.calls).toEqual([['/lessons/c'], ['/lessons/a']])
  })

  it('в заметке или комментарии стрелки двигают курсор, а не страницу', () => {
    render(
      <>
        <LessonKeyboardNav prevHref="/lessons/a" nextHref="/lessons/c" />
        <textarea aria-label="заметка" />
        <input aria-label="поиск" />
      </>,
    )

    fireEvent.keyDown(document.querySelector('textarea') as HTMLElement, { key: 'ArrowRight' })
    fireEvent.keyDown(document.querySelector('input') as HTMLElement, { key: 'ArrowLeft' })

    expect(push).not.toHaveBeenCalled()
  })

  it('с модификаторами не срабатывает: Alt+← — это «назад» браузера', () => {
    render(<LessonKeyboardNav prevHref="/lessons/a" nextHref="/lessons/c" />)

    fireEvent.keyDown(document.body, { key: 'ArrowLeft', altKey: true })
    fireEvent.keyDown(document.body, { key: 'ArrowRight', metaKey: true })

    expect(push).not.toHaveBeenCalled()
  })

  it('на первом уроке ← ничего не делает', () => {
    render(<LessonKeyboardNav prevHref={null} nextHref="/lessons/c" />)

    fireEvent.keyDown(document.body, { key: 'ArrowLeft' })

    expect(push).not.toHaveBeenCalled()
  })
})
