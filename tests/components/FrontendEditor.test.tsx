import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/trainer/CodeEditor', () => ({
  CodeEditor: ({ value, onChange, ariaLabel, readOnly }: { value: string; onChange: (value: string) => void; ariaLabel: string; readOnly: boolean }) => (
    <textarea aria-label={ariaLabel} readOnly={readOnly} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}))

import { FrontendEditor } from '@/components/trainer/FrontendEditor'

const initialFiles = { 'index.html': '<button>Нажми</button>', 'styles.css': 'button { color: red }' }

function Workspace({ onChange = vi.fn() }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState(JSON.stringify(initialFiles))
  return <FrontendEditor value={value} language="html" onChange={(next) => { setValue(next); onChange(next) }} />
}

describe('многофайловый frontend-редактор', () => {
  it('сохраняет код других файлов при редактировании и переключении', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Workspace onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Код файла index.html' }), { target: { value: '<h1>Новая страница</h1>' } })
    await user.click(screen.getByRole('button', { name: 'styles.css' }))
    expect(screen.getByRole('textbox', { name: 'Код файла styles.css' })).toHaveValue(initialFiles['styles.css'])
    await user.click(screen.getByRole('button', { name: 'index.html' }))
    expect(screen.getByRole('textbox', { name: 'Код файла index.html' })).toHaveValue('<h1>Новая страница</h1>')
    expect(JSON.parse(onChange.mock.lastCall?.[0] ?? '{}')).toEqual({ ...initialFiles, 'index.html': '<h1>Новая страница</h1>' })
  })

  it('добавляет файл в папку и переименовывает его без потери кода', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Workspace onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Файл' }))
    await user.type(screen.getByRole('textbox', { name: 'Имя нового файла' }), 'components/Button.tsx')
    await user.click(screen.getByRole('button', { name: 'Добавить' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Код файла components/Button.tsx' }), { target: { value: 'export default () => <button />' } })
    await user.click(screen.getByRole('button', { name: 'Переименовать components/Button.tsx' }))
    const nameInput = screen.getByRole('textbox', { name: 'Новое имя файла' })
    await user.clear(nameInput)
    await user.type(nameInput, 'components/Submit.tsx')
    await user.click(screen.getByRole('button', { name: 'Переименовать' }))
    expect(JSON.parse(onChange.mock.lastCall?.[0] ?? '{}')).toEqual({ ...initialFiles, 'components/Submit.tsx': 'export default () => <button />' })
    expect(screen.getByRole('textbox', { name: 'Код файла components/Submit.tsx' })).toHaveValue('export default () => <button />')
  })

  it('не перезаписывает существующий файл и отклоняет выход за папку проекта', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Workspace onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Файл' }))
    const nameInput = screen.getByRole('textbox', { name: 'Имя нового файла' })
    await user.type(nameInput, 'styles.css')
    await user.click(screen.getByRole('button', { name: 'Добавить' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Файл с таким именем уже есть')
    await user.clear(nameInput)
    await user.type(nameInput, '../secret.js')
    await user.click(screen.getByRole('button', { name: 'Добавить' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Используйте латиницу')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('удаляет только выбранный файл после подтверждения и сохраняет последний', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Workspace onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Удалить index.html' }))
    expect(onChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Удалить файл' }))
    expect(JSON.parse(onChange.mock.lastCall?.[0] ?? '{}')).toEqual({ 'styles.css': initialFiles['styles.css'] })
    expect(screen.getByRole('button', { name: 'Удалить styles.css' })).toBeDisabled()
  })

  it('предпросмотр изолирован и не обновляется при наборе кода', () => {
    const onChange = vi.fn()
    render(<FrontendEditor value={JSON.stringify(initialFiles)} onChange={onChange} language="html" previewHtml="<h1>Последний запуск</h1>" />)
    const frame = screen.getByTitle('Предпросмотр решения')
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-forms')
    expect(frame).toHaveAttribute('srcdoc', '<h1>Последний запуск</h1>')
    fireEvent.change(screen.getByRole('textbox', { name: 'Код файла index.html' }), { target: { value: '<h1>Изменено</h1>' } })
    expect(frame).toHaveAttribute('srcdoc', '<h1>Последний запуск</h1>')
  })

  it('открывает изолированный Next.js URL без srcdoc и меняет его после нового запуска', () => {
    const onChange = vi.fn()
    const value = JSON.stringify({ 'app/page.tsx': 'export default () => <h1>Next</h1>' })
    const { rerender } = render(<FrontendEditor value={value} onChange={onChange} language="next" previewUrl="https://preview.example.test/first" previewHtml="старый результат" />)
    const frame = screen.getByTitle('Предпросмотр решения')
    expect(frame).toHaveAttribute('src', 'https://preview.example.test/first')
    expect(frame).not.toHaveAttribute('srcdoc')
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-forms')
    rerender(<FrontendEditor value={value} onChange={onChange} language="next" previewUrl="https://preview.example.test/second" />)
    expect(frame).toHaveAttribute('src', 'https://preview.example.test/second')
  })

  it('даёт восстановить невалидный JSON без автоматической замены черновика', () => {
    const onChange = vi.fn()
    render(<FrontendEditor value="невалидный черновик" onChange={onChange} language="react" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Исправьте JSON')
    expect(screen.getByRole('textbox', { name: 'JSON проекта' })).toHaveValue('невалидный черновик')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('режим чтения запрещает изменения и операции с файлами', () => {
    render(<FrontendEditor value={JSON.stringify(initialFiles)} onChange={vi.fn()} language="html" readOnly />)
    expect(screen.getByRole('textbox', { name: 'Код файла index.html' })).toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'Файл' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Переименовать index.html' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Удалить index.html' })).toBeDisabled()
  })
})
