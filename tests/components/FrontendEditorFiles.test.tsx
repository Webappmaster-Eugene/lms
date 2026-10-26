import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CodeEditorProps } from '@/components/trainer/CodeEditor'

vi.mock('@/components/trainer/CodeEditor', () => ({
  CodeEditor: ({ value, onChange, ariaLabel, editorLanguage }: CodeEditorProps) => (
    <textarea aria-label={ariaLabel} data-editor-language={editorLanguage} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}))

const { FrontendEditor } = await import('@/components/trainer/FrontendEditor')

/**
 * Файлы frontend-проекта: подсветка по расширению, отмена операций и лимит
 * файлов. В комнате собеседования проект может измениться у собеседника, пока
 * у ученика открыта форма, — поэтому лимит проверяется и при отправке формы.
 */

const project = {
  'index.html': '<div id="root"></div>',
  'styles.css': 'body { margin: 0 }',
  'data.json': '{"items": []}',
  'App.tsx': 'export default () => null',
  'main.js': 'console.log(1)',
}

function manyFiles(count: number) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [`file${index}.js`, '']))
}

describe('файлы frontend-проекта', () => {
  it('каждый файл открывается с подсветкой своего языка', async () => {
    const user = userEvent.setup()
    render(<FrontendEditor value={JSON.stringify(project)} onChange={vi.fn()} language="react" />)

    const expected = { 'index.html': 'html', 'styles.css': 'css', 'data.json': 'json', 'App.tsx': 'typescript', 'main.js': 'javascript' }
    for (const [name, language] of Object.entries(expected)) {
      await user.click(screen.getByRole('button', { name }))
      expect(screen.getByRole('textbox', { name: `Код файла ${name}` })).toHaveAttribute('data-editor-language', language)
    }
  })

  it('выбранный файл помечен и связан с областью редактора', async () => {
    const user = userEvent.setup()
    render(<FrontendEditor value={JSON.stringify(project)} onChange={vi.fn()} language="react" />)

    await user.click(screen.getByRole('button', { name: 'styles.css' }))

    const tab = screen.getByRole('button', { name: 'styles.css' })
    expect(tab).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'index.html' })).toHaveAttribute('aria-pressed', 'false')
    const region = document.getElementById(tab.getAttribute('aria-controls') ?? '')
    expect(region).toContainElement(screen.getByRole('textbox', { name: 'Код файла styles.css' }))
  })

  it('«Отмена» в форме имени закрывает её, не меняя проект', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FrontendEditor value={JSON.stringify(project)} onChange={onChange} language="react" />)

    await user.click(screen.getByRole('button', { name: 'Файл' }))
    await user.type(screen.getByRole('textbox', { name: 'Имя нового файла' }), 'Button.tsx')
    await user.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(screen.queryByRole('textbox', { name: 'Имя нового файла' })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('«Отмена» удаления оставляет файл на месте', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FrontendEditor value={JSON.stringify(project)} onChange={onChange} language="react" />)

    await user.click(screen.getByRole('button', { name: 'Удалить index.html' }))
    expect(screen.getByText('Удалить файл «index.html» вместе с его кодом?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(screen.queryByText(/вместе с его кодом/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'index.html' })).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('переименование в то же имя не считается конфликтом', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FrontendEditor value={JSON.stringify(project)} onChange={onChange} language="react" />)

    await user.click(screen.getByRole('button', { name: 'Переименовать index.html' }))
    await user.click(screen.getByRole('button', { name: 'Переименовать' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(JSON.parse(onChange.mock.calls[0][0])).toEqual(project)
  })

  it('ошибка в имени связана с полем, чтобы её прочитал скринридер', async () => {
    const user = userEvent.setup()
    render(<FrontendEditor value={JSON.stringify(project)} onChange={vi.fn()} language="react" />)

    await user.click(screen.getByRole('button', { name: 'Файл' }))
    const input = screen.getByRole('textbox', { name: 'Имя нового файла' })
    expect(input).toHaveAttribute('aria-invalid', 'false')
    await user.type(input, 'script.php')
    await user.click(screen.getByRole('button', { name: 'Добавить' }))

    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/Используйте латиницу/)
  })

  it('при 32 файлах новый не добавить ни кнопкой, ни формой, открытой до изменения проекта', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const view = render(<FrontendEditor value={JSON.stringify(manyFiles(31))} onChange={onChange} language="html" />)
    await user.click(screen.getByRole('button', { name: 'Файл' }))
    await user.type(screen.getByRole('textbox', { name: 'Имя нового файла' }), 'extra.css')

    view.rerender(<FrontendEditor value={JSON.stringify(manyFiles(32))} onChange={onChange} language="html" />)
    expect(screen.getByRole('button', { name: 'Файл' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Добавить' }))

    expect(screen.getByRole('alert')).toHaveTextContent('В проекте уже 32 файла')
    expect(onChange).not.toHaveBeenCalled()
  })
})
