import { useState, type ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

/** Форма Payload: название меняет тест, slug живёт в состоянии поля, как в настоящей форме. */
const form = vi.hoisted(() => ({ title: '', slug: undefined as string | undefined, showError: false, errorMessage: undefined as string | undefined }))
vi.mock('@payloadcms/ui', () => ({
  useField: () => {
    const [value, setValue] = useState(form.slug)
    return { value, setValue, showError: form.showError, errorMessage: form.errorMessage }
  },
  useFormFields: (selector: (state: [Record<string, { value: unknown } | undefined>]) => unknown) => selector([{ title: form.title ? { value: form.title } : undefined }]),
}))

const { AutoSlugField } = await import('@/components/admin/AutoSlugField')

type Props = ComponentProps<typeof AutoSlugField>
const field = { name: 'slug', type: 'text', label: 'Адрес гайда', required: true, admin: { description: 'Латиница и дефисы' } } as Props['field']

function slugForm(props: Partial<Props> = {}) {
  const view = render(<AutoSlugField field={field} path="slug" {...props} />)
  const typeTitle = (title: string) => {
    form.title = title
    view.rerender(<AutoSlugField field={field} path="slug" {...props} />)
  }
  return { typeTitle, input: screen.getByRole('textbox') }
}

beforeEach(() => {
  form.title = ''
  form.slug = undefined
  form.showError = false
  form.errorMessage = undefined
})

describe('slug из названия', () => {
  it('у нового документа следует за названием транслитом, пока его не правят', () => {
    const { typeTitle, input } = slugForm()
    expect(input).toHaveValue('')
    typeTitle('Регистрация')
    expect(input).toHaveValue('registratsiya')
    typeTitle('Регистрация в LinkedIn!')
    expect(input).toHaveValue('registratsiya-v-linkedin')
  })

  it('slug, исправленный вручную, название больше не перезаписывает', () => {
    const { typeTitle, input } = slugForm()
    typeTitle('Налоги')
    fireEvent.change(input, { target: { value: 'nalogi-2026' } })
    typeTitle('Налоги самозанятого')
    expect(input).toHaveValue('nalogi-2026')
  })

  it('у сохранённого документа slug уже в адресе — правка названия его не меняет', () => {
    form.slug = 'vpn'
    form.title = 'VPN'
    const { typeTitle, input } = slugForm()
    expect(input).toHaveValue('vpn')
    typeTitle('VPN для работы')
    expect(input).toHaveValue('vpn')
  })

  it('стёртый вручную slug снова подхватывает название', () => {
    const { typeTitle, input } = slugForm()
    typeTitle('Резюме')
    fireEvent.change(input, { target: { value: 'cv' } })
    fireEvent.change(input, { target: { value: '' } })
    typeTitle('Резюме для IT')
    expect(input).toHaveValue('rezyume-dlya-it')
  })

  it('поле подписано, обязательность и описание видны, ошибка сервера показывается под полем', () => {
    form.showError = true
    form.errorMessage = 'Такой адрес уже занят'
    slugForm()
    expect(screen.getByLabelText(/Адрес гайда/)).toHaveAttribute('name', 'slug')
    expect(screen.getByText('*')).toBeInTheDocument()
    expect(screen.getByText('Латиница и дефисы')).toBeInTheDocument()
    expect(screen.getByText('Такой адрес уже занят')).toBeInTheDocument()
  })

  it('без подписи в настройках поле называется Slug и не показывает пустые блоки', () => {
    form.errorMessage = 'Скрытая ошибка'
    render(<AutoSlugField field={{ name: 'slug', type: 'text' } as Props['field']} path="slug" />)
    expect(screen.getByLabelText('Slug')).toBeInTheDocument()
    expect(screen.queryByText('*')).not.toBeInTheDocument()
    expect(screen.queryByText('Скрытая ошибка')).not.toBeInTheDocument()
  })
})
